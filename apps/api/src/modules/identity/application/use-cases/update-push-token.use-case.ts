import { Inject, Injectable } from "@nestjs/common";

import { CLOCK_PORT, type ClockPort } from "../../../../common/clock/clock.port";
import { TX_RUNNER_PORT, type TxRunnerPort } from "../../../../common/persistence/tx-runner.port";
import { InvalidPushTokenError } from "../../domain/errors/invalid-push-token.error";
import { UserNotFoundError } from "../../domain/errors/user-not-found.error";
import { USER_REPOSITORY_PORT, type UserRepositoryPort } from "../ports/user.repository.port";

export interface UpdatePushTokenInput {
  userId: string;
  /** Pass `null` to clear the token (e.g., user revoked permission). */
  expoPushToken: string | null;
}

/**
 * Expo push tokens have a fixed shape: `ExponentPushToken[<opaque>]`
 * where the opaque part is base64url-ish. We do a structural check here
 * before persisting so a typo / tampered request can't end up in the
 * notifications table — the push sender would error on it later anyway,
 * but the failure mode is much less obvious from the worker.
 */
const EXPO_PUSH_TOKEN_PATTERN = /^ExponentPushToken\[[A-Za-z0-9_-]+\]$/;

/**
 * UpdatePushToken — set or clear the user's Expo push token.
 *
 * Idempotent: re-registering the same token still touches
 * pushTokenUpdatedAt so the cleanup worker can spot tokens that haven't
 * been refreshed in months and prune them as Expo-stale. The token
 * value itself only writes if it actually changed (Prisma update is a
 * single statement either way; the equality check is just clarity).
 *
 * Soft-deleted users get UserNotFoundError — `findActiveById` already
 * filters by deletedAt IS NULL.
 */
@Injectable()
export class UpdatePushTokenUseCase {
  constructor(
    @Inject(USER_REPOSITORY_PORT)
    private readonly userRepo: UserRepositoryPort,
    @Inject(TX_RUNNER_PORT)
    private readonly tx: TxRunnerPort,
    @Inject(CLOCK_PORT)
    private readonly clock: ClockPort,
  ) {}

  async execute(input: UpdatePushTokenInput): Promise<void> {
    if (input.expoPushToken !== null && !EXPO_PUSH_TOKEN_PATTERN.test(input.expoPushToken)) {
      throw new InvalidPushTokenError();
    }

    const at = this.clock.now();

    await this.tx.run(async (tx) => {
      const user = await this.userRepo.findActiveById(tx, input.userId);
      if (!user) throw new UserNotFoundError();

      await this.userRepo.updatePushToken(tx, {
        userId: input.userId,
        expoPushToken: input.expoPushToken,
        at,
      });
    });
  }
}
