import { ConfigService } from "@nestjs/config";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AcceptDriverInviteUseCase } from "./accept-driver-invite.use-case";
import { CheckDriverWhitelistUseCase } from "./check-driver-whitelist.use-case";
import { CreateDriverInviteUseCase } from "./create-driver-invite.use-case";
import { RevokeDriverInviteUseCase } from "./revoke-driver-invite.use-case";
import { ForbiddenError } from "../../../../common/errors/domain-error";
import { PiiHasher } from "../../../../common/security/pii-hasher";
import { DriverInviteAlreadyAcceptedError } from "../../domain/errors/driver-invite-already-accepted.error";
import { DriverInviteNotFoundError } from "../../domain/errors/driver-invite-not-found.error";
import { DriverNotInvitedError } from "../../domain/errors/driver-not-invited.error";
import { InvalidPhoneError } from "../../domain/errors/invalid-phone.error";
import { UserNotFoundError } from "../../domain/errors/user-not-found.error";

import type { ClockPort } from "../../../../common/clock/clock.port";
import type { OutboxWriterPort } from "../../../../common/persistence/outbox-writer.port";
import type { TxRunnerPort } from "../../../../common/persistence/tx-runner.port";
import type {
  DriverInviteRecord,
  DriverInviteRepositoryPort,
} from "../ports/driver-invite.repository.port";
import type { UserRecord, UserRepositoryPort } from "../ports/user.repository.port";

const NOW = new Date("2026-05-08T10:00:00.000Z");
const ADMIN_ID = "11111111-1111-1111-1111-111111111111";
const DRIVER_USER_ID = "22222222-2222-2222-2222-222222222222";
const PHONE = "+905551112233";
// 64-char hex secret for the test PiiHasher.
const TEST_HMAC_SECRET = "a".repeat(64);

function makeHasher(): PiiHasher {
  const config = {
    get: (key: string) => (key === "PII_HMAC_SECRET" ? TEST_HMAC_SECRET : undefined),
  } as unknown as ConfigService<never, true>;
  return new PiiHasher(config);
}

