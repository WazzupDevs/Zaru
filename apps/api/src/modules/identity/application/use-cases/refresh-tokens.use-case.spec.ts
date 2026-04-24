import { beforeEach, describe, expect, it, vi } from "vitest";

import { RefreshTokensUseCase } from "./refresh-tokens.use-case";
import { FrozenClock } from "../../../../../test/fakes/frozen-clock";
import { RefreshExpiredError } from "../../domain/errors/refresh-expired.error";
import { RefreshNotFoundError } from "../../domain/errors/refresh-not-found.error";
import { RefreshReuseDetectedError } from "../../domain/errors/refresh-reuse-detected.error";
import { UserNotFoundError } from "../../domain/errors/user-not-found.error";
import {
  type JwtTokenServicePort,
  type RefreshTokenSecret,
  type SignedAccessToken,
} from "../ports/jwt-token.service.port";
import {
  type IssueRefreshTokenInput,
  type RefreshTokenRecord,
  type RefreshTokenRepositoryPort,
} from "../ports/refresh-token.repository.port";
import {
  type UserRecord,
  type UserRepositoryPort,
  type TxClient,
} from "../ports/user.repository.port";

const NOW = new Date("2026-04-23T05:00:00.000Z");
const USER_ID = "01890d8e-3b9c-7000-8000-000000000002";
const FAMILY_ID = "01890d8e-3b9c-7000-8000-000000000099";
const OLD_TOKEN_ID = "01890d8e-3b9c-7000-8000-000000000010";
const NEW_TOKEN_ID = "01890d8e-3b9c-7000-8000-000000000011";

function buildExistingRefresh(overrides: Partial<RefreshTokenRecord> = {}): RefreshTokenRecord {
  return {
    id: OLD_TOKEN_ID,
    userId: USER_ID,
    tokenHash: "sha256-of-incoming",
    familyId: FAMILY_ID,
    expiresAt: new Date(NOW.getTime() + 86_400_000),
    revokedAt: null,
    replacedById: null,
    ipAddress: null,
    userAgent: null,
    createdAt: new Date(NOW.getTime() - 3600_000),
    ...overrides,
  };
}

function buildUser(): UserRecord {
  return {
    id: USER_ID,
    phoneE164: "+905551234567",
    displayName: null,
    role: "CUSTOMER",
    phoneVerifiedAt: NOW,
    lastLoginAt: NOW,
    createdAt: NOW,
  };
}

