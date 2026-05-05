import { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import { Logger } from "nestjs-pino";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { AppModule } from "../src/app.module";
import { signAccessTokenFor } from "./helpers/auth-token";
import { configureApp } from "../src/configure-app";
import { setupCatalogFixtures, setupPricingFixtures } from "./helpers/catalog-fixtures";
import { truncateTransactionalTables } from "./helpers/db-cleanup";
import { drainAndProcess } from "./helpers/drain-and-process";
import { buildDriver } from "./helpers/driver-builder";
import { buildQuote } from "./helpers/quote-builder";
import { buildUser } from "./helpers/user-builder";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { AssignDriverToBookingUseCase } from "../src/modules/dispatch/application/use-cases/assign-driver-to-booking.use-case";
import {
  SMS_SENDER_PORT,
  type SmsSenderPort,
} from "../src/modules/notifications/application/ports/sms-sender.port";
import { MockSmsSender } from "../src/modules/notifications/infrastructure/senders/mock-sms-sender";

/**
 * Full booking lifecycle e2e — A4-Stab. One large scenario that walks
 * every Faz 2 module: customer login → quote → confirm → dispatch →
 * notifications → cancel. The modular integration specs cover branch
 * coverage; this one proves they compose.
 */
describe("Full booking lifecycle (e2e)", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let mockSms: MockSmsSender;
  let assignUseCase: AssignDriverToBookingUseCase;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
    app.useLogger(app.get(Logger));
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    assignUseCase = app.get(AssignDriverToBookingUseCase);
    const sender = app.get<SmsSenderPort>(SMS_SENDER_PORT);
    if (!(sender instanceof MockSmsSender)) {
      throw new Error("e2e expects MockSmsSender");
    }
    mockSms = sender;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await truncateTransactionalTables(prisma.client);
    mockSms.clear();
    mockSms.clearFailure();
  });

  /** Shared deterministic loop — see test/helpers/drain-and-process.ts. */
  const flush = (): Promise<void> => drainAndProcess(app, { swallowNotificationErrors: true });

  it("customer journey: login → quote → confirm → dispatch → cancel — every event surfaces an SMS", async () => {
    // 1. Catalog + pricing seed (idempotent helpers).
    const catalog = await setupCatalogFixtures(prisma.client);
    await setupPricingFixtures(prisma.client, catalog.vehicleTypeId);

    // 2. Customer + token + driver fixture in the matching radius.
    const customer = await buildUser(prisma.client);
    const token = signAccessTokenFor(app, customer);
    const driver = await buildDriver(prisma.client, {
      vehicleTypeId: catalog.vehicleTypeId,
      lat: 41.009,
      lng: 28.98,
    });

    // 3. Quote — same Saturday August window the smoke uses.
    const quote = await buildQuote(app, {
      token,
      vehicleTypeId: catalog.vehicleTypeId,
      categoryId: catalog.categoryId,
    });
    expect(quote.totalAmount).toBe("6877.00");

    // 4. Confirm → CONFIRMED + outbox events.
    const confirmRes = await request(app.getHttpServer())
      .post("/bookings/confirm")
      .set("Authorization", `Bearer ${token}`)
      .send({ quoteId: quote.id });
    expect(confirmRes.status).toBe(201);
    const bookingId = confirmRes.body.id as string;

    await flush();
    const confirmSms = mockSms.getLastFor(customer.phoneE164);
    expect(confirmSms?.message).toContain("rezervasyonunuz onaylandı");

    // 5. Dispatch — assign closest driver, fan out two SMS.
    const dispatchResult = await assignUseCase.execute({ bookingId });
    expect(dispatchResult.success).toBe(true);
    expect(dispatchResult.driverProfileId).toBe(driver.driverProfileId);

    await flush();
    expect(mockSms.getLastFor(driver.user.phoneE164)?.message).toContain("Yeni iş");
    expect(mockSms.getLastFor(customer.phoneE164)?.message).toMatch(/sürücünüz atandı/i);

    const afterDispatch = await prisma.client.booking.findUnique({ where: { id: bookingId } });
    expect(afterDispatch?.status).toBe("DRIVER_ASSIGNED");
    expect(afterDispatch?.driverId).toBe(driver.driverProfileId);

    // 6. Cancel → CANCELLED_BY_CUSTOMER + cancel SMS to customer.
    const cancelRes = await request(app.getHttpServer())
      .post(`/bookings/${bookingId}/cancel`)
      .set("Authorization", `Bearer ${token}`)
      .send({ reason: "test cancel" });
    expect(cancelRes.status).toBe(201);

    await flush();
    expect(mockSms.getLastFor(customer.phoneE164)?.message).toContain("iptal edildi");

    const finalBooking = await prisma.client.booking.findUnique({
      where: { id: bookingId },
    });
    expect(finalBooking?.status).toBe("CANCELLED_BY_CUSTOMER");

    // 7. End state: every outbox row processed, all notifications SENT.
    const unprocessed = await prisma.client.outboxEvent.count({
      where: { processedAt: null },
    });
    expect(unprocessed).toBe(0);
    const failed = await prisma.client.notification.count({
      where: { status: { in: ["FAILED", "DEAD_LETTERED", "PENDING", "SENDING"] } },
    });
    expect(failed).toBe(0);
  });
});