function makeInvite(overrides: Partial<DriverInviteRecord> = {}): DriverInviteRecord {
  const hasher = makeHasher();
  return {
    id: "33333333-3333-3333-3333-333333333333",
    phoneE164: PHONE,
    phoneE164Hash: hasher.hashPhone(PHONE),
    status: "PENDING",
    invitedAt: NOW,
    acceptedAt: null,
    acceptedUserId: null,
    invitedByAdminId: ADMIN_ID,
    notes: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function makeUser(overrides: Partial<UserRecord> = {}): UserRecord {
  return {
    id: DRIVER_USER_ID,
    phoneE164: PHONE,
    displayName: null,
    role: "CUSTOMER",
    phoneVerifiedAt: NOW,
    lastLoginAt: NOW,
    expoPushToken: null,
    pushTokenUpdatedAt: null,
    createdAt: NOW,
    ...overrides,
  };
}

function makeMocks() {
  const inviteRepo: DriverInviteRepositoryPort = {
    findActiveByPhoneHash: vi.fn(),
    findById: vi.fn(),
    create: vi.fn((_tx, input) => Promise.resolve(makeInvite({ ...input, status: "PENDING" }))),
    markAccepted: vi.fn((_tx, input) =>
      Promise.resolve(
        makeInvite({
          id: input.id,
          status: "ACCEPTED",
          acceptedAt: input.acceptedAt,
          acceptedUserId: input.acceptedUserId,
        }),
      ),
    ),
    markRevoked: vi.fn(),
    list: vi.fn(),
  };
  const userRepo: UserRepositoryPort = {
    findActiveByPhone: vi.fn(),
    findActiveById: vi.fn(() => Promise.resolve(makeUser())),
    createVerified: vi.fn(),
    touchLastLogin: vi.fn(),
    updatePushToken: vi.fn(),
    updateRole: vi.fn(() => Promise.resolve()),
  };
  const tx: TxRunnerPort = {
    run: vi.fn(<T>(fn: (txClient: unknown) => Promise<T>) => fn({})) as TxRunnerPort["run"],
  };
  const outbox: OutboxWriterPort = { write: vi.fn(() => Promise.resolve()) };
  const clock: ClockPort = { now: () => NOW, nowMs: () => NOW.getTime() };
  return { inviteRepo, userRepo, tx, outbox, clock, hasher: makeHasher() };
}

describe("CreateDriverInviteUseCase", () => {
  it("admin creates new invite for un-whitelisted phone", async () => {
    const m = makeMocks();
    vi.mocked(m.inviteRepo.findActiveByPhoneHash).mockResolvedValueOnce(null);
    const useCase = new CreateDriverInviteUseCase(m.inviteRepo, m.tx, m.hasher);

    const result = await useCase.execute(
      { phone: PHONE, notes: "trial driver" },
      { userId: ADMIN_ID, role: "ADMIN" },
    );

    expect(result.status).toBe("PENDING");
    expect(m.inviteRepo.create).toHaveBeenCalledTimes(1);
    expect(m.inviteRepo.create).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        phoneE164: PHONE,
        invitedByAdminId: ADMIN_ID,
        notes: "trial driver",
      }),
    );
  });

  it("re-inviting a phone with an existing PENDING invite is idempotent", async () => {
    const m = makeMocks();
    const existing = makeInvite();
    vi.mocked(m.inviteRepo.findActiveByPhoneHash).mockResolvedValueOnce(existing);
    const useCase = new CreateDriverInviteUseCase(m.inviteRepo, m.tx, m.hasher);

    const result = await useCase.execute({ phone: PHONE }, { userId: ADMIN_ID, role: "ADMIN" });

    expect(result).toBe(existing);
    expect(m.inviteRepo.create).not.toHaveBeenCalled();
  });

  it("re-inviting a REVOKED phone creates a new invite", async () => {
    const m = makeMocks();
    vi.mocked(m.inviteRepo.findActiveByPhoneHash).mockResolvedValueOnce(
      makeInvite({ status: "REVOKED" }),
    );
    const useCase = new CreateDriverInviteUseCase(m.inviteRepo, m.tx, m.hasher);

    await useCase.execute({ phone: PHONE }, { userId: ADMIN_ID, role: "ADMIN" });

    expect(m.inviteRepo.create).toHaveBeenCalledTimes(1);
  });

  it("non-admin throws ForbiddenError before touching the repo", async () => {
    const m = makeMocks();
    const useCase = new CreateDriverInviteUseCase(m.inviteRepo, m.tx, m.hasher);

    await expect(
      useCase.execute({ phone: PHONE }, { userId: DRIVER_USER_ID, role: "CUSTOMER" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(m.tx.run).not.toHaveBeenCalled();
  });

  it("malformed phone throws InvalidPhoneError", async () => {
    const m = makeMocks();
    const useCase = new CreateDriverInviteUseCase(m.inviteRepo, m.tx, m.hasher);

    await expect(
      useCase.execute({ phone: "0555 not formatted" }, { userId: ADMIN_ID, role: "ADMIN" }),
    ).rejects.toBeInstanceOf(InvalidPhoneError);
  });
});

describe("CheckDriverWhitelistUseCase", () => {
  it("PENDING invite → isWhitelisted true with inviteId", async () => {
    const m = makeMocks();
    vi.mocked(m.inviteRepo.findActiveByPhoneHash).mockResolvedValueOnce(makeInvite());
    const useCase = new CheckDriverWhitelistUseCase(m.inviteRepo, m.tx, m.hasher);

    const result = await useCase.execute({ phone: PHONE });

    expect(result.isWhitelisted).toBe(true);
    expect(result.inviteId).toBeDefined();
  });

  it("ACCEPTED invite → isWhitelisted true (returning login allowed)", async () => {
    const m = makeMocks();
    vi.mocked(m.inviteRepo.findActiveByPhoneHash).mockResolvedValueOnce(
      makeInvite({ status: "ACCEPTED", acceptedUserId: DRIVER_USER_ID, acceptedAt: NOW }),
    );
    const useCase = new CheckDriverWhitelistUseCase(m.inviteRepo, m.tx, m.hasher);

    const result = await useCase.execute({ phone: PHONE });
    expect(result.isWhitelisted).toBe(true);
  });

  it("REVOKED invite → isWhitelisted false", async () => {
    const m = makeMocks();
    vi.mocked(m.inviteRepo.findActiveByPhoneHash).mockResolvedValueOnce(
      makeInvite({ status: "REVOKED" }),
    );
    const useCase = new CheckDriverWhitelistUseCase(m.inviteRepo, m.tx, m.hasher);

    const result = await useCase.execute({ phone: PHONE });
    expect(result.isWhitelisted).toBe(false);
  });

  it("no invite → isWhitelisted false", async () => {
    const m = makeMocks();
    vi.mocked(m.inviteRepo.findActiveByPhoneHash).mockResolvedValueOnce(null);
    const useCase = new CheckDriverWhitelistUseCase(m.inviteRepo, m.tx, m.hasher);

    const result = await useCase.execute({ phone: PHONE });
    expect(result.isWhitelisted).toBe(false);
    expect(result.inviteId).toBeNull();
  });
});

describe("AcceptDriverInviteUseCase", () => {
  it("PENDING invite + valid user → ACCEPTED + role DRIVER + outbox event", async () => {
    const m = makeMocks();
    vi.mocked(m.inviteRepo.findActiveByPhoneHash).mockResolvedValueOnce(makeInvite());
    const useCase = new AcceptDriverInviteUseCase(
      m.inviteRepo,
      m.userRepo,
      m.tx,
      m.outbox,
      m.clock,
      m.hasher,
    );

    await useCase.execute({ phone: PHONE, userId: DRIVER_USER_ID });

    expect(m.inviteRepo.markAccepted).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ acceptedUserId: DRIVER_USER_ID, acceptedAt: NOW }),
    );
    expect(m.userRepo.updateRole).toHaveBeenCalledWith(expect.anything(), DRIVER_USER_ID, "DRIVER");
    expect(m.outbox.write).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ eventType: "identity.DriverInviteAccepted" }),
    );
  });

  it("no invite → DriverNotInvitedError, no role update", async () => {
    const m = makeMocks();
    vi.mocked(m.inviteRepo.findActiveByPhoneHash).mockResolvedValueOnce(null);
    const useCase = new AcceptDriverInviteUseCase(
      m.inviteRepo,
      m.userRepo,
      m.tx,
      m.outbox,
      m.clock,
      m.hasher,
    );

    await expect(useCase.execute({ phone: PHONE, userId: DRIVER_USER_ID })).rejects.toBeInstanceOf(
      DriverNotInvitedError,
    );
    expect(m.userRepo.updateRole).not.toHaveBeenCalled();
  });

  it("re-accepting an ACCEPTED invite for the same user is a no-op (idempotent)", async () => {
    const m = makeMocks();
    vi.mocked(m.inviteRepo.findActiveByPhoneHash).mockResolvedValueOnce(
      makeInvite({ status: "ACCEPTED", acceptedUserId: DRIVER_USER_ID, acceptedAt: NOW }),
    );
    const useCase = new AcceptDriverInviteUseCase(
      m.inviteRepo,
      m.userRepo,
      m.tx,
      m.outbox,
      m.clock,
      m.hasher,
    );

    await useCase.execute({ phone: PHONE, userId: DRIVER_USER_ID });

    expect(m.inviteRepo.markAccepted).not.toHaveBeenCalled();
    expect(m.userRepo.updateRole).not.toHaveBeenCalled();
  });

  it("ACCEPTED invite owned by a different user → DriverNotInvitedError", async () => {
    const m = makeMocks();
    vi.mocked(m.inviteRepo.findActiveByPhoneHash).mockResolvedValueOnce(
      makeInvite({ status: "ACCEPTED", acceptedUserId: "other-user-id", acceptedAt: NOW }),
    );
    const useCase = new AcceptDriverInviteUseCase(
      m.inviteRepo,
      m.userRepo,
      m.tx,
      m.outbox,
      m.clock,
      m.hasher,
    );

    await expect(useCase.execute({ phone: PHONE, userId: DRIVER_USER_ID })).rejects.toBeInstanceOf(
      DriverNotInvitedError,
    );
  });

  it("REVOKED invite → DriverNotInvitedError", async () => {
    const m = makeMocks();
    vi.mocked(m.inviteRepo.findActiveByPhoneHash).mockResolvedValueOnce(
      makeInvite({ status: "REVOKED" }),
    );
    const useCase = new AcceptDriverInviteUseCase(
      m.inviteRepo,
      m.userRepo,
      m.tx,
      m.outbox,
      m.clock,
      m.hasher,
    );

    await expect(useCase.execute({ phone: PHONE, userId: DRIVER_USER_ID })).rejects.toBeInstanceOf(
      DriverNotInvitedError,
    );
  });

  it("user not found → UserNotFoundError, invite stays PENDING", async () => {
    const m = makeMocks();
    vi.mocked(m.inviteRepo.findActiveByPhoneHash).mockResolvedValueOnce(makeInvite());
    vi.mocked(m.userRepo.findActiveById).mockResolvedValueOnce(null);
    const useCase = new AcceptDriverInviteUseCase(
      m.inviteRepo,
      m.userRepo,
      m.tx,
      m.outbox,
      m.clock,
      m.hasher,
    );

    await expect(useCase.execute({ phone: PHONE, userId: DRIVER_USER_ID })).rejects.toBeInstanceOf(
      UserNotFoundError,
    );
    expect(m.inviteRepo.markAccepted).not.toHaveBeenCalled();
  });

  it("concurrent acceptance race (markAccepted returns null) → DriverNotInvitedError", async () => {
    const m = makeMocks();
    vi.mocked(m.inviteRepo.findActiveByPhoneHash).mockResolvedValueOnce(makeInvite());
    vi.mocked(m.inviteRepo.markAccepted).mockResolvedValueOnce(null);
    const useCase = new AcceptDriverInviteUseCase(
      m.inviteRepo,
      m.userRepo,
      m.tx,
      m.outbox,
      m.clock,
      m.hasher,
    );

    await expect(useCase.execute({ phone: PHONE, userId: DRIVER_USER_ID })).rejects.toBeInstanceOf(
      DriverNotInvitedError,
    );
    expect(m.userRepo.updateRole).not.toHaveBeenCalled();
  });
});

