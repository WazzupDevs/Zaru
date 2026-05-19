import { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import { Logger } from "nestjs-pino";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { AppModule } from "../src/app.module";
import { signAccessTokenFor } from "./helpers/auth-token";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { configureApp } from "../src/configure-app";
import { setupCatalogFixtures, setupPricingFixtures } from "./helpers/catalog-fixtures";
import { truncateTransactionalTables } from "./helpers/db-cleanup";
import { drainAndProcess } from "./helpers/drain-and-process";
import { buildDriver } from "./helpers/driver-builder";
import { buildQuote } from "./helpers/quote-builder";
import { buildUser } from "./helpers/user-builder";
import { BookingDispatchService } from "../src/modules/dispatch/infrastructure/workers/booking-dispatch.service";
import {
  SMS_SENDER_PORT,
  type SmsSenderPort,
} from "../src/modules/notifications/application/ports/sms-sender.port";
import { MockSmsSender } from "../src/modules/notifications/infrastructure/senders/mock-sms-sender";

/**
 * Driver offer lifecycle, end-to-end via HTTP (Testcontainers).
 * A4f-2b-2 adds the controller surface + the customer notification
 * chain; this spec walks the happy path so mobile A4f-2b-3 can be
 * built against a verified backend.
 */
describe("Driver offer lifecycle (Testcontainers)", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let mockSms: MockSmsSender;
  let dispatchService: BookingDispatchService;
  let categoryId: string;
  let vehicleTypeId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
    app.useLogger(app.get(Logger));
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    dispatchService = app.get(BookingDispatchService);
    const sender = app.get<SmsSenderPort>(SMS_SENDER_PORT);
    if (!(sender instanceof MockSmsSender)) {
      throw new Error("test setup expects MockSmsSender (NETGSM_USERCODE=DUMMY_*)");
    }
    mockSms = sender;
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
    mockSms.clear();
    mockSms.clearFailure();
  });

  const flush = (): Promise<void> => drainAndProcess(app, { swallowNotificationErrors: true });

  async function aConfirmedBookingWithDriverInRadius() {
    const customer = await buildUser(prisma.client);
    const customerToken = signAccessTokenFor(app, customer);
    const driver = await buildDriver(prisma.client, {
      vehicleTypeId,
      lat: 41.009,
      lng: 28.98,
    });
    const driverToken = signAccessTokenFor(app, driver.user);
    const quote = await buildQuote(app, {
      token: customerToken,
      vehicleTypeId,
      categoryId,
    });
    const confirm = await request(app.getHttpServer())
      .post("/bookings/confirm")
      .set("Authorization", `Bearer ${customerToken}`)
      .send({ quoteId: quote.id });
    return {
      customer,
      customerToken,
      driver,
      driverToken,
      bookingId: confirm.body.id as string,
    };
  }

  async function sweepAndGetOfferId(bookingId: string): Promise<string> {
    await dispatchService.sweep();
    const offer = await prisma.client.driverOffer.findFirstOrThrow({
      where: { bookingId },
    });
    return offer.id;
  }

  it("GET /dispatch/offers/:offerId returns enriched detail with masked phone + earnings", async () => {
    const { customer, driver, driverToken, bookingId } =
      await aConfirmedBookingWithDriverInRadius();
    const offerId = await sweepAndGetOfferId(bookingId);

    const res = await request(app.getHttpServer())
      .get(`/dispatch/offers/${offerId}`)
      .set("Authorization", `Bearer ${driverToken}`);

    expect(res.status).toBe(200);
    expect(res.body.offerId).toBe(offerId);
    expect(res.body.bookingId).toBe(bookingId);
    expect(res.body.status).toBe("PENDING");
    expect(res.body.vehicle).toEqual({
      brand: "Renault",
      model: "Symbol",
      plateNumber: driver.plateNumber,
    });
    // PII discipline at the data boundary — full phone never leaves
    // the DB into a driver response.
    expect(res.body.customer.phoneMasked).not.toContain(customer.phoneE164);
    expect(res.body.customer.phoneMasked).toMatch(/^\+\d{2}\d{3}\*\*\*\d{4}$/);
    expect(JSON.stringify(res.body)).not.toContain(customer.phoneE164);
    expect(res.body.booking.totalAmount.currency).toBe("TRY");
    expect(res.body.driverEarnings.amount).toMatch(/^\d+\.\d{2}$/);
  });

  it("POST /accept transitions booking to DRIVER_ASSIGNED + fires customer SMS", async () => {
    const { customer, driverToken, bookingId } = await aConfirmedBookingWithDriverInRadius();
    const offerId = await sweepAndGetOfferId(bookingId);

    const acceptRes = await request(app.getHttpServer())
      .post(`/dispatch/offers/${offerId}/accept`)
      .set("Authorization", `Bearer ${driverToken}`);
    expect(acceptRes.status).toBe(200);
    expect(acceptRes.body.status).toBe("ACCEPTED");

    const booking = await prisma.client.booking.findUnique({ where: { id: bookingId } });
    expect(booking?.status).toBe("DRIVER_ASSIGNED");

    await flush();
    const sms = mockSms.getLastFor(customer.phoneE164);
    expect(sms?.message).toMatch(/sürücünüz atandı/i);
  });

  it("POST /reject sets a cooldown + emits DriverOfferRejected outbox", async () => {
    const { driverToken, driver, bookingId } = await aConfirmedBookingWithDriverInRadius();
    const offerId = await sweepAndGetOfferId(bookingId);

    const rejectRes = await request(app.getHttpServer())
      .post(`/dispatch/offers/${offerId}/reject`)
      .set("Authorization", `Bearer ${driverToken}`)
      .send({ reason: "TOO_FAR", note: "outside my zone" });
    expect(rejectRes.status).toBe(200);
    expect(rejectRes.body.status).toBe("REJECTED");

    const cooldown = await prisma.client.driverDispatchCooldown.findUnique({
      where: {
        driverProfileId_bookingId: {
          driverProfileId: driver.driverProfileId,
          bookingId,
        },
      },
    });
    expect(cooldown).not.toBeNull();
    expect(cooldown!.expiresAt.getTime()).toBeGreaterThan(Date.now());

    const evt = await prisma.client.outboxEvent.findFirst({
      where: { aggregateId: bookingId, eventType: "dispatch.DriverOfferRejected" },
    });
    expect(evt).not.toBeNull();
  });

  it("PATCH /status walks ON_THE_WAY → ARRIVED → IN_PROGRESS → COMPLETED and fires a customer SMS per step", async () => {
    const { customer, driverToken, bookingId } = await aConfirmedBookingWithDriverInRadius();
    const offerId = await sweepAndGetOfferId(bookingId);

    await request(app.getHttpServer())
      .post(`/dispatch/offers/${offerId}/accept`)
      .set("Authorization", `Bearer ${driverToken}`);
    await flush();
    mockSms.clear();

    for (const step of ["ON_THE_WAY", "ARRIVED", "IN_PROGRESS", "COMPLETED"] as const) {
      const res = await request(app.getHttpServer())
        .patch(`/dispatch/offers/${offerId}/status`)
        .set("Authorization", `Bearer ${driverToken}`)
        .send({ status: step });
      expect(res.status, `PATCH ${step}`).toBe(200);
      expect(res.body.status).toBe(step);
      await flush();
    }

    const finalBooking = await prisma.client.booking.findUnique({ where: { id: bookingId } });
    expect(finalBooking?.status).toBe("COMPLETED");

    const customerSmsKinds = new Set(
      (
        await prisma.client.notification.findMany({
          where: {
            recipientPhone: customer.phoneE164,
            sourceAggregateId: bookingId,
            status: "SENT",
          },
        })
      ).map((n) => n.kind),
    );
    expect(customerSmsKinds).toContain("DRIVER_ON_THE_WAY");
    expect(customerSmsKinds).toContain("DRIVER_ARRIVED");
    expect(customerSmsKinds).toContain("BOOKING_COMPLETED");
  });

  it("GET /dispatch/offers returns the driver's history list (status filter + default limit)", async () => {
    const { driverToken, driver, bookingId } = await aConfirmedBookingWithDriverInRadius();
    const offerId = await sweepAndGetOfferId(bookingId);

    await request(app.getHttpServer())
      .post(`/dispatch/offers/${offerId}/reject`)
      .set("Authorization", `Bearer ${driverToken}`)
      .send({ reason: "OTHER" });

    const listRes = await request(app.getHttpServer())
      .get(`/dispatch/offers?status=REJECTED`)
      .set("Authorization", `Bearer ${driverToken}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body).toHaveLength(1);
    expect(listRes.body[0]).toMatchObject({
      offerId,
      bookingId,
      status: "REJECTED",
    });
    void driver;
  });

  it("403 when another driver tries to read someone else's offer", async () => {
    const { bookingId } = await aConfirmedBookingWithDriverInRadius();
    const offerId = await sweepAndGetOfferId(bookingId);

    const stranger = await buildDriver(prisma.client, {
      vehicleTypeId,
      lat: 40.5,
      lng: 28.5,
    });
    const strangerToken = signAccessTokenFor(app, stranger.user);

    const res = await request(app.getHttpServer())
      .get(`/dispatch/offers/${offerId}`)
      .set("Authorization", `Bearer ${strangerToken}`);
    expect(res.status).toBe(403);
  });

  it("410 Gone when accepting an expired offer (worker has not yet auto-expired)", async () => {
    const { driverToken, bookingId } = await aConfirmedBookingWithDriverInRadius();
    const offerId = await sweepAndGetOfferId(bookingId);

    // Force the offer past its expiresAt.
    await prisma.client.driverOffer.update({
      where: { id: offerId },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });

    const res = await request(app.getHttpServer())
      .post(`/dispatch/offers/${offerId}/accept`)
      .set("Authorization", `Bearer ${driverToken}`);
    expect(res.status).toBe(410);
    const offerAfter = await prisma.client.driverOffer.findUniqueOrThrow({
      where: { id: offerId },
    });
    expect(offerAfter.status).toBe("EXPIRED");
  });
});
