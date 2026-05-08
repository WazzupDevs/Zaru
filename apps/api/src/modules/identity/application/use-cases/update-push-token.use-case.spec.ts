import { beforeEach, describe, expect, it, vi } from "vitest";

import { UpdatePushTokenUseCase } from "./update-push-token.use-case";
import { InvalidPushTokenError } from "../../domain/errors/invalid-push-token.error";
import { UserNotFoundError } from "../../domain/errors/user-not-found.error";

import type { ClockPort } from "../../../../common/clock/clock.port";
import type { TxRunnerPort } from "../../../../common/persistence/tx-runner.port";
import type { UserRecord, UserRepositoryPort } from "../ports/user.repository.port";

const VALID_TOKEN = "ExponentPushToken[abc123-DEF_456]";
const NOW = new Date("2026-05-08T10:00:00.000Z");
const USER_ID = "11111111-1111-1111-1111-111111111111";

function makeUser(overrides: Partial<UserRecord> = {}): UserRecord {
  return {
    id: USER_ID,
    phoneE164: "+905551112233",
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

describe("UpdatePushTokenUseCase", () => {
  let userRepo: UserRepositoryPort;
  let tx: TxRunnerPort;
  let clock: ClockPort;
  let useCase: UpdatePushTokenUseCase;

  beforeEach(() => {
    userRepo = {
      findActiveByPhone: vi.fn(),
      findActiveById: vi.fn(() => Promise.resolve(makeUser())),
      createVerified: vi.fn(),
      touchLastLogin: vi.fn(),
      updatePushToken: vi.fn(() => Promise.resolve()),
    };
    tx = {
      run: vi.fn(<T>(fn: (txClient: unknown) => Promise<T>) => fn({})) as TxRunnerPort["run"],
    };
    clock = { now: () => NOW, nowMs: () => NOW.getTime() };
    useCase = new UpdatePushTokenUseCase(userRepo, tx, clock);
  });

  it("happy path — sets a valid token + stamps pushTokenUpdatedAt with clock.now()", async () => {
    await useCase.execute({ userId: USER_ID, expoPushToken: VALID_TOKEN });

    expect(userRepo.updatePushToken).toHaveBeenCalledTimes(1);
    expect(userRepo.updatePushToken).toHaveBeenCalledWith(expect.anything(), {
      userId: USER_ID,
      expoPushToken: VALID_TOKEN,
      at: NOW,
    });
  });

  it("clear path — accepts null and persists null with the same timestamp", async () => {
    await useCase.execute({ userId: USER_ID, expoPushToken: null });

    expect(userRepo.updatePushToken).toHaveBeenCalledWith(expect.anything(), {
      userId: USER_ID,
      expoPushToken: null,
      at: NOW,
    });
  });

  it("re-register the same token — write still happens (refreshes pushTokenUpdatedAt for the cleanup worker)", async () => {
    // Caller doesn't tell us whether this is a re-register; the worker uses
    // pushTokenUpdatedAt to spot stale tokens, so we always write.
    await useCase.execute({ userId: USER_ID, expoPushToken: VALID_TOKEN });
    await useCase.execute({ userId: USER_ID, expoPushToken: VALID_TOKEN });

    expect(userRepo.updatePushToken).toHaveBeenCalledTimes(2);
  });

  it("invalid format (random string) — throws InvalidPushTokenError + does NOT touch the repo", async () => {
    await expect(
      useCase.execute({ userId: USER_ID, expoPushToken: "not-a-valid-token" }),
    ).rejects.toBeInstanceOf(InvalidPushTokenError);

    expect(userRepo.updatePushToken).not.toHaveBeenCalled();
    expect(tx.run).not.toHaveBeenCalled();
  });

  it("invalid format (FCM token shape) — throws InvalidPushTokenError", async () => {
    // Common mistake: passing an FCM device token instead of an Expo token.
    await expect(
      useCase.execute({
        userId: USER_ID,
        expoPushToken: "fcmtoken:ABC123:DEF456",
      }),
    ).rejects.toBeInstanceOf(InvalidPushTokenError);
  });

  it("empty string — throws InvalidPushTokenError (use null to clear, not empty)", async () => {
    await expect(useCase.execute({ userId: USER_ID, expoPushToken: "" })).rejects.toBeInstanceOf(
      InvalidPushTokenError,
    );
  });

  it("user not found (or soft-deleted) — throws UserNotFoundError", async () => {
    vi.mocked(userRepo.findActiveById).mockResolvedValueOnce(null);

    await expect(
      useCase.execute({ userId: USER_ID, expoPushToken: VALID_TOKEN }),
    ).rejects.toBeInstanceOf(UserNotFoundError);

    expect(userRepo.updatePushToken).not.toHaveBeenCalled();
  });

  it("runs inside the tx runner (read + write are atomic)", async () => {
    await useCase.execute({ userId: USER_ID, expoPushToken: VALID_TOKEN });

    expect(tx.run).toHaveBeenCalledTimes(1);
    // findActiveById + updatePushToken both called inside the same tx call.
    expect(userRepo.findActiveById).toHaveBeenCalledTimes(1);
    expect(userRepo.updatePushToken).toHaveBeenCalledTimes(1);
  });
});