function buildMocks(
  opts: {
    existingRefresh?: RefreshTokenRecord | null;
    user?: UserRecord | null;
  } = {},
) {
  const { existingRefresh = buildExistingRefresh(), user = buildUser() } = opts;

  const userRepo: UserRepositoryPort = {
    findActiveByPhone: vi.fn(),
    findActiveById: vi.fn().mockResolvedValue(user),
    createVerified: vi.fn(),
    touchLastLogin: vi.fn().mockResolvedValue(undefined),
  };

  const refreshRepo: RefreshTokenRepositoryPort = {
    issue: vi.fn().mockImplementation((_tx: TxClient, input: IssueRefreshTokenInput) =>
      Promise.resolve<RefreshTokenRecord>({
        id: NEW_TOKEN_ID,
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
    findByHash: vi.fn().mockResolvedValue(existingRefresh),
    revokeAndLink: vi.fn().mockResolvedValue(undefined),
    revokeFamily: vi.fn().mockResolvedValue(3),
  };

  const accessToken: SignedAccessToken = {
    token: "new-access-jwt",
    expiresAt: new Date(NOW.getTime() + 900_000),
  };
  const refreshSecret: RefreshTokenSecret = {
    plaintext: "new-refresh-plaintext",
    hash: "new-refresh-sha256",
    expiresAt: new Date(NOW.getTime() + 2_592_000_000),
  };
  const jwt: JwtTokenServicePort = {
    signAccess: vi.fn().mockReturnValue(accessToken),
    verifyAccess: vi.fn(),
    generateRefresh: vi.fn().mockReturnValue(refreshSecret),
    hashRefresh: vi.fn().mockReturnValue("sha256-of-incoming"),
  };

  const clock = new FrozenClock(NOW);
  const outbox = { write: vi.fn().mockResolvedValue(undefined) };
  const fakeTx = {} as TxClient;
  const txRunner = {
    run: vi.fn().mockImplementation(async <T>(fn: (tx: TxClient) => Promise<T>) => fn(fakeTx)),
  };

  return { userRepo, refreshRepo, jwt, clock, outbox, txRunner };
}

function buildSut(m: ReturnType<typeof buildMocks>): RefreshTokensUseCase {
  return new RefreshTokensUseCase(m.refreshRepo, m.userRepo, m.jwt, m.clock, m.outbox, m.txRunner);
}

describe("RefreshTokensUseCase", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("happy path: issues new tokens, revokes-and-links old, preserves familyId", async () => {
    const m = buildMocks();
    const sut = buildSut(m);

    const result = await sut.execute({
      refreshToken: "incoming-plaintext",
      ipAddress: "192.0.2.20",
      userAgent: "JestAgent/1.0",
    });

    expect(result.refreshToken).toBe("new-refresh-plaintext");
    expect(result.accessToken).toBe("new-access-jwt");

    expect(m.refreshRepo.revokeAndLink).toHaveBeenCalledWith(
      expect.anything(),
      OLD_TOKEN_ID,
      NEW_TOKEN_ID,
      NOW,
    );
    expect(m.refreshRepo.issue).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ familyId: FAMILY_ID, userId: USER_ID }),
    );

    const eventTypes = (
      m.outbox.write.mock.calls as unknown as [unknown, { eventType: string }][]
    ).map((c) => c[1].eventType);
    expect(eventTypes).toContain("identity.RefreshTokensIssued");
  });

  it("revoked token replay triggers RefreshReuseDetectedError + family revoke + audit event", async () => {
    const m = buildMocks({
      existingRefresh: buildExistingRefresh({ revokedAt: new Date(NOW.getTime() - 60_000) }),
    });
    const sut = buildSut(m);

    await expect(
      sut.execute({ refreshToken: "incoming", ipAddress: "192.0.2.20" }),
    ).rejects.toBeInstanceOf(RefreshReuseDetectedError);

    expect(m.refreshRepo.revokeFamily).toHaveBeenCalledWith(expect.anything(), FAMILY_ID, NOW);
    expect(m.refreshRepo.issue).not.toHaveBeenCalled();

    const eventTypes = (
      m.outbox.write.mock.calls as unknown as [unknown, { eventType: string }][]
    ).map((c) => c[1].eventType);
    expect(eventTypes).toContain("identity.RefreshReuseDetected");
  });

  it("expired refresh throws RefreshExpiredError", async () => {
    const m = buildMocks({
      existingRefresh: buildExistingRefresh({ expiresAt: new Date(NOW.getTime() - 1) }),
    });
    const sut = buildSut(m);

    await expect(
      sut.execute({ refreshToken: "incoming", ipAddress: "192.0.2.20" }),
    ).rejects.toBeInstanceOf(RefreshExpiredError);
  });

  it("unknown token throws RefreshNotFoundError (no DB hint leak)", async () => {
    const m = buildMocks({ existingRefresh: null });
    const sut = buildSut(m);

    await expect(
      sut.execute({ refreshToken: "incoming", ipAddress: "192.0.2.20" }),
    ).rejects.toBeInstanceOf(RefreshNotFoundError);
  });

  it("user soft-deleted throws UserNotFoundError", async () => {
    const m = buildMocks({ user: null });
    const sut = buildSut(m);

    await expect(
      sut.execute({ refreshToken: "incoming", ipAddress: "192.0.2.20" }),
    ).rejects.toBeInstanceOf(UserNotFoundError);
  });
});
