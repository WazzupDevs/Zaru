import * as argon2 from "argon2";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("argon2", () => ({
  verify: vi.fn(),
  hash: vi.fn(),
  argon2id: 2,
}));

import { VerifyOtpUseCase } from "./verify-otp.use-case";
import { FrozenClock } from "../../../../../test/fakes/frozen-clock";
import { InMemoryRateLimiter } from "../../../../../test/fakes/in-memory-rate-limiter";
import { InvalidOtpError } from "../../domain/errors/invalid-otp.error";
import { OtpAlreadyConsumedError } from "../../domain/errors/otp-already-consumed.error";
import { OtpExpiredError } from "../../domain/errors/otp-expired.error";
import { OtpNotFoundError } from "../../domain/errors/otp-not-found.error";
import {
  type JwtTokenServicePort,
  type RefreshTokenSecret,
  type SignedAccessToken,
} from "../ports/jwt-token.service.port";
import {
  type OtpRequestFullRecord,
  type OtpRequestRepositoryPort,
} from "../ports/otp-request.repository.port";
import {
  type IssueRefreshTokenInput,
  type RefreshTokenRecord,
  type RefreshTokenRepositoryPort,
} from "../ports/refresh-token.repository.port";
import { type UserRecord, type UserRepositoryPort } from "../ports/user.repository.port";

import type { TxClient } from "../../../../common/persistence/tx-client";

const NOW = new Date("2026-04-23T05:00:00.000Z");
const OTP_TTL_MS = 5 * 60_000;
const PHONE = "+905551234567";
const IP = "192.0.2.10";
const REQUEST_ID = "01890d8e-3b9c-7000-8000-000000000001";
const USER_ID = "01890d8e-3b9c-7000-8000-000000000002";
const REFRESH_ID = "01890d8e-3b9c-7000-8000-000000000003";

interface Mocks {
  otpRepo: OtpRequestRepositoryPort;
  userRepo: UserRepositoryPort;
  refreshRepo: RefreshTokenRepositoryPort;
  jwt: JwtTokenServicePort;
  clock: FrozenClock;
  outbox: { write: ReturnType<typeof vi.fn> };
  txRunner: { run: ReturnType<typeof vi.fn> };
  rateLimiter: InMemoryRateLimiter;
}

function buildOtpRow(overrides: Partial<OtpRequestFullRecord> = {}): OtpRequestFullRecord {
  return {
    id: REQUEST_ID,
    phoneE164: PHONE,
    channel: "SMS",
    purpose: "LOGIN",
    codeHash: "hash-placeholder",
    expiresAt: new Date(NOW.getTime() + OTP_TTL_MS),
    consumedAt: null,
    attemptCount: 0,
    createdAt: new Date(NOW.getTime() - 60_000),
    ...overrides,
  };
}

function buildUser(overrides: Partial<UserRecord> = {}): UserRecord {
  return {
    id: USER_ID,
    phoneE164: PHONE,
    displayName: null,
    role: "CUSTOMER",
    phoneVerifiedAt: NOW,
    lastLoginAt: NOW,
    createdAt: NOW,
    ...overrides,
  };
}

function buildMocks(
  opts: {
    otpRow?: OtpRequestFullRecord | null;
    existingUser?: UserRecord | null;
    codeHashMatches?: boolean;
  } = {},
): Mocks {
  const { otpRow = buildOtpRow(), existingUser = null, codeHashMatches = true } = opts;

  vi.mocked(argon2.verify).mockResolvedValue(codeHashMatches);

  const otpRepo: OtpRequestRepositoryPort = {
    createWithOutbox: vi.fn(),
    findByIdAndPhone: vi.fn().mockResolvedValue(otpRow),
    incrementAttempt: vi.fn().mockResolvedValue((otpRow?.attemptCount ?? 0) + 1),
    consume: vi.fn().mockResolvedValue(undefined),
  };

  const userRepo: UserRepositoryPort = {
    findActiveByPhone: vi.fn().mockResolvedValue(existingUser),
    findActiveById: vi.fn().mockResolvedValue(existingUser ?? buildUser()),
    createVerified: vi.fn().mockResolvedValue(buildUser()),
    touchLastLogin: vi.fn().mockResolvedValue(undefined),
    updatePushToken: vi.fn().mockResolvedValue(undefined),
  };

  const refreshRepo: RefreshTokenRepositoryPort = {
    issue: vi.fn().mockImplementation((_tx: TxClient, input: IssueRefreshTokenInput) =>
      Promise.resolve<RefreshTokenRecord>({
        id: REFRESH_ID,
        userId: input.userId,
        tokenHash: input.tokenHash,
        familyId: input.familyId,
        expiresAt: input.expiresAt,
        revokedAt: null,
        replacedById: null,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
        createdAt: NOW,
      }),
    ),
    findByHash: vi.fn(),
    revokeAndLink: vi.fn(),
    revokeFamily: vi.fn(),
  };

  const accessToken: SignedAccessToken = {
    token: "access-jwt",
    expiresAt: new Date(NOW.getTime() + 900_000),
  };
  const refreshSecret: RefreshTokenSecret = {
    plaintext: "refresh-plaintext-base64url",
    hash: "refresh-sha256-hash",
    expiresAt: new Date(NOW.getTime() + 2_592_000_000),
  };
  const jwt: JwtTokenServicePort = {
    signAccess: vi.fn().mockReturnValue(accessToken),
    verifyAccess: vi.fn(),
    generateRefresh: vi.fn().mockReturnValue(refreshSecret),
    hashRefresh: vi.fn().mockReturnValue("refresh-sha256-hash"),
  };

  const clock = new FrozenClock(NOW);

  const outbox = { write: vi.fn().mockResolvedValue(undefined) };

  // txRunner: pretend we're inside a $transaction by passing the same fake tx
  // through. The use case only calls repo methods; it never touches the tx
  // object directly.
  const fakeTx = {} as TxClient;
  const txRunner = {
    run: vi.fn().mockImplementation(async <T>(fn: (tx: TxClient) => Promise<T>) => fn(fakeTx)),
  };

  const rateLimiter = new InMemoryRateLimiter(() => NOW.getTime());

  return { otpRepo, userRepo, refreshRepo, jwt, clock, outbox, txRunner, rateLimiter };
}

