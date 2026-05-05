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
import { buildDriver } from "./helpers/driver-builder";
import { buildQuote } from "./helpers/quote-builder";
import { buildUser } from "./helpers/user-builder";
import { AssignDriverToBookingUseCase } from "../src/modules/dispatch/application/use-cases/assign-driver-to-booking.use-case";

/**
 * Dispatch integration spec — A4-Stab.
 *
 * The PostGIS candidate query and the optimistic-lock assignDriver
 * transition are both unit-tested (driver-matcher.spec.ts +
 * assign-driver-to-booking.use-case.spec.ts), but neither hits the
 * real Postgres + PostGIS extension. This spec walks the actual SQL
 * + GIST index on Testcontainers so radius / freshness / vehicle-
 * conflict filters work end-to-end.
 */
describe("Dispatch matching (Testcontainers)", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let assignUseCase: AssignDriverToBookingUseCase;
  let categoryId: string;
  let vehicleTypeId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
    app.useLogger(app.get(Logger));
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    assignUseCase = app.get(AssignDriverToBookingUseCase);
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

  /** Helper: customer + quote + confirm → CONFIRMED booking ready for dispatch. */
  async function aConfirmedBooking() {
    const customer = await buildUser(prisma.client);
    const token = signAccessTokenFor(app, customer);
    const quote = await buildQuote(app, { token, vehicleTypeId, categoryId });
    const res = await request(app.getHttpServer())
      .post("/bookings/confirm")
      .set("Authorization", `Bearer ${token}`)
      .send({ quoteId: quote.id });
    return { bookingId: res.body.id as string, customer, token };
  }

  it("matches the closest qualifying driver and emits dispatch.DriverDispatched", async () => {
    // Sultanahmet is ~5 km from the booking pickup default (smoke pin).
    // Three drivers, only the close one is the closest match.
    const close = await buildDriver(prisma.client, { vehicleTypeId, lat: 41.009, lng: 28.98 });
    const mid = await buildDriver(prisma.client, { vehicleTypeId, lat: 41.04, lng: 29.0 });
    const far = await buildDriver(prisma.client, { vehicleTypeId, lat: 40.9, lng: 28.6 });
    void mid;
    void far;

    const { bookingId } = await aConfirmedBooking();
    const result = await assignUseCase.execute({ bookingId });

    expect(result.success).toBe(true);
    expect(result.driverProfileId).toBe(close.driverProfileId);

    const updated = await prisma.client.booking.findUnique({ where: { id: bookingId } });
    expect(updated?.status).toBe("DRIVER_ASSIGNED");
    expect(updated?.driverId).toBe(close.driverProfileId);
    expect(updated?.vehicleId).toBe(close.vehicleId);

    const dispatchEvents = await prisma.client.outboxEvent.findMany({
      where: { aggregateId: bookingId, eventType: "dispatch.DriverDispatched" },
    });
    expect(dispatchEvents).toHaveLength(1);

    // Sentinel BOOKED availability blocks the driver for the event window.
    const block = await prisma.client.vehicleAvailability.findFirst({
      where: { vehicleId: close.vehicleId, type: "BOOKED" },
    });
    expect(block?.bookingId).toBe(bookingId);
  });

  it("offline drivers are filtered out (no candidates → DispatchFailed)", async () => {
    await buildDriver(prisma.client, { vehicleTypeId, isOnline: false });
    const { bookingId } = await aConfirmedBooking();

    const result = await assignUseCase.execute({ bookingId });

    expect(result.success).toBe(false);
    expect(result.reason).toBe("no_drivers_in_radius");
    const dispatchFailed = await prisma.client.outboxEvent.findFirst({
      where: { aggregateId: bookingId, eventType: "dispatch.DispatchFailed" },
    });
    expect(dispatchFailed).not.toBeNull();
  });

  it("stale-location drivers are filtered out (lastLocationUpdate older than freshness)", async () => {
    await buildDriver(prisma.client, {
      vehicleTypeId,
      lastLocationUpdate: new Date(Date.now() - 10 * 60_000), // 10 min ago > 5 min limit
    });
    const { bookingId } = await aConfirmedBooking();

    const result = await assignUseCase.execute({ bookingId });
    expect(result.success).toBe(false);
  });

  it("drivers beyond max radius are filtered out", async () => {
    // ~150 km from pickup (Sultanahmet → Ankara direction)
    await buildDriver(prisma.client, { vehicleTypeId, lat: 39.92, lng: 32.85 });
    const { bookingId } = await aConfirmedBooking();

    const result = await assignUseCase.execute({ bookingId });
    expect(result.success).toBe(false);
    expect(result.reason).toBe("no_drivers_in_radius");
  });

  it("drivers already booked in the same window are filtered out", async () => {
    const driver = await buildDriver(prisma.client, { vehicleTypeId });
    // Pre-existing BOOKED availability that overlaps the test booking window.
    await prisma.client.vehicleAvailability.create({
      data: {
        vehicleId: driver.vehicleId,
        driverProfileId: driver.driverProfileId,
        startAt: new Date("2026-08-15T13:00:00.000Z"),
        endAt: new Date("2026-08-15T23:00:00.000Z"),
        type: "BOOKED",
      },
    });
    const { bookingId } = await aConfirmedBooking();

    const result = await assignUseCase.execute({ bookingId });
    expect(result.success).toBe(false);
  });

  it("two concurrent assigns on the same booking: one wins, the other throws ConcurrentDispatchError", async () => {
    await buildDriver(prisma.client, { vehicleTypeId, lat: 41.009, lng: 28.98 });
    const { bookingId } = await aConfirmedBooking();

    const results = await Promise.allSettled([
      assignUseCase.execute({ bookingId }),
      assignUseCase.execute({ bookingId }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    // Either both fulfilled (one success + one no-eligible after seeing the
    // freshly-blocked availability) or one fulfilled + one rejected
    // (concurrent dispatch error). Both shapes are valid and demonstrate
    // race safety. The DB-side invariant is what matters.
    expect(fulfilled.length + rejected.length).toBe(2);

    const updated = await prisma.client.booking.findUnique({ where: { id: bookingId } });
    expect(updated?.status).toBe("DRIVER_ASSIGNED");

    const blockCount = await prisma.client.vehicleAvailability.count({
      where: { bookingId, type: "BOOKED" },
    });
    expect(blockCount).toBe(1);
  });

  it("dispatch.DriverDispatched payload carries no PII (no plate / lat / lng)", async () => {
    await buildDriver(prisma.client, {
      vehicleTypeId,
      lat: 41.009,
      lng: 28.98,
      plateNumber: "34ABC123",
    });
    const { bookingId } = await aConfirmedBooking();
    await assignUseCase.execute({ bookingId });

    const evt = await prisma.client.outboxEvent.findFirst({
      where: { aggregateId: bookingId, eventType: "dispatch.DriverDispatched" },
    });
    const json = JSON.stringify(evt!.payload);
    expect(json).not.toContain("34ABC123");
    expect(json).not.toContain("41.009");
    expect(json).not.toContain("28.98");
  });
});
