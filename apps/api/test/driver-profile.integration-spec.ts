import { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import { Logger } from "nestjs-pino";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { RedisService } from "../src/common/redis/redis.service";
import { configureApp } from "../src/configure-app";
import { MockSmsSender } from "../src/modules/identity/infrastructure/sms/mock-sms-sender";

const OTP_CODE_REGEX = /(\d{6})/;
const VALID_TCKN = "10000000146";
const VALID_IBAN = "TR330006100519786457841326";
const PHONE = "+905559010001"; // distinct from auth.e2e (901) and returning-user (909)

/**
 * Driver onboarding e2e — happy path + PII redaction smoke + status guards.
 * Admin promotion path is covered separately in A3c (admin bootstrap CLI
 * required to seed an ADMIN user reliably).
 */
describe("Supply driver-profile e2e", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let redis: RedisService;
  let accessToken: string;

  async function loginAsCustomer(phone: string): Promise<string> {
    const reqRes = await request(app.getHttpServer()).post("/auth/otp/request").send({ phone });
    expect(reqRes.status).toBe(202);
    const requestId = reqRes.body.requestId as string;
    const last = MockSmsSender._testOnlyGetLast(phone);
    const code = OTP_CODE_REGEX.exec(last!.body)?.[1];
    expect(code).toBeDefined();
    const verRes = await request(app.getHttpServer())
      .post("/auth/otp/verify")
      .send({ phone, requestId, code });
    expect(verRes.status).toBe(200);
    return verRes.body.accessToken as string;
  }

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
    MockSmsSender._testOnlyReset();
    // FK-aware cleanup. Order:
    //   availabilities → documents → vehicles → driver_profiles → refresh → otp → users.
    // VehicleAvailability landed in A3c; if a sibling lifecycle test left a
    // row behind, `vehicle.deleteMany()` trips its FK and every test in this
    // suite fails with the cross-suite contamination error. Wipe it first.
    await prisma.client.outboxEvent.deleteMany({
      where: {
        aggregateType: {
          in: [
            "DriverProfile",
            "Vehicle",
            "VehicleAvailability",
            "Document",
            "User",
            "RefreshToken",
            "OtpRequest",
          ],
        },
      },
    });
    await prisma.client.vehicleAvailability.deleteMany({});
    await prisma.client.document.deleteMany({});
    await prisma.client.vehicle.deleteMany({});
    await prisma.client.driverProfile.deleteMany({});
    await prisma.client.refreshToken.deleteMany({});
    await prisma.client.otpRequest.deleteMany({});
    await prisma.client.user.deleteMany({ where: { phoneE164: { startsWith: "+90555901" } } });
    const rlKeys = await redis.client.keys("rl:otp:*");
    if (rlKeys.length) await redis.client.del(...rlKeys);

    accessToken = await loginAsCustomer(PHONE);
  });

  describe("POST /supply/driver-profiles", () => {
    it("creates a DRAFT profile and never echoes PII back to the client", async () => {
      const res = await request(app.getHttpServer())
        .post("/supply/driver-profiles")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          firstName: "Ahmet",
          lastName: "Yılmaz",
          nationalId: VALID_TCKN,
          birthDate: "1990-06-15",
          iban: VALID_IBAN,
        });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        firstName: "Ahmet",
        lastName: "Yılmaz",
        ibanLast4: "1326",
        status: "DRAFT",
      });
      // PII surface check: nothing in the response body matches the plaintext
      // TCKN or IBAN values, and there is no hash field either.
      const json = JSON.stringify(res.body);
      expect(json).not.toContain(VALID_TCKN);
      expect(json).not.toContain(VALID_IBAN);
      expect(json).not.toContain("nationalIdHash");
      expect(json).not.toContain("ibanHash");
    });

    it("rejects invalid TCKN with VALIDATION_ERROR (Zod) before hitting domain", async () => {
      const res = await request(app.getHttpServer())
        .post("/supply/driver-profiles")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          firstName: "X",
          lastName: "Y",
          nationalId: "12345",
          birthDate: "1990-06-15",
          iban: VALID_IBAN,
        });
      expect(res.status).toBe(400);
    });

    it("rejects checksum-failing TCKN with SUPPLY_INVALID_NATIONAL_ID", async () => {
      const res = await request(app.getHttpServer())
        .post("/supply/driver-profiles")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          firstName: "X",
          lastName: "Y",
          nationalId: "12345678901",
          birthDate: "1990-06-15",
          iban: VALID_IBAN,
        });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("SUPPLY_INVALID_NATIONAL_ID");
    });

    it("rejects underage (< 18) drivers", async () => {
      const res = await request(app.getHttpServer())
        .post("/supply/driver-profiles")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          firstName: "X",
          lastName: "Y",
          nationalId: VALID_TCKN,
          birthDate: "2015-01-01",
          iban: VALID_IBAN,
        });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("SUPPLY_DRIVER_UNDERAGE");
    });

    it("DB stores hashes, never plaintext", async () => {
      await request(app.getHttpServer())
        .post("/supply/driver-profiles")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          firstName: "Ahmet",
          lastName: "Yılmaz",
          nationalId: VALID_TCKN,
          birthDate: "1990-06-15",
          iban: VALID_IBAN,
        })
        .expect(201);

      const row = await prisma.client.driverProfile.findFirst({
        where: { firstName: "Ahmet" },
      });
      expect(row).not.toBeNull();
      expect(row!.nationalIdHash).toMatch(/^[0-9a-f]{64}$/);
      expect(row!.ibanHash).toMatch(/^\$argon2id\$/);
      expect(row!.ibanLast4).toBe("1326");
      // No plaintext-shaped column exists on the row.
      const cols = Object.keys(row!);
      expect(cols).not.toContain("nationalId");
      expect(cols).not.toContain("iban");
    });
  });

  describe("POST /supply/driver-profiles/me/submit", () => {
    it("rejects with SUPPLY_INCOMPLETE_DOCUMENTS when required uploads are missing", async () => {
      await request(app.getHttpServer())
        .post("/supply/driver-profiles")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          firstName: "Ahmet",
          lastName: "Yılmaz",
          nationalId: VALID_TCKN,
          birthDate: "1990-06-15",
          iban: VALID_IBAN,
        })
        .expect(201);

      const res = await request(app.getHttpServer())
        .post("/supply/driver-profiles/me/submit")
        .set("Authorization", `Bearer ${accessToken}`)
        .set("Idempotency-Key", `e2e-submit-${Date.now().toString()}`);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("SUPPLY_INCOMPLETE_DOCUMENTS");
      expect(res.body.details.missingTypes).toEqual(
        expect.arrayContaining([
          "DRIVER_LICENSE",
          "IDENTITY_CARD",
          "VEHICLE_REGISTRATION",
          "INSURANCE",
        ]),
      );
    });
  });

  describe("authorization", () => {
    it("returns 401 without a Bearer token", async () => {
      const res = await request(app.getHttpServer()).get("/supply/driver-profiles/me");
      expect(res.status).toBe(401);
    });

    it("returns 403 on /admin/* for a CUSTOMER token", async () => {
      const res = await request(app.getHttpServer())
        .get("/admin/supply/driver-profiles")
        .set("Authorization", `Bearer ${accessToken}`);
      expect(res.status).toBe(403);
    });
  });
});