function buildUseCase(m: Mocks): VerifyOtpUseCase {
  return new VerifyOtpUseCase(
    m.otpRepo,
    m.userRepo,
    m.refreshRepo,
    m.jwt,
    m.clock,
    m.outbox,
    m.txRunner,
    m.rateLimiter,
  );
}

describe("VerifyOtpUseCase", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("happy path (new user): provisions user, consumes OTP, issues tokens, emits events", async () => {
    const m = buildMocks({ existingUser: null });
    const sut = buildUseCase(m);

    const result = await sut.execute({
      phone: PHONE,
      requestId: REQUEST_ID,
      code: "123456",
      ipAddress: IP,
      userAgent: "JestAgent/1.0",
    });

    expect(result.user.id).toBe(USER_ID);
    expect(result.accessToken).toBe("access-jwt");
    expect(result.refreshToken).toBe("refresh-plaintext-base64url");
    expect(m.userRepo.createVerified).toHaveBeenCalledOnce();
    expect(m.userRepo.touchLastLogin).not.toHaveBeenCalled();
    expect(m.otpRepo.consume).toHaveBeenCalledWith(expect.anything(), REQUEST_ID, NOW);
    expect(m.refreshRepo.issue).toHaveBeenCalledOnce();
    // Three events: OtpVerified, UserCreated, UserLoggedIn, RefreshTokensIssued (4 total)
    const eventTypes = (
      m.outbox.write.mock.calls as unknown as [unknown, { eventType: string }][]
    ).map((c) => c[1].eventType);
    expect(eventTypes).toContain("identity.OtpVerified");
    expect(eventTypes).toContain("identity.UserCreated");
    expect(eventTypes).toContain("identity.UserLoggedIn");
    expect(eventTypes).toContain("identity.RefreshTokensIssued");
  });

  it("happy path (returning user): no UserCreated event, lastLoginAt touched, new family", async () => {
    const existing = buildUser({ phoneVerifiedAt: new Date(NOW.getTime() - 86_400_000) });
    const m = buildMocks({ existingUser: existing });
    const sut = buildUseCase(m);

    await sut.execute({ phone: PHONE, requestId: REQUEST_ID, code: "123456", ipAddress: IP });

    expect(m.userRepo.createVerified).not.toHaveBeenCalled();
    expect(m.userRepo.touchLastLogin).toHaveBeenCalledWith(expect.anything(), USER_ID, NOW);
    const eventTypes = (
      m.outbox.write.mock.calls as unknown as [unknown, { eventType: string }][]
    ).map((c) => c[1].eventType);
    expect(eventTypes).not.toContain("identity.UserCreated");
    expect(eventTypes).toContain("identity.UserLoggedIn");
  });

  it("wrong code increments attempt and throws InvalidOtpError with remainingAttempts", async () => {
    const m = buildMocks({ codeHashMatches: false });
    (m.otpRepo.incrementAttempt as ReturnType<typeof vi.fn>).mockResolvedValue(2);
    const sut = buildUseCase(m);

    await expect(
      sut.execute({ phone: PHONE, requestId: REQUEST_ID, code: "999999", ipAddress: IP }),
    ).rejects.toMatchObject({
      code: "INVALID_OTP",
      details: { remainingAttempts: 3 },
    });
    expect(m.otpRepo.consume).not.toHaveBeenCalled();
  });

  it("invalidates OTP after max attempts (5th wrong code)", async () => {
    const m = buildMocks({ codeHashMatches: false });
    (m.otpRepo.incrementAttempt as ReturnType<typeof vi.fn>).mockResolvedValue(5);
    const sut = buildUseCase(m);

    await expect(
      sut.execute({ phone: PHONE, requestId: REQUEST_ID, code: "999999", ipAddress: IP }),
    ).rejects.toBeInstanceOf(InvalidOtpError);
    expect(m.otpRepo.consume).toHaveBeenCalled(); // invalidated by consuming
  });

  it("expired OTP throws OtpExpiredError", async () => {
    const m = buildMocks({
      otpRow: buildOtpRow({ expiresAt: new Date(NOW.getTime() - 1) }),
    });
    const sut = buildUseCase(m);

    await expect(
      sut.execute({ phone: PHONE, requestId: REQUEST_ID, code: "123456", ipAddress: IP }),
    ).rejects.toBeInstanceOf(OtpExpiredError);
  });

  it("already consumed OTP throws OtpAlreadyConsumedError", async () => {
    const m = buildMocks({
      otpRow: buildOtpRow({ consumedAt: NOW }),
    });
    const sut = buildUseCase(m);

    await expect(
      sut.execute({ phone: PHONE, requestId: REQUEST_ID, code: "123456", ipAddress: IP }),
    ).rejects.toBeInstanceOf(OtpAlreadyConsumedError);
  });

  it("requestId mismatch (no row) throws OtpNotFoundError", async () => {
    const m = buildMocks({ otpRow: null });
    const sut = buildUseCase(m);

    await expect(
      sut.execute({ phone: PHONE, requestId: REQUEST_ID, code: "123456", ipAddress: IP }),
    ).rejects.toBeInstanceOf(OtpNotFoundError);
  });
});
