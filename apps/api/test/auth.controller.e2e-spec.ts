import { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import { Logger } from "nestjs-pino";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { AppModule } from "../src/app.module";
import { uniquePhone } from "./helpers/phone-factory";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { RedisService } from "../src/common/redis/redis.service";
import { configureApp } from "../src/configure-app";
import { MockSmsSender } from "../src/modules/identity/infrastructure/sms/mock-sms-sender";

const OTP_CODE_REGEX = /(\d{6})/;

/**
 * Sliding-window IP rate limit defaults to 3 OTP requests per minute. Without
 * unique IPs across sibling tests, the 4th `POST /auth/otp/request` in a suite
 * trips the IP bucket and the test that owns it sees a 429. Two layers of
 * defense:
 *  1. Each test uses `uniquePhone()` (avoids per-phone bucket cross-talk).
 *  2. `beforeEach` purges all `rl:otp:*` Redis keys (avoids per-IP bucket
 *     cross-talk when supertest defaults to ::1 / 127.0.0.1).
 */
describe("Auth e2e — full lifecycle", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let redis: RedisService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

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
    const rlKeys = await redis.client.keys("rl:otp:*");
    if (rlKeys.length) await redis.client.del(...rlKeys);
  });

  describe("POST /auth/otp/request", () => {
    it("returns 202 + requestId+expiresAt on valid TR mobile", async () => {
      const res = await request(app.getHttpServer())
        .post("/auth/otp/request")
        .send({ phone: uniquePhone() });

      expect(res.status).toBe(202);
      expect(res.body).toMatchObject({
        requestId: expect.any(String),
        expiresAt: expect.any(String),
      });
      expect(res.body).not.toHaveProperty("code");
    });

    it("returns 400 INVALID_PHONE for non-TR numbers", async () => {
      const res = await request(app.getHttpServer())
        .post("/auth/otp/request")
        .send({ phone: "+15551234567" });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe("VALIDATION_ERROR");
    });

    it("idempotency: same key + same body → replay (single OTP row in DB)", async () => {
      const phone = uniquePhone();
      const idemKey = `e2e-idem-${Date.now().toString()}`;

      const first = await request(app.getHttpServer())
        .post("/auth/otp/request")
        .set("Idempotency-Key", idemKey)
        .send({ phone });
      expect(first.status).toBe(202);

      const replay = await request(app.getHttpServer())
        .post("/auth/otp/request")
        .set("Idempotency-Key", idemKey)
        .send({ phone });
      expect(replay.status).toBe(202);
      expect(replay.body.requestId).toBe(first.body.requestId);

      const otpCount = await prisma.client.otpRequest.count({ where: { phoneE164: phone } });
      expect(otpCount).toBe(1);
    });

    it("idempotency: same key + different body → 409 CONFLICT", async () => {
      const idemKey = `e2e-idem-collide-${Date.now().toString()}`;
      const phoneA = uniquePhone();
      const phoneB = uniquePhone();

      const first = await request(app.getHttpServer())
        .post("/auth/otp/request")
        .set("Idempotency-Key", idemKey)
        .send({ phone: phoneA });
      expect(first.status).toBe(202);

      const collide = await request(app.getHttpServer())
        .post("/auth/otp/request")
        .set("Idempotency-Key", idemKey)
        .send({ phone: phoneB });
      expect(collide.status).toBe(409);
      expect(collide.body.code).toBe("CONFLICT");
    });

    it("writes OtpRequested to outbox in same transaction as OTP row", async () => {
      const phone = uniquePhone();
      const res = await request(app.getHttpServer())
        .post("/auth/otp/request")
        .set("X-Forwarded-For", "192.0.2.50")
        .send({ phone });
      expect(res.status).toBe(202);

      const created = await prisma.client.otpRequest.findFirst({
        where: { phoneE164: phone },
        orderBy: { createdAt: "desc" },
      });
      expect(created).not.toBeNull();

      const events = await prisma.client.outboxEvent.findMany({
        where: {
          eventType: "identity.OtpRequested",
          aggregateType: "OtpRequest",
          aggregateId: created!.id,
        },
      });
      expect(events.length).toBe(1);
    });
  });

  describe("POST /auth/otp/verify + token lifecycle", () => {
    async function requestOtpAndGetCode(phone: string, ip = "192.0.2.51") {
      const res = await request(app.getHttpServer())
        .post("/auth/otp/request")
        .set("X-Forwarded-For", ip)
        .send({ phone });
      expect(res.status).toBe(202);
      const last = MockSmsSender._testOnlyGetLast(phone);
      expect(last).toBeDefined();
      const match = OTP_CODE_REGEX.exec(last!.body);
      expect(match).not.toBeNull();
      return { requestId: res.body.requestId as string, code: match![1] };
    }

    it("happy path: verify returns tokens, /auth/me works with access token", async () => {
      const phone = uniquePhone();
      const { requestId, code } = await requestOtpAndGetCode(phone);

      const verify = await request(app.getHttpServer())
        .post("/auth/otp/verify")
        .set("X-Forwarded-For", "192.0.2.51")
        .send({ phone, requestId, code });
      expect(verify.status).toBe(200);
      expect(verify.body.accessToken).toEqual(expect.any(String));
      expect(verify.body.refreshToken).toEqual(expect.any(String));
      expect(verify.body.user.phoneE164).toBe(phone);
      expect(verify.body.user.role).toBe("CUSTOMER");

      const me = await request(app.getHttpServer())
        .get("/auth/me")
        .set("Authorization", `Bearer ${verify.body.accessToken as string}`);
      expect(me.status).toBe(200);
      expect(me.body.phoneE164).toBe(phone);
    });

    it("rejects /auth/me without Bearer token", async () => {
      const res = await request(app.getHttpServer()).get("/auth/me");
      expect(res.status).toBe(401);
      expect(res.body.code).toBe("UNAUTHORIZED");
    });

    it("rejects /auth/me with malformed token", async () => {
      const res = await request(app.getHttpServer())
        .get("/auth/me")
        .set("Authorization", "Bearer not.a.real.jwt");
      expect(res.status).toBe(401);
    });

    it("wrong code returns INVALID_OTP with remainingAttempts", async () => {
      const phone = uniquePhone();
      const { requestId } = await requestOtpAndGetCode(phone, "192.0.2.52");

      const wrong = await request(app.getHttpServer())
        .post("/auth/otp/verify")
        .set("X-Forwarded-For", "192.0.2.52")
        .send({ phone, requestId, code: "999999" });
      expect(wrong.status).toBe(400);
      expect(wrong.body.code).toBe("INVALID_OTP");
      expect(wrong.body.details.remainingAttempts).toBeGreaterThanOrEqual(0);
    });

    it("invalidates OTP after 5 wrong attempts (6th is consumed/not-found)", async () => {
      const phone = uniquePhone();
      const { requestId } = await requestOtpAndGetCode(phone, "192.0.2.53");

      for (let i = 0; i < 5; i++) {
        const r = await request(app.getHttpServer())
          .post("/auth/otp/verify")
          .set("X-Forwarded-For", "192.0.2.53")
          .send({ phone, requestId, code: "999999" });
        expect(r.status).toBe(400);
      }
      const sixth = await request(app.getHttpServer())
        .post("/auth/otp/verify")
        .set("X-Forwarded-For", "192.0.2.53")
        .send({ phone, requestId, code: "999999" });
      // After 5th attempt the row is marked consumed → 409 OTP_ALREADY_CONSUMED
      expect(sixth.status).toBe(409);
      expect(sixth.body.code).toBe("OTP_ALREADY_CONSUMED");
    });

    it("refresh rotates tokens; reuse triggers family revoke (401)", async () => {
      const phone = uniquePhone();
      const { requestId, code } = await requestOtpAndGetCode(phone, "192.0.2.54");
      const verify = await request(app.getHttpServer())
        .post("/auth/otp/verify")
        .set("X-Forwarded-For", "192.0.2.54")
        .send({ phone, requestId, code });
      expect(verify.status).toBe(200);
      const initialRefresh = verify.body.refreshToken as string;

      const rotate1 = await request(app.getHttpServer())
        .post("/auth/tokens/refresh")
        .send({ refreshToken: initialRefresh });
      expect(rotate1.status).toBe(200);
      expect(rotate1.body.refreshToken).not.toBe(initialRefresh);

      // Replay the now-revoked initial refresh → reuse detected → 401, cascade revoke
      const reuse = await request(app.getHttpServer())
        .post("/auth/tokens/refresh")
        .send({ refreshToken: initialRefresh });
      expect(reuse.status).toBe(401);
      expect(reuse.body.code).toBe("REFRESH_REUSE_DETECTED");

      // The rotate1 refresh should now be revoked too (cascade)
      const aftermath = await request(app.getHttpServer())
        .post("/auth/tokens/refresh")
        .send({ refreshToken: rotate1.body.refreshToken as string });
      expect(aftermath.status).toBe(401);
    });
  });
});
