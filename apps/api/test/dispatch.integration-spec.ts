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
import { BookingDispatchService } from "../src/modules/dispatch/infrastructure/workers/booking-dispatch.service";

/**
 * Dispatch integration spec — A4-Stab + A4f-2b-2 rewrite.
 *
 * Under the offer flow the worker creates a PENDING DriverOffer
 * instead of immediately writing booking DRIVER_ASSIGNED. The PostGIS
 * matcher behaviour (radius / freshness / vehicle-conflict /
 * exclusion) carries over; assertions changed from "booking is now
 * DRIVER_ASSIGNED" to "driver_offers row was created (booking still
 * CONFIRMED, accept use case handles the assignment)".
 */
describe("Dispatch matching (Testcontainers)", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
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

  it("matches the closest qualifying driver and emits dispatch.DriverDispatched + creates a PENDING offer", async () => {
    // Sultanahmet is ~5 km from the booking pickup default (smoke pin).
    // Three drivers, only the close one is the closest match.
    const close = await buildDriver(prisma.client, { vehicleTypeId, lat: 41.009, lng: 28.98 });
    const mid = await buildDriver(prisma.client, { vehicleTypeId, lat: 41.04, lng: 29.0 });
    const far = await buildDriver(prisma.client, { vehicleTypeId, lat: 40.9, lng: 28.6 });
    void mid;
    void far;

    const { bookingId } = await aConfirmedBooking();
    const stats = await dispatchService.sweep();

    expect(stats.succeeded).toBe(1);

    // Booking stays CONFIRMED — the offer flow only transitions to
    // DRIVER_ASSIGNED on accept (AcceptDriverOfferUseCase).
    const updated = await prisma.client.booking.findUnique({ where: { id: bookingId } });
    expect(updated?.status).toBe("CONFIRMED");
    expect(updated?.driverId).toBeNull();

    const offer = await prisma.client.driverOffer.findFirst({
      where: { bookingId, driverProfileId: close.driverProfileId },
    });
    expect(offer?.status).toBe("PENDING");
    expect(offer?.vehicleId).toBe(close.vehicleId);

    const dispatchEvents = await prisma.client.outboxEvent.findMany({
      where: { aggregateId: bookingId, eventType: "dispatch.DriverDispatched" },
    });
    expect(dispatchEvents).toHaveLength(1);
  });

  it("offline drivers are filtered out (no candidates → DispatchFailed)", async () => {
    await buildDriver(prisma.client, { vehicleTypeId, isOnline: false });
    const { bookingId } = await aConfirmedBooking();

    const stats = await dispatchService.sweep();
    expect(stats.failed).toBe(1);
    expect(stats.succeeded).toBe(0);

    const dispatchFailed = await prisma.client.outboxEvent.findFirst({
      where: { aggregateId: bookingId, eventType: "dispatch.DispatchFailed" },
    });
    expect(dispatchFailed).not.toBeNull();
    const offer = await prisma.client.driverOffer.findFirst({ where: { bookingId } });
    expect(offer).toBeNull();
  });

  it("stale-location drivers are filtered out (lastLocationUpdate older than freshness)", async () => {
    await buildDriver(prisma.client, {
      vehicleTypeId,
      lastLocationUpdate: new Date(Date.now() - 10 * 60_000), // 10 min ago > 5 min limit
    });
    const { bookingId } = await aConfirmedBooking();

    const stats = await dispatchService.sweep();
    expect(stats.failed).toBe(1);
    const offer = await prisma.client.driverOffer.findFirst({ where: { bookingId } });
    expect(offer).toBeNull();
  });

  it("drivers beyond max radius are filtered out", async () => {
    // ~150 km from pickup (Sultanahmet → Ankara direction)
    await buildDriver(prisma.client, { vehicleTypeId, lat: 39.92, lng: 32.85 });
    const { bookingId } = await aConfirmedBooking();

    const stats = await dispatchService.sweep();
    expect(stats.failed).toBe(1);
    const dispatchFailed = await prisma.client.outboxEvent.findFirst({
      where: { aggregateId: bookingId, eventType: "dispatch.DispatchFailed" },
    });
    expect((dispatchFailed?.payload as { reason?: string }).reason).toBe("no_drivers_in_radius");
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

    const stats = await dispatchService.sweep();
    expect(stats.failed).toBe(1);
    const offer = await prisma.client.driverOffer.findFirst({ where: { bookingId } });
    expect(offer).toBeNull();
  });

  it("two sweep passes on the same booking with an active offer: second pass does not create a duplicate", async () => {
    await buildDriver(prisma.client, { vehicleTypeId, lat: 41.009, lng: 28.98 });
    const { bookingId } = await aConfirmedBooking();

    await dispatchService.sweep();
    // Reset lastDispatchAt to bypass cooldown for the second tick.
    await prisma.client.booking.update({
      where: { id: bookingId },
      data: { lastDispatchAt: null },
    });
    await dispatchService.sweep();

    const offers = await prisma.client.driverOffer.findMany({ where: { bookingId } });
    expect(offers).toHaveLength(1);
    expect(offers[0]!.status).toBe("PENDING");
  });

  it("dispatch.DriverDispatched payload carries no PII (no plate / lat / lng)", async () => {
    await buildDriver(prisma.client, {
      vehicleTypeId,
      lat: 41.009,
      lng: 28.98,
      plateNumber: "34ABC123",
    });
    const { bookingId } = await aConfirmedBooking();
    await dispatchService.sweep();

    const evt = await prisma.client.outboxEvent.findFirst({
      where: { aggregateId: bookingId, eventType: "dispatch.DriverDispatched" },
    });
    // Field-level property checks (A4f-2b-1 flaky-fix pattern). PII
    // discipline is about payload SHAPE — these keys must never
    // appear, regardless of whether their string values happen to
    // coincide with unrelated digits.
    const payload = evt!.payload as Record<string, unknown>;
    expect(payload).not.toHaveProperty("plate");
    expect(payload).not.toHaveProperty("lat");
    expect(payload).not.toHaveProperty("lng");
    expect(payload).not.toHaveProperty("pickupLat");
    expect(payload).not.toHaveProperty("pickupLng");
  });
});
