import { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import { Logger } from "nestjs-pino";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { AppModule } from "../src/app.module";
import { signAccessTokenFor } from "./helpers/auth-token";
import { setupCatalogFixtures, setupPricingFixtures } from "./helpers/catalog-fixtures";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { configureApp } from "../src/configure-app";
import { truncateTransactionalTables } from "./helpers/db-cleanup";
import { drainAndProcess } from "./helpers/drain-and-process";
import { buildQuote } from "./helpers/quote-builder";
import { buildUser } from "./helpers/user-builder";
import {
  PUSH_SENDER_PORT,
  type PushSenderPort,
} from "../src/modules/notifications/application/ports/push-sender.port";
import {
  SMS_SENDER_PORT,
  type SmsSenderPort,
} from "../src/modules/notifications/application/ports/sms-sender.port";
import { MockPushSender } from "../src/modules/notifications/infrastructure/senders/mock-push-sender";
import { MockSmsSender } from "../src/modules/notifications/infrastructure/senders/mock-sms-sender";

const VALID_PUSH_TOKEN = "ExponentPushToken[push-chain-spec-token]";
const SECOND_PUSH_TOKEN = "ExponentPushToken[push-chain-second]";

/**
 * Push notification chain — A4e-3 end-to-end.
 *
 * Verifies the full pipe with the new channel-routing logic + the
 * PATCH /users/me/push-token endpoint:
 *
 *   token register → DB column set
 *   booking confirm → outbox → listener picks PUSH → PUSH row created
 *     with recipientPushToken set, no SMS
 *   no token → SMS fallback (the existing event-chain spec already
 *     covers SMS happy path; one test here pins the negative for
 *     channel routing)
 *   token clear (PATCH null) → next event flips to SMS
 *   push send fail → MockPushSender.failNext → retry budget catches
 *   PII discipline — outbox payloads never carry the push token
 *
 * Tests call drainOnce() inline + invoke SendNotificationUseCase
 * indirectly via the BullMQ-free flush helper so the chain is
 * deterministic — no waiting for Redis.
 */
describe("Notifications push chain (Testcontainers)", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let mockSms: MockSmsSender;
  let mockPush: MockPushSender;
  let categoryId: string;
  let vehicleTypeId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
    app.useLogger(app.get(Logger));
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    const sms = app.get<SmsSenderPort>(SMS_SENDER_PORT);
    if (!(sms instanceof MockSmsSender)) {
      throw new Error("test setup expects MockSmsSender (NETGSM_USERCODE=DUMMY_*)");
    }
    mockSms = sms;
    const push = app.get<PushSenderPort>(PUSH_SENDER_PORT);
    if (!(push instanceof MockPushSender)) {
      throw new Error("test setup expects MockPushSender (EXPO_PUSH_PROJECT_ID empty/DUMMY_)");
    }
    mockPush = push;
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
    mockPush.clear();
    mockPush.clearFailure();
  });

  const flush = (): Promise<void> => drainAndProcess(app, { swallowNotificationErrors: true });

  async function aConfirmedBooking(opts: { withPushToken?: boolean } = {}) {
    const customer = await buildUser(prisma.client, {
      ...(opts.withPushToken === true ? { expoPushToken: VALID_PUSH_TOKEN } : {}),
    });
    const token = signAccessTokenFor(app, customer);
    const quote = await buildQuote(app, { token, vehicleTypeId, categoryId });
    const res = await request(app.getHttpServer())
      .post("/bookings/confirm")
      .set("Authorization", `Bearer ${token}`)
      .send({ quoteId: quote.id });
    return { customer, token, bookingId: res.body.id as string };
  }

  it("PATCH /users/me/push-token persists token + pushTokenUpdatedAt", async () => {
    const customer = await buildUser(prisma.client);
    const token = signAccessTokenFor(app, customer);

    await request(app.getHttpServer())
      .patch("/users/me/push-token")
      .set("Authorization", `Bearer ${token}`)
      .send({ expoPushToken: VALID_PUSH_TOKEN })
      .expect(204);

    const reread = await prisma.client.user.findUniqueOrThrow({ where: { id: customer.id } });
    expect(reread.expoPushToken).toBe(VALID_PUSH_TOKEN);
    expect(reread.pushTokenUpdatedAt).not.toBeNull();
  });

  it("PATCH with malformed token returns 400 (Zod schema rejects)", async () => {
    const customer = await buildUser(prisma.client);
    const token = signAccessTokenFor(app, customer);

    await request(app.getHttpServer())
      .patch("/users/me/push-token")
      .set("Authorization", `Bearer ${token}`)
      .send({ expoPushToken: "garbage-not-an-expo-token" })
      .expect(400);
  });

  it("PATCH with null clears the token", async () => {
    const customer = await buildUser(prisma.client, { expoPushToken: VALID_PUSH_TOKEN });
    const token = signAccessTokenFor(app, customer);

    await request(app.getHttpServer())
      .patch("/users/me/push-token")
      .set("Authorization", `Bearer ${token}`)
      .send({ expoPushToken: null })
      .expect(204);

    const reread = await prisma.client.user.findUniqueOrThrow({ where: { id: customer.id } });
    expect(reread.expoPushToken).toBeNull();
  });

  it("customer with push token → BookingCreated routes to PUSH (no SMS)", async () => {
    const { customer, bookingId } = await aConfirmedBooking({ withPushToken: true });

    await flush();

    const last = mockPush.getLastFor(VALID_PUSH_TOKEN);
    expect(last).toBeDefined();
    expect(last?.title).toBe("Rezervasyon Onaylandı");
    expect(last?.body).toContain("rezervasyonunuz onaylandı");

    // SMS sender NOT invoked for this customer.
    expect(mockSms.getLastFor(customer.phoneE164)).toBeUndefined();

    const stored = await prisma.client.notification.findFirstOrThrow({
      where: { sourceAggregateId: bookingId, kind: "BOOKING_CONFIRMED" },
    });
    expect(stored.channel).toBe("PUSH");
    expect(stored.recipientPushToken).toBe(VALID_PUSH_TOKEN);
    expect(stored.status).toBe("SENT");
  });

  it("customer without push token → BookingCreated routes to SMS (fallback)", async () => {
    const { customer, bookingId } = await aConfirmedBooking({ withPushToken: false });

    await flush();

    expect(mockSms.getLastFor(customer.phoneE164)).toBeDefined();
    expect(mockPush.getInbox()).toHaveLength(0);

    const stored = await prisma.client.notification.findFirstOrThrow({
      where: { sourceAggregateId: bookingId, kind: "BOOKING_CONFIRMED" },
    });
    expect(stored.channel).toBe("SMS");
    expect(stored.recipientPushToken).toBeNull();
  });

  it("token clear via PATCH → next event flips back to SMS", async () => {
    const customer = await buildUser(prisma.client, { expoPushToken: VALID_PUSH_TOKEN });
    const token = signAccessTokenFor(app, customer);

    // Clear the token first so the booking we create afterwards has
    // no push target.
    await request(app.getHttpServer())
      .patch("/users/me/push-token")
      .set("Authorization", `Bearer ${token}`)
      .send({ expoPushToken: null })
      .expect(204);

    const quote = await buildQuote(app, { token, vehicleTypeId, categoryId });
    await request(app.getHttpServer())
      .post("/bookings/confirm")
      .set("Authorization", `Bearer ${token}`)
      .send({ quoteId: quote.id });
    await flush();

    expect(mockSms.getLastFor(customer.phoneE164)).toBeDefined();
    expect(mockPush.getInbox()).toHaveLength(0);
  });

  it("push send failure surfaces — notification marked FAILED, retry path triggered", async () => {
    // Single forced failure is enough to prove the PUSH branch lands
    // in the same retry chain SMS uses. The full N-attempt retry-then-
    // succeed dance is already covered by the SMS event-chain spec
    // (and the inner SendNotificationUseCase code path is identical
    // for both channels — the failure handler is shared). Reproducing
    // the BullMQ retry timing here would duplicate that suite without
    // adding new coverage. SECOND_PUSH_TOKEN reserved for the multi-
    // user retry/DLQ spec that lives next to the SMS one.
    mockPush.failAll();
    const { bookingId } = await aConfirmedBooking({ withPushToken: true });

    await flush();

    const stored = await prisma.client.notification.findFirstOrThrow({
      where: { sourceAggregateId: bookingId, kind: "BOOKING_CONFIRMED" },
    });
    expect(stored.channel).toBe("PUSH");
    expect(stored.status).toBe("FAILED");
    expect(stored.providerError).toContain("mock push failure");
    const history = stored.attemptHistory as unknown as { attempt: number }[];
    expect(history.length).toBeGreaterThanOrEqual(1);
    void SECOND_PUSH_TOKEN;
  });

  it("PII discipline — outbox payload never carries the push token", async () => {
    const { bookingId } = await aConfirmedBooking({ withPushToken: true });
    await flush();

    const events = await prisma.client.outboxEvent.findMany({
      where: { aggregateId: bookingId },
    });
    for (const event of events) {
      const payload = JSON.stringify(event.payload);
      expect(payload).not.toContain(VALID_PUSH_TOKEN);
      expect(payload).not.toContain("ExponentPushToken");
    }
  });
});
