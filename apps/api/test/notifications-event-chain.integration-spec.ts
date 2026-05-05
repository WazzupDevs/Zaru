import { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import { Logger } from "nestjs-pino";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { AppModule } from "../src/app.module";
import { signAccessTokenFor } from "./helpers/auth-token";
import { setupCatalogFixtures, setupPricingFixtures } from "./helpers/catalog-fixtures";
import { OutboxDrainService } from "../src/common/outbox/outbox-drain.service";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { configureApp } from "../src/configure-app";
import { truncateTransactionalTables } from "./helpers/db-cleanup";
import { buildDriver } from "./helpers/driver-builder";
import { buildQuote } from "./helpers/quote-builder";
import { buildUser } from "./helpers/user-builder";
import { AssignDriverToBookingUseCase } from "../src/modules/dispatch/application/use-cases/assign-driver-to-booking.use-case";
import {
  SMS_SENDER_PORT,
  type SmsSenderPort,
} from "../src/modules/notifications/application/ports/sms-sender.port";
import { DeadLetterNotificationUseCase } from "../src/modules/notifications/application/use-cases/dead-letter-notification.use-case";
import { SendNotificationUseCase } from "../src/modules/notifications/application/use-cases/send-notification.use-case";
import { MockSmsSender } from "../src/modules/notifications/infrastructure/senders/mock-sms-sender";

/**
 * Notifications event-chain integration spec — A4-Stab.
 *
 * The four event handlers (BookingConfirmed, BookingCancelled,
 * BookingExpired, DriverDispatched) each go through:
 *   outbox row → OutboxDrainService.drainOnce() → EventEmitter2.emitAsync
 *   → @OnEvent listener → QueueNotificationUseCase → Notification PENDING
 *   → SendNotificationUseCase → MockSmsSender.send → SENT
 *
 * Tests call drainOnce() inline + invoke SendNotificationUseCase
 * directly so the chain is deterministic — no waiting for BullMQ.
 */
describe("Notifications event chain (Testcontainers)", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let drain: OutboxDrainService;
  let mockSms: MockSmsSender;
  let sendUseCase: SendNotificationUseCase;
  let deadLetterUseCase: DeadLetterNotificationUseCase;
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
    drain = app.get(OutboxDrainService);
    sendUseCase = app.get(SendNotificationUseCase);
    deadLetterUseCase = app.get(DeadLetterNotificationUseCase);
    assignUseCase = app.get(AssignDriverToBookingUseCase);
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

  /** Drain outbox until empty (max 10 passes — guards against runaway loops). */
  async function drainAll(): Promise<void> {
    for (let i = 0; i < 10; i++) {
      const processed = await drain.drainOnce();
      if (processed === 0) return;
    }
  }

  /** Process all PENDING notifications by directly invoking the use case. */
  async function processPendingNotifications(): Promise<void> {
    const pending = await prisma.client.notification.findMany({
      where: { status: "PENDING" },
      select: { id: true },
    });
    for (const n of pending) {
      try {
        await sendUseCase.execute({ notificationId: n.id, attemptNumber: 1 });
      } catch {
        // Swallow — failed-attempt path. Tests that need DLQ call
        // deadLetterUseCase explicitly after exhausting attempts.
      }
    }
  }

  async function aConfirmedBooking() {
    const customer = await buildUser(prisma.client);
    const token = signAccessTokenFor(app, customer);
    const quote = await buildQuote(app, { token, vehicleTypeId, categoryId });
    const res = await request(app.getHttpServer())
      .post("/bookings/confirm")
      .set("Authorization", `Bearer ${token}`)
      .send({ quoteId: quote.id });
    return { customer, token, bookingId: res.body.id as string };
  }

  it("BookingConfirmed → customer SMS lands in MockSmsSender inbox as SENT", async () => {
    const { customer, bookingId } = await aConfirmedBooking();

    await drainAll();
    await processPendingNotifications();

    const last = mockSms.getLastFor(customer.phoneE164);
    expect(last).toBeDefined();
    expect(last?.message).toContain("rezervasyonunuz onaylandı");

    const stored = await prisma.client.notification.findFirst({
      where: { sourceAggregateId: bookingId, kind: "BOOKING_CONFIRMED" },
    });
    expect(stored?.status).toBe("SENT");
    expect(stored?.providerMessageId).toMatch(/^mock-/);
  });

  it("BookingCancelled → customer SMS BOOKING_CANCELLED", async () => {
    const { customer, token, bookingId } = await aConfirmedBooking();
    await drainAll();
    await processPendingNotifications();
    mockSms.clear();

    await request(app.getHttpServer())
      .post(`/bookings/${bookingId}/cancel`)
      .set("Authorization", `Bearer ${token}`)
      .send({ reason: "test" });
    await drainAll();
    await processPendingNotifications();

    const last = mockSms.getLastFor(customer.phoneE164);
    expect(last?.message).toContain("iptal edildi");
    const cancelNotif = await prisma.client.notification.findFirst({
      where: { sourceAggregateId: bookingId, kind: "BOOKING_CANCELLED" },
    });
    expect(cancelNotif?.status).toBe("SENT");
  });

  it("DriverDispatched → fans out to driver (NEW_BOOKING_OFFER) + customer (DRIVER_ASSIGNED_TO_BOOKING)", async () => {
    const driver = await buildDriver(prisma.client, {
      vehicleTypeId,
      lat: 41.009,
      lng: 28.98,
    });
    const { customer, bookingId } = await aConfirmedBooking();
    await drainAll();
    await processPendingNotifications();
    mockSms.clear();

    await assignUseCase.execute({ bookingId });
    await drainAll();
    await processPendingNotifications();

    const driverSms = mockSms.getLastFor(driver.user.phoneE164);
    expect(driverSms?.message).toContain("Yeni iş");

    const customerSms = mockSms.getLastFor(customer.phoneE164);
    expect(customerSms?.message).toMatch(/sürücünüz atandı/i);

    const sent = await prisma.client.notification.findMany({
      where: { sourceAggregateId: bookingId, status: "SENT" },
    });
    const kinds = new Set(sent.map((n) => n.kind));
    expect(kinds).toContain("NEW_BOOKING_OFFER");
    expect(kinds).toContain("DRIVER_ASSIGNED_TO_BOOKING");
  });

  it("idempotency: replaying a BookingConfirmed event produces only one notification (24h window)", async () => {
    const { customer, bookingId } = await aConfirmedBooking();
    await drainAll();
    await processPendingNotifications();
    const initial = await prisma.client.notification.count({
      where: { sourceAggregateId: bookingId, kind: "BOOKING_CONFIRMED" },
    });
    expect(initial).toBe(1);

    // Manually replay the same outbox event — simulates a drain retry.
    await prisma.client.outboxEvent.create({
      data: {
        aggregateType: "Booking",
        aggregateId: bookingId,
        eventType: "booking.BookingConfirmed",
        payload: {
          bookingId,
          customerId: customer.id,
          vehicleTypeId,
          categoryId,
          totalAmount: "6877.00",
          currency: "TRY",
          eventStartAt: "2026-08-15T14:00:00.000Z",
        } as never,
      },
    });
    await drainAll();
    await processPendingNotifications();

    const after = await prisma.client.notification.count({
      where: { sourceAggregateId: bookingId, kind: "BOOKING_CONFIRMED" },
    });
    expect(after).toBe(1);
  });

  it("retry happy path: first 2 attempts fail, 3rd succeeds → status SENT, attemptHistory has 2 entries", async () => {
    const { bookingId } = await aConfirmedBooking();
    await drainAll();

    // Two failures then a success.
    mockSms.failNext(2);
    const pending = await prisma.client.notification.findFirstOrThrow({
      where: { sourceAggregateId: bookingId, kind: "BOOKING_CONFIRMED" },
    });

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await sendUseCase.execute({ notificationId: pending.id, attemptNumber: attempt });
      } catch {
        // first two will throw — that's the retry path
      }
    }

    const final = await prisma.client.notification.findUniqueOrThrow({
      where: { id: pending.id },
    });
    expect(final.status).toBe("SENT");
    const history = final.attemptHistory as unknown as { attempt: number }[];
    expect(history).toHaveLength(2);
  });

  it("DLQ: every attempt fails → DeadLetterNotificationUseCase materialises dead_letters row + outbox event", async () => {
    const { bookingId } = await aConfirmedBooking();
    await drainAll();
    mockSms.failAll();
    const pending = await prisma.client.notification.findFirstOrThrow({
      where: { sourceAggregateId: bookingId, kind: "BOOKING_CONFIRMED" },
    });

    // Five failed attempts mirrors the BullMQ default budget.
    for (let attempt = 1; attempt <= 5; attempt++) {
      try {
        await sendUseCase.execute({ notificationId: pending.id, attemptNumber: attempt });
      } catch {
        /* expected */
      }
    }
    await deadLetterUseCase.execute({
      notificationId: pending.id,
      finalError: "mock sms failure",
      attempts: 5,
    });

    const after = await prisma.client.notification.findUniqueOrThrow({
      where: { id: pending.id },
    });
    expect(after.status).toBe("DEAD_LETTERED");

    const dlqRow = await prisma.client.notificationDeadLetter.findUnique({
      where: { notificationId: pending.id },
    });
    expect(dlqRow?.attempts).toBe(5);
    expect(dlqRow?.finalError).toBe("mock sms failure");

    const dlEvent = await prisma.client.outboxEvent.findFirst({
      where: {
        aggregateId: pending.id,
        eventType: "notifications.NotificationDeadLettered",
      },
    });
    expect(dlEvent).not.toBeNull();
    // PII discipline: dead-letter outbox payload carries no phone/body.
    const json = JSON.stringify(dlEvent!.payload);
    expect(json).not.toContain(after.recipientPhone);
    expect(json).not.toContain(after.renderedBody);
  });
});
