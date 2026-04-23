import { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import { Logger } from "nestjs-pino";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { configureApp } from "../src/configure-app";

describe("Auth e2e — POST /auth/otp/request", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
    app.useLogger(app.get(Logger));
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns 202 + requestId+expiresAt on valid TR mobile", async () => {
    const res = await request(app.getHttpServer())
      .post("/auth/otp/request")
      .send({ phone: "+905551112233" });

    expect(res.status).toBe(202);
    expect(res.body).toMatchObject({
      requestId: expect.any(String),
      expiresAt: expect.any(String),
    });
    expect(res.body).not.toHaveProperty("code"); // OTP code never returned
  });

  it("returns 400 INVALID_PHONE for non-TR numbers", async () => {
    const res = await request(app.getHttpServer())
      .post("/auth/otp/request")
      .send({ phone: "+15551234567" });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  it("idempotency: same key + same body → replay (single OTP row in DB)", async () => {
    const phone = "+905552223344";
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

    const otpCount = await prisma.client.otpRequest.count({
      where: { phoneE164: phone },
    });
    expect(otpCount).toBe(1);
  });

  it("idempotency: same key + different body → 409 CONFLICT", async () => {
    const idemKey = `e2e-idem-collide-${Date.now().toString()}`;

    const first = await request(app.getHttpServer())
      .post("/auth/otp/request")
      .set("Idempotency-Key", idemKey)
      .send({ phone: "+905553334455" });
    expect(first.status).toBe(202);

    const collide = await request(app.getHttpServer())
      .post("/auth/otp/request")
      .set("Idempotency-Key", idemKey)
      .send({ phone: "+905554445566" });
    expect(collide.status).toBe(409);
    expect(collide.body.code).toBe("CONFLICT");
  });

  it("writes OtpRequested to outbox in same transaction as OTP row", async () => {
    const phone = "+905556667788";
    // Unique IP so per_ip_minute rate limit (set by earlier tests) doesn't
    // trip this case. AppModule sets `trust proxy 1`, so X-Forwarded-For wins.
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
    const payload = events[0]!.payload as { phoneE164: string; channel: string };
    expect(payload.phoneE164).toBe(phone);
    expect(payload.channel).toBe("SMS");
  });
});
