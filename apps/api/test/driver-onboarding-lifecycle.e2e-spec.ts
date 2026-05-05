import { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import { Logger } from "nestjs-pino";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { AppModule } from "../src/app.module";
import { setupCatalogFixtures } from "./helpers/catalog-fixtures";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { RedisService } from "../src/common/redis/redis.service";
import { configureApp } from "../src/configure-app";
import { MockSmsSender } from "../src/modules/notifications/infrastructure/senders/mock-sms-sender";

const OTP_CODE_REGEX = /(\d{6})/;
const VALID_TCKN = "11111111110";
const VALID_IBAN = "TR330006100519786457841326";
const ADMIN_PHONE = "+905559020001";
const CUSTOMER_PHONE = "+905559020002";

/**
 * Phase 1 closeout proof: a single driver completes the full onboarding
 * journey end-to-end, then opens a vehicle and blocks calendar availability.
 * If this passes, every Phase 1 user-facing happy path works against real
 * Postgres + Redis + MinIO containers.
 */
describe("Driver onboarding lifecycle (Phase 1 closeout proof)", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let redis: RedisService;
  let catalogFixtures: { categoryId: string; vehicleTypeId: string };

  async function login(phone: string): Promise<string> {
    const reqRes = await request(app.getHttpServer()).post("/auth/otp/request").send({ phone });
    expect(reqRes.status).toBe(202);
    const requestId = reqRes.body.requestId as string;
    const last = MockSmsSender._testOnlyGetLast(phone);
    const code = OTP_CODE_REGEX.exec(last!.body)?.[1];
    const verRes = await request(app.getHttpServer())
      .post("/auth/otp/verify")
      .send({ phone, requestId, code });
    expect(verRes.status).toBe(200);
    return verRes.body.accessToken as string;
  }

  async function uploadDocument(
    token: string,
    type: "DRIVER_LICENSE" | "IDENTITY_CARD" | "VEHICLE_REGISTRATION" | "INSURANCE",
  ): Promise<void> {
    const body = Buffer.from(`PDF ${type}`);
    const reqUrl = await request(app.getHttpServer())
      .post("/supply/driver-profiles/me/documents/upload-url")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `e2e-doc-${type}-${Date.now().toString()}`)
      .send({
        type,
        fileName: `${type.toLowerCase()}.pdf`,
        fileSize: body.byteLength,
        mimeType: "application/pdf",
      });
    expect(reqUrl.status).toBe(201);
    const { documentId, uploadUrl } = reqUrl.body as { documentId: string; uploadUrl: string };

    const putRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(body.byteLength),
      },
      body,
    });
    expect(putRes.status).toBe(200);

    const confirmRes = await request(app.getHttpServer())
      .post(`/supply/driver-profiles/me/documents/${documentId}/confirm`)
      .set("Authorization", `Bearer ${token}`);
    expect(confirmRes.status).toBe(200);
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
    app.useLogger(app.get(Logger));
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    redis = app.get(RedisService);
    catalogFixtures = await setupCatalogFixtures(prisma.client);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    MockSmsSender._testOnlyReset();
    // FK-aware cleanup. Order: availabilities → docs → vehicles → driver_profiles
    // → refresh → otp → users (only the e2e ones).
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
    await prisma.client.user.deleteMany({ where: { phoneE164: { startsWith: "+90555902" } } });
    const rlKeys = await redis.client.keys("rl:otp:*");
    if (rlKeys.length) await redis.client.del(...rlKeys);

    // Bootstrap admin directly so OTP can issue a token whose user already
    // has ADMIN role on the next DB hydration (JwtAuthGuard re-reads from DB).
    await prisma.client.user.create({
      data: {
        phoneE164: ADMIN_PHONE,
        role: "ADMIN",
        phoneVerifiedAt: new Date(),
        displayName: "E2E Admin",
      },
    });
  });

  it("completes the full driver journey: signup → docs → admin approve → vehicle → activate → availability", async () => {
    // 1. Customer logs in as CUSTOMER.
    const customerToken = await login(CUSTOMER_PHONE);

    // 2. Customer creates a driver profile (DRAFT).
    const profileRes = await request(app.getHttpServer())
      .post("/supply/driver-profiles")
      .set("Authorization", `Bearer ${customerToken}`)
      .set("Idempotency-Key", `e2e-profile-${Date.now().toString()}`)
      .send({
        firstName: "Ahmet",
        lastName: "Yılmaz",
        nationalId: VALID_TCKN,
        birthDate: "1990-06-15",
        iban: VALID_IBAN,
      });
    expect(profileRes.status).toBe(201);
    const profileId = profileRes.body.id as string;
    expect(profileRes.body.status).toBe("DRAFT");

    // 3. Upload all four required documents through the real presigned PUT flow.
    await uploadDocument(customerToken, "DRIVER_LICENSE");
    await uploadDocument(customerToken, "IDENTITY_CARD");
    await uploadDocument(customerToken, "VEHICLE_REGISTRATION");
    await uploadDocument(customerToken, "INSURANCE");

    // 4. Submit for review.
    const submitRes = await request(app.getHttpServer())
      .post("/supply/driver-profiles/me/submit")
      .set("Authorization", `Bearer ${customerToken}`)
      .set("Idempotency-Key", `e2e-submit-${Date.now().toString()}`);
    expect(submitRes.status).toBe(200);
    expect(submitRes.body.status).toBe("DOCUMENTS_PENDING");

    // 5. Admin logs in (the bootstrap admin from beforeEach).
    const adminToken = await login(ADMIN_PHONE);

    // 6. Admin sees the new driver in the pending queue.
    const queueRes = await request(app.getHttpServer())
      .get("/admin/supply/driver-profiles?status=DOCUMENTS_PENDING")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(queueRes.status).toBe(200);
    expect(queueRes.body.items).toHaveLength(1);
    expect(queueRes.body.items[0].id).toBe(profileId);

    // 7. Admin approves the driver. Same-tx: user.role becomes DRIVER.
    const approveRes = await request(app.getHttpServer())
      .post(`/admin/supply/driver-profiles/${profileId}/approve`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("Idempotency-Key", `e2e-approve-${Date.now().toString()}`);
    expect(approveRes.status).toBe(200);
    expect(approveRes.body.status).toBe("APPROVED");

    const promotedUser = await prisma.client.user.findFirst({
      where: { phoneE164: CUSTOMER_PHONE },
    });
    expect(promotedUser?.role).toBe("DRIVER");

    // 8. Customer's existing access token still works — JwtAuthGuard re-hydrates
    //    from DB on every request, so the next call sees role=DRIVER without
    //    a token refresh round-trip.
    const meRes = await request(app.getHttpServer())
      .get("/auth/me")
      .set("Authorization", `Bearer ${customerToken}`);
    expect(meRes.status).toBe(200);
    expect(meRes.body.role).toBe("DRIVER");

    // 9. Driver registers a vehicle against the fixture category seeded in beforeAll.
    const vehicleRes = await request(app.getHttpServer())
      .post("/supply/driver-profiles/me/vehicles")
      .set("Authorization", `Bearer ${customerToken}`)
      .set("Idempotency-Key", `e2e-vehicle-${Date.now().toString()}`)
      .send({
        vehicleTypeId: catalogFixtures.vehicleTypeId,
        plateNumber: "34 ABC 1234",
        brand: "Mercedes",
        model: "E200",
        year: 2022,
        color: "Beyaz",
        attributes: {
          trim_color: "white",
          has_air_conditioning: true,
          has_chauffeur: true,
        },
      });
    expect(vehicleRes.status).toBe(201);
    const vehicleId = vehicleRes.body.id as string;
    expect(vehicleRes.body.status).toBe("DRAFT");

    // 10. Admin activates the vehicle.
    const activateRes = await request(app.getHttpServer())
      .post(`/admin/supply/vehicles/${vehicleId}/activate`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("Idempotency-Key", `e2e-activate-${Date.now().toString()}`);
    expect(activateRes.status).toBe(200);
    expect(activateRes.body.status).toBe("ACTIVE");

    // 11. Driver blocks an availability slot tomorrow 10:00–12:00.
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const start = new Date(tomorrow);
    start.setUTCHours(10, 0, 0, 0);
    const end = new Date(tomorrow);
    end.setUTCHours(12, 0, 0, 0);
    const blockRes = await request(app.getHttpServer())
      .post(`/supply/driver-profiles/me/vehicles/${vehicleId}/availability`)
      .set("Authorization", `Bearer ${customerToken}`)
      .set("Idempotency-Key", `e2e-block-${Date.now().toString()}`)
      .send({
        startAt: start.toISOString(),
        endAt: end.toISOString(),
        reason: "Bakım",
      });
    expect(blockRes.status).toBe(201);
    expect(blockRes.body.type).toBe("BLOCKED");

    // 12. Public availability check inside the blocked range — busy.
    const probeStart = new Date(tomorrow);
    probeStart.setUTCHours(11, 0, 0, 0);
    const probeEnd = new Date(tomorrow);
    probeEnd.setUTCHours(13, 0, 0, 0);
    const conflictRes = await request(app.getHttpServer()).get(
      `/supply/vehicles/${vehicleId}/availability/check?startAt=${probeStart.toISOString()}&endAt=${probeEnd.toISOString()}`,
    );
    expect(conflictRes.status).toBe(200);
    expect(conflictRes.body.free).toBe(false);
    expect(conflictRes.body.conflicts).toHaveLength(1);

    // 13. Public availability check after the blocked range — free.
    const freeStart = new Date(tomorrow);
    freeStart.setUTCHours(14, 0, 0, 0);
    const freeEnd = new Date(tomorrow);
    freeEnd.setUTCHours(16, 0, 0, 0);
    const freeRes = await request(app.getHttpServer()).get(
      `/supply/vehicles/${vehicleId}/availability/check?startAt=${freeStart.toISOString()}&endAt=${freeEnd.toISOString()}`,
    );
    expect(freeRes.status).toBe(200);
    expect(freeRes.body.free).toBe(true);
    expect(freeRes.body.conflicts).toHaveLength(0);

    // 14. Outbox: every aggregate emitted at least one domain event.
    const counts = await prisma.client.outboxEvent.groupBy({
      by: ["eventType"],
      _count: true,
    });
    const seen = new Set(counts.map((c) => c.eventType));
    expect(seen).toContain("supply.DriverProfileCreated");
    expect(seen).toContain("supply.DocumentUploaded");
    expect(seen).toContain("supply.DriverSubmittedForReview");
    expect(seen).toContain("supply.DriverApproved");
    expect(seen).toContain("supply.VehicleRegistered");
    expect(seen).toContain("supply.VehicleActivated");
    expect(seen).toContain("supply.AvailabilityBlocked");
  }, 120_000);
});
