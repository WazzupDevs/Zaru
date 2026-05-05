import { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import { Logger } from "nestjs-pino";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { RedisService } from "../src/common/redis/redis.service";
import { configureApp } from "../src/configure-app";
import { signAccessTokenFor } from "./helpers/auth-token";
import {
  setupCatalogFixtures,
  setupPricingFixtures,
  TRIM_ADDON_RULE_ID,
} from "./helpers/catalog-fixtures";
import { truncateTransactionalTables } from "./helpers/db-cleanup";
import { buildQuote } from "./helpers/quote-builder";
import { buildUser } from "./helpers/user-builder";

/**
 * Pricing integration spec — A4-Stab.
 *
 * Unit tests already pin the Decimal calculator (5500 × 1.30 × 1.15 =
 * 6877.00). This spec walks the HTTP surface end-to-end:
 *   * Quote create writes the breakdown JSONB row + outbox event
 *   * Addon flow adds the fixed amount on top of the multiplier path
 *   * Atomic ACTIVE → CONSUMED race holds against parallel confirms
 *   * The 10/min/user rate limit kicks in at the 11th request
 *   * pricing.PriceQuoteCreated outbox payload carries no PII
 */
describe("Pricing quote (Testcontainers)", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let redis: RedisService;
  let categoryId: string;
  let vehicleTypeId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
    app.useLogger(app.get(Logger));
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    redis = app.get(RedisService);
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
    // Per-spec rate-limit reset — sliding-window state from earlier suites
    // would otherwise carry over and trip the 10/min limit early.
    const keys = await redis.client.keys("rl:pricing:*");
    if (keys.length) await redis.client.del(...keys);
  });

  it("happy path: 6877.00 TRY for the smoke window (Sat August + 8h)", async () => {
    const customer = await buildUser(prisma.client);
    const token = signAccessTokenFor(app, customer);

    const quote = await buildQuote(app, { token, vehicleTypeId, categoryId });
    expect(quote.totalAmount).toBe("6877.00");
    expect(quote.currency).toBe("TRY");
    expect(quote.status).toBe("ACTIVE");
  });

  it("addon flow: trim addon adds 500.00 to the total", async () => {
    const customer = await buildUser(prisma.client);
    const token = signAccessTokenFor(app, customer);

    const quote = await buildQuote(app, {
      token,
      vehicleTypeId,
      categoryId,
      selectedAddonIds: [TRIM_ADDON_RULE_ID],
    });
    expect(quote.totalAmount).toBe("7377.00");
  });

  it("two parallel confirms race-safe — exactly one wins, quote ends up CONSUMED", async () => {
    const customer = await buildUser(prisma.client);
    const token = signAccessTokenFor(app, customer);
    const quote = await buildQuote(app, { token, vehicleTypeId, categoryId });

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
    const stored = await prisma.client.priceQuote.findUnique({ where: { id: quote.id } });
    expect(stored?.status).toBe("CONSUMED");
  });

  it("rate limit: 11th quote request inside the same minute returns 429", async () => {
    const customer = await buildUser(prisma.client);
    const token = signAccessTokenFor(app, customer);

    const sendOne = (): Promise<request.Response> =>
      request(app.getHttpServer())
        .post("/pricing/quotes")
        .set("Authorization", `Bearer ${token}`)
        .send({
          vehicleTypeId,
          categoryId,
          pickupLat: 41.0082,
          pickupLng: 28.9784,
          dropoffLat: 41.0428,
          dropoffLng: 29.0093,
          pickupAddress: "Sultanahmet Mahallesi, Fatih, İstanbul",
          dropoffAddress: "Beşiktaş Merkez, Beşiktaş, İstanbul",
          eventStartAt: "2026-08-15T14:00:00.000Z",
          eventEndAt: "2026-08-15T22:00:00.000Z",
          selectedAddonIds: [],
        });

    for (let i = 0; i < 10; i++) {
      const ok = await sendOne();
      expect(ok.status).toBeLessThan(400);
    }
    const eleventh = await sendOne();
    expect(eleventh.status).toBe(429);
    expect(eleventh.body.code).toBe("PRICING_QUOTE_RATE_LIMITED");
  });

  it("pricing.PriceQuoteCreated outbox payload carries no PII", async () => {
    const customer = await buildUser(prisma.client);
    const token = signAccessTokenFor(app, customer);
    const quote = await buildQuote(app, { token, vehicleTypeId, categoryId });

    const evt = await prisma.client.outboxEvent.findFirstOrThrow({
      where: { aggregateId: quote.id, eventType: "pricing.PriceQuoteCreated" },
    });
    const json = JSON.stringify(evt.payload);
    expect(json).not.toContain("Sultanahmet");
    expect(json).not.toContain("Beşiktaş");
    expect(json).not.toContain("41.0082");
    expect(json).not.toContain("28.9784");
    // Quote id, total + vehicleType still expected — that's commerce data, not PII.
    expect(json).toContain(quote.id);
    expect(json).toContain("6877.00");
  });
});