describe("RevokeDriverInviteUseCase", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("admin revokes PENDING invite", async () => {
    const m = makeMocks();
    vi.mocked(m.inviteRepo.findById).mockResolvedValueOnce(makeInvite());
    const useCase = new RevokeDriverInviteUseCase(m.inviteRepo, m.tx, m.clock);

    await useCase.execute({ inviteId: "id-1" }, { role: "ADMIN" });

    expect(m.inviteRepo.markRevoked).toHaveBeenCalledTimes(1);
  });

  it("non-admin → ForbiddenError", async () => {
    const m = makeMocks();
    const useCase = new RevokeDriverInviteUseCase(m.inviteRepo, m.tx, m.clock);

    await expect(
      useCase.execute({ inviteId: "id-1" }, { role: "CUSTOMER" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(m.tx.run).not.toHaveBeenCalled();
  });

  it("not found → DriverInviteNotFoundError", async () => {
    const m = makeMocks();
    vi.mocked(m.inviteRepo.findById).mockResolvedValueOnce(null);
    const useCase = new RevokeDriverInviteUseCase(m.inviteRepo, m.tx, m.clock);

    await expect(useCase.execute({ inviteId: "ghost" }, { role: "ADMIN" })).rejects.toBeInstanceOf(
      DriverInviteNotFoundError,
    );
  });

  it("ACCEPTED invite → DriverInviteAlreadyAcceptedError", async () => {
    const m = makeMocks();
    vi.mocked(m.inviteRepo.findById).mockResolvedValueOnce(
      makeInvite({ status: "ACCEPTED", acceptedUserId: DRIVER_USER_ID, acceptedAt: NOW }),
    );
    const useCase = new RevokeDriverInviteUseCase(m.inviteRepo, m.tx, m.clock);

    await expect(useCase.execute({ inviteId: "id-1" }, { role: "ADMIN" })).rejects.toBeInstanceOf(
      DriverInviteAlreadyAcceptedError,
    );
    expect(m.inviteRepo.markRevoked).not.toHaveBeenCalled();
  });

  it("already-REVOKED invite → no-op (idempotent)", async () => {
    const m = makeMocks();
    vi.mocked(m.inviteRepo.findById).mockResolvedValueOnce(makeInvite({ status: "REVOKED" }));
    const useCase = new RevokeDriverInviteUseCase(m.inviteRepo, m.tx, m.clock);

    await useCase.execute({ inviteId: "id-1" }, { role: "ADMIN" });

    expect(m.inviteRepo.markRevoked).not.toHaveBeenCalled();
  });
});
