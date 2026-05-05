import { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import { Logger } from "nestjs-pino";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { AppModule } from "../src/app.module";
import { FrozenClock } from "./fakes/frozen-clock";
import { CLOCK_PORT } from "../src/common/clock/clock.port";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { RedisService } from "../src/common/redis/redis.service";
import { configureApp } from "../src/configure-app";
import { MockSmsSender } from "../src/modules/notifications/infrastructure/senders/mock-sms-sender";

const OTP_CODE_REGEX = /(\d{6})/;

/**
 * Returning-user lifecycle: same phone logs in twice. Without clock
 * injection the per-phone 60s rate limit makes the second OTP request
 * impossible inside one test run; FrozenClock + advance(2h) makes it
 * deterministic. This was an open A2c TODO.
 */
describe("Auth returning-user (FrozenClock)", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let redis: RedisService;
  const startTime = new Date("2026-04-23T08:00:00.000Z");
  let clock: FrozenClock;

  beforeAll(async () => {
    clock = new FrozenClock(startTime);
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(CLOCK_PORT)
      .useValue(clock)
      .compile();

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
    MockSmsSender._testOnlyReset();
    clock.set(startTime);
    // Wipe identity state so each test starts from zero. Order matters:
    // RefreshToken depends on User, OutboxEvent stands alone.
    await prisma.client.outboxEvent.deleteMany({
      where: { aggregateType: { in: ["User", "RefreshToken", "OtpRequest"] } },
    });
    await prisma.client.refreshToken.deleteMany({});
    await prisma.client.otpRequest.deleteMany({});
    await prisma.client.user.deleteMany({ where: { phoneE164: { startsWith: "+90555900" } } });
    // Drop rate limiter buckets — Redis is shared with the rest of the
    // integration suite and per-phone keys persist past TTL inside one run.
    const rlKeys = await redis.client.keys("rl:otp:*");
    if (rlKeys.length) {
      await redis.client.del(...rlKeys);
    }
  });

  async function requestOtpAndVerify(phone: string, ip: string) {
    const reqRes = await request(app.getHttpServer())
      .post("/auth/otp/request")
      .set("X-Forwarded-For", ip)
      .send({ phone });
    expect(reqRes.status).toBe(202);
    const last = MockSmsSender._testOnlyGetLast(phone);
    expect(last).toBeDefined();
    const match = OTP_CODE_REGEX.exec(last!.body);
    expect(match).not.toBeNull();

    const verifyRes = await request(app.getHttpServer())
      .post("/auth/otp/verify")
      .set("X-Forwarded-For", ip)
      .send({ phone, requestId: reqRes.body.requestId as string, code: match![1] });
    expect(verifyRes.status).toBe(200);
    return verifyRes.body as {
      user: { id: string; phoneE164: string };
      refreshToken: string;
    };
  }

  it("second login two hours later: same userId, lastLoginAt updated, new family, no UserCreated event", async () => {
    const phone = "+905559009001";
    const ip = "192.0.2.80";

    const first = await requestOtpAndVerify(phone, ip);
    const userIdFirst = first.user.id;

    const userRowFirst = await prisma.client.user.findFirst({ where: { phoneE164: phone } });
    expect(userRowFirst?.phoneVerifiedAt?.toISOString()).toBe(startTime.toISOString());
    expect(userRowFirst?.lastLoginAt?.toISOString()).toBe(startTime.toISOString());

    // Outbox after first login: UserCreated + UserLoggedIn + ...
    const eventTypesFirst = (
      await prisma.client.outboxEvent.findMany({
        where: { aggregateType: { in: ["User", "RefreshToken", "OtpRequest"] } },
        select: { eventType: true },
      })
    ).map((e) => e.eventType);
    expect(eventTypesFirst).toContain("identity.UserCreated");
    expect(eventTypesFirst).toContain("identity.UserLoggedIn");

    // Jump two hours forward — past every per-phone/per-ip rate window.
    clock.advance(2 * 60 * 60 * 1000);
    MockSmsSender._testOnlyReset();

    const second = await requestOtpAndVerify(phone, ip);
    expect(second.user.id).toBe(userIdFirst); // returning, not a new row
    expect(second.refreshToken).not.toBe(first.refreshToken); // new token

    const userRowSecond = await prisma.client.user.findFirst({ where: { phoneE164: phone } });
    // phoneVerifiedAt is sticky from the first verify — does NOT move.
    expect(userRowSecond?.phoneVerifiedAt?.toISOString()).toBe(startTime.toISOString());
    // lastLoginAt should now be the new (advanced) clock instant.
    const expectedLastLogin = new Date(startTime.getTime() + 2 * 60 * 60 * 1000);
    expect(userRowSecond?.lastLoginAt?.toISOString()).toBe(expectedLastLogin.toISOString());

    // Refresh tokens: each verify opens a NEW family.
    const refreshes = await prisma.client.refreshToken.findMany({
      where: { userId: userIdFirst },
      orderBy: { createdAt: "asc" },
    });
    expect(refreshes).toHaveLength(2);
    expect(refreshes[0]!.familyId).not.toBe(refreshes[1]!.familyId);

    // Outbox after second login: NO new UserCreated; UserLoggedIn yes.
    const eventTypesAll = (
      await prisma.client.outboxEvent.findMany({
        where: { aggregateType: { in: ["User", "RefreshToken", "OtpRequest"] } },
        select: { eventType: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      })
    ).map((e) => e.eventType);
    // exactly one UserCreated (from first login)
    expect(eventTypesAll.filter((t) => t === "identity.UserCreated")).toHaveLength(1);
    // two UserLoggedIn (one per verify)
    expect(eventTypesAll.filter((t) => t === "identity.UserLoggedIn")).toHaveLength(2);
  });
});
