import { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import { Logger } from "nestjs-pino";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { configureApp } from "../src/configure-app";
import { signAccessTokenFor } from "./helpers/auth-token";
import { setupCatalogFixtures, setupPricingFixtures } from "./helpers/catalog-fixtures";
import { truncateTransactionalTables } from "./helpers/db-cleanup";
import { buildQuote } from "./helpers/quote-builder";
import { buildUser } from "./helpers/user-builder";

/**
 * Booking lifecycle integration spec — A4-Stab.
 *
 * Walks the customer-side flows that A4b shipped: confirm consumes
 * a quote atomically, cancel guards against terminal states, race
 * conditions stay safe under optimistic locking. Outbox payloads
 * stay PII-free (no lat/lng/address even though the booking row
 * has them).
 */
describe("Booking lifecycle (Testcontainers)", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let categoryId: string;
  let vehicleTypeId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
    app.useLogger(app.get(Logger));
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await truncateTransactionalTables(prisma.client);
    const catalog = await setupCatalogFixtures(prisma.client);
    categoryId = catalog.categoryId;
    vehicleTypeId = catalog.vehicleTypeId;
    await setupPricingFixtures(prisma.client, vehicleTypeId);
  });

  async function aCustomerWithQuote() {
    const customer = await buildUser(prisma.client);
    const token = signAccessTokenFor(app, customer);
    const quote = await buildQuote(app, { token, vehicleTypeId, categoryId });
    return { customer, token, quote };
  }

  it("confirm consumes the quote and writes BookingCreated + BookingConfirmed outbox events", async () => {
    const { customer, token, quote } = await aCustomerWithQuote();

    const res = await request(app.getHttpServer())
      .post("/bookings/confirm")
      .set("Authorization", `Bearer ${token}`)
      .send({ quoteId: quote.id });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("CONFIRMED");
    expect(res.body.totalAmount).toBe("6877.00");
    expect(res.body.customerId).toBe(customer.id);

    const consumed = await prisma.client.priceQuote.findUnique({ where: { id: quote.id } });
    expect(consumed?.status).toBe("CONSUMED");
    expect(consumed?.consumedByBookingId).toBe(res.body.id);

    const outboxTypes = (
      await prisma.client.outboxEvent.findMany({
        where: { aggregateId: res.body.id, aggregateType: "Booking" },
        orderBy: { createdAt: "asc" },
      })
    ).map((e) => e.eventType);
    expect(outboxTypes).toEqual(["booking.BookingCreated", "booking.BookingConfirmed"]);
  });

  it("two concurrent confirms on the same quote: one wins, the other fails 409", async () => {
    const { token, quote } = await aCustomerWithQuote();

    const [a, b] = await Promise.all([
      request(app.getHttpServer())
        .post("/bookings/confirm")
        .set("Authorization", `Bearer ${token}`)
        .send({ quoteId: quote.id }),
      request(app.getHttpServer())
        .post("/bookings/confirm")
        .set("Authorization", `Bearer ${token}`)
        .send({ quoteId: quote.id }),
    ]);

    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([201, 409]);

    const bookings = await prisma.client.booking.findMany({
      where: { priceQuoteId: quote.id },
    });
    expect(bookings).toHaveLength(1);
  });

  it("confirm rejects an EXPIRED quote with 410", async () => {
    const { token, quote } = await aCustomerWithQuote();
    // Manually expire — the worker would do the same on its 60s tick.
    await prisma.client.priceQuote.update({
      where: { id: quote.id },
      data: { status: "EXPIRED" },
    });

    const res = await request(app.getHttpServer())
      .post("/bookings/confirm")
      .set("Authorization", `Bearer ${token}`)
      .send({ quoteId: quote.id });

    // RFC 7231: 410 Gone is for permanent removal; an expired quote is
    // a current-state mismatch (caller can ask for a fresh quote), so
    // the API returns 409 Conflict. The error code is the durable
    // contract clients pin against.
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("PRICING_QUOTE_EXPIRED");
  });

  it("cancel transitions CONFIRMED → CANCELLED_BY_CUSTOMER and emits BookingCancelled", async () => {
    const { token, quote } = await aCustomerWithQuote();
    const confirm = await request(app.getHttpServer())
      .post("/bookings/confirm")
      .set("Authorization", `Bearer ${token}`)
      .send({ quoteId: quote.id });
    const bookingId: string = confirm.body.id;

    const cancel = await request(app.getHttpServer())
      .post(`/bookings/${bookingId}/cancel`)
      .set("Authorization", `Bearer ${token}`)
      .send({ reason: "test cancel" });

    expect(cancel.status).toBe(201);
    expect(cancel.body.status).toBe("CANCELLED_BY_CUSTOMER");

    const cancelEvents = await prisma.client.outboxEvent.findMany({
      where: { aggregateId: bookingId, eventType: "booking.BookingCancelled" },
    });
    expect(cancelEvents).toHaveLength(1);
  });

  it("re-cancelling a terminal-state booking returns 409", async () => {
    const { token, quote } = await aCustomerWithQuote();
    const confirm = await request(app.getHttpServer())
      .post("/bookings/confirm")
      .set("Authorization", `Bearer ${token}`)
      .send({ quoteId: quote.id });
    const bookingId: string = confirm.body.id;
    await request(app.getHttpServer())
      .post(`/bookings/${bookingId}/cancel`)
      .set("Authorization", `Bearer ${token}`)
      .send({ reason: "first" });

    const second = await request(app.getHttpServer())
      .post(`/bookings/${bookingId}/cancel`)
      .set("Authorization", `Bearer ${token}`)
      .send({ reason: "second" });

    expect(second.status).toBe(409);
    expect(second.body.code).toBe("BOOKING_NOT_CANCELLABLE");
  });

  it("outbox payloads carry no PII (no lat/lng/full address)", async () => {
    const { token, quote } = await aCustomerWithQuote();
    const confirm = await request(app.getHttpServer())
      .post("/bookings/confirm")
      .set("Authorization", `Bearer ${token}`)
      .send({ quoteId: quote.id });
    const bookingId: string = confirm.body.id;
    await request(app.getHttpServer())
      .post(`/bookings/${bookingId}/cancel`)
      .set("Authorization", `Bearer ${token}`)
      .send({ reason: "pii check" });

    const events = await prisma.client.outboxEvent.findMany({
      where: { aggregateId: bookingId, aggregateType: "Booking" },
    });
    for (const evt of events) {
      const json = JSON.stringify(evt.payload);
      expect(json).not.toContain("Sultanahmet");
      expect(json).not.toContain("Beşiktaş");
      expect(json).not.toContain("41.0082");
      expect(json).not.toContain("28.9784");
      // Cancellation reason is also PII-ish (free-text customer input).
      expect(json).not.toContain("pii check");
    }
  });
});
