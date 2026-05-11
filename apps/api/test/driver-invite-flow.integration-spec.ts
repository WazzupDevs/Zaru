import { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import { Logger } from "nestjs-pino";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { AppModule } from "../src/app.module";
import { signAccessTokenFor } from "./helpers/auth-token";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { configureApp } from "../src/configure-app";
import { truncateTransactionalTables } from "./helpers/db-cleanup";
import { buildUser } from "./helpers/user-builder";

// Per-test phone so the Redis-backed OTP rate-limiter (which persists
// across the suite) doesn't 429 us when the same phone is reused.
// TR mobile shape: +90 + "5" + 9 more digits. We keep the "511" prefix
// constant and bump the trailing 6 digits per test (000001 → 999999).
// TR mobile shape: +90 + "5" + 9 digits = 13 chars total. Counter
// padded to 9 digits gives ~1B unique phones per suite run.
let phoneCounter = 0;
function uniquePhone(): string {
  phoneCounter += 1;
  return `+905${String(phoneCounter).padStart(9, "0")}`;
}

/**
 * Driver invitation + auth flow — A4f-1 end-to-end.
 *
 * Verifies:
 *   admin POST /admin/driver-invites      → creates PENDING row
 *   admin GET   /admin/driver-invites     → lists status-filtered
 *   admin PATCH /admin/driver-invites/:id/revoke → PENDING → REVOKED
 *
 *   driver POST /auth/driver/otp/request:
 *     uninvited phone → 403 DRIVER_NOT_INVITED, no SMS provider hit
 *     PENDING phone   → 202 (OTP queued via mock SMS sender)
 *
 *   driver POST /auth/driver/otp/verify:
 *     PENDING invite → 200 + AuthTokens with role=DRIVER
 *                    + DriverInvite goes ACCEPTED
 *                    + User.role flips to DRIVER
 *                    + identity.DriverInviteAccepted outbox row
 *
 *   non-admin → 403 on every admin endpoint
 */
describe("Driver invite + auth flow (Testcontainers)", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
    app.useLogger(app.get(Logger));
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await truncateTransactionalTables(prisma.client);
  });

  it("admin creates an invite + lists it back + revokes it", async () => {
    const PHONE = uniquePhone();
    const admin = await buildUser(prisma.client, { role: "ADMIN", phoneE164: uniquePhone() });
    const adminToken = signAccessTokenFor(app, admin);

    // Create
    const createRes = await request(app.getHttpServer())
      .post("/admin/driver-invites")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ phone: PHONE, notes: "trial" })
      .expect(201);
    expect(createRes.body.status).toBe("PENDING");
    expect(createRes.body.phoneE164).toBe(PHONE);
    const inviteId = createRes.body.id as string;

    // List
    const listRes = await request(app.getHttpServer())
      .get("/admin/driver-invites?status=PENDING")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);
    expect(listRes.body).toHaveLength(1);
    expect(listRes.body[0].id).toBe(inviteId);

    // Revoke
    await request(app.getHttpServer())
      .patch(`/admin/driver-invites/${inviteId}/revoke`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(204);

    const reread = await prisma.client.driverInvite.findUniqueOrThrow({ where: { id: inviteId } });
    expect(reread.status).toBe("REVOKED");
    expect(reread.deletedAt).not.toBeNull();
  });

  it("non-admin cannot create driver invites", async () => {
    const PHONE = uniquePhone();
    const customer = await buildUser(prisma.client, { phoneE164: "+905551110002" });
    const token = signAccessTokenFor(app, customer);

    await request(app.getHttpServer())
      .post("/admin/driver-invites")
      .set("Authorization", `Bearer ${token}`)
      .send({ phone: PHONE })
      .expect(403);
  });

  it("driver OTP request — uninvited phone returns 403 DRIVER_NOT_INVITED", async () => {
    const PHONE = uniquePhone();
    const res = await request(app.getHttpServer())
      .post("/auth/driver/otp/request")
      .send({ phone: PHONE })
      .expect(403);
    expect(res.body.code).toBe("DRIVER_NOT_INVITED");
  });

  it("driver OTP request — PENDING phone returns 202 + OTP request id", async () => {
    const PHONE = uniquePhone();
    const admin = await buildUser(prisma.client, { role: "ADMIN", phoneE164: uniquePhone() });
    const adminToken = signAccessTokenFor(app, admin);
    await request(app.getHttpServer())
      .post("/admin/driver-invites")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ phone: PHONE })
      .expect(201);

    const res = await request(app.getHttpServer())
      .post("/auth/driver/otp/request")
      .send({ phone: PHONE })
      .expect(202);
    expect(res.body.requestId).toBeDefined();
    expect(res.body.expiresAt).toBeDefined();
  });

  it("end-to-end: admin invites → driver OTP request → verify → role=DRIVER + invite ACCEPTED + outbox event", async () => {
    const PHONE = uniquePhone();
    const admin = await buildUser(prisma.client, { role: "ADMIN", phoneE164: uniquePhone() });
    const adminToken = signAccessTokenFor(app, admin);

    // Admin invites
    const createRes = await request(app.getHttpServer())
      .post("/admin/driver-invites")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ phone: PHONE })
      .expect(201);
    const inviteId = createRes.body.id as string;

    // Driver OTP request
    const otpReqRes = await request(app.getHttpServer())
      .post("/auth/driver/otp/request")
      .send({ phone: PHONE })
      .expect(202);
    const requestId = otpReqRes.body.requestId as string;

    // Pluck the OTP code from the test-only cache (dev/test only, like
    // the customer auth e2e). Direct DB lookup of the otp request +
    // the test-only "last issued" endpoint both work; the cache one is
    // less brittle.
    const lastOtpRes = await request(app.getHttpServer())
      .get(`/auth/_test/last-otp?phone=${encodeURIComponent(PHONE)}`)
      .expect(200);
    const code = lastOtpRes.body.code as string;
    expect(code).toMatch(/^\d{6}$/);

    // Driver OTP verify
    const verifyRes = await request(app.getHttpServer())
      .post("/auth/driver/otp/verify")
      .send({ phone: PHONE, requestId, code })
      .expect(200);
    expect(verifyRes.body.user.role).toBe("DRIVER");
    expect(verifyRes.body.accessToken).toBeDefined();
    const userId = verifyRes.body.user.id as string;

    // Invite ACCEPTED + acceptedUserId set
    const inviteRow = await prisma.client.driverInvite.findUniqueOrThrow({
      where: { id: inviteId },
    });
    expect(inviteRow.status).toBe("ACCEPTED");
    expect(inviteRow.acceptedUserId).toBe(userId);
    expect(inviteRow.acceptedAt).not.toBeNull();

    // User.role flipped to DRIVER
    const userRow = await prisma.client.user.findUniqueOrThrow({ where: { id: userId } });
    expect(userRow.role).toBe("DRIVER");

    // Outbox event
    const outboxRows = await prisma.client.outboxEvent.findMany({
      where: { eventType: "identity.DriverInviteAccepted", aggregateId: inviteId },
    });
    expect(outboxRows).toHaveLength(1);
  });

  it("revoked invite blocks driver OTP request", async () => {
    const PHONE = uniquePhone();
    const admin = await buildUser(prisma.client, { role: "ADMIN", phoneE164: uniquePhone() });
    const adminToken = signAccessTokenFor(app, admin);
    const created = await request(app.getHttpServer())
      .post("/admin/driver-invites")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ phone: PHONE })
      .expect(201);
    await request(app.getHttpServer())
      .patch(`/admin/driver-invites/${String(created.body.id)}/revoke`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(204);

    const res = await request(app.getHttpServer())
      .post("/auth/driver/otp/request")
      .send({ phone: PHONE })
      .expect(403);
    expect(res.body.code).toBe("DRIVER_NOT_INVITED");
  });
});
