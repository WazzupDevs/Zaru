import type { UserRole } from "@event-fleet/shared-types";

import type { TxClient } from "../../../../common/persistence/tx-client";

export const USER_REPOSITORY_PORT = Symbol("USER_REPOSITORY_PORT");

export interface UserRecord {
  id: string;
  phoneE164: string;
  displayName: string | null;
  role: UserRole;
  phoneVerifiedAt: Date | null;
  lastLoginAt: Date | null;
  /** A4e-3 — null when the user hasn't registered for push (no Expo
   * permission, simulator, pre-A4e-3 build). Listener treats null as
   * "fall back to SMS". */
  expoPushToken: string | null;
  pushTokenUpdatedAt: Date | null;
  createdAt: Date;
}

export interface UserRepositoryPort {
  /** Find an active (not soft-deleted) user by phone. */
  findActiveByPhone(tx: TxClient, phoneE164: string): Promise<UserRecord | null>;

  /** Find an active user by id. */
  findActiveById(tx: TxClient, id: string): Promise<UserRecord | null>;

  /** Provision a brand-new user with default role CUSTOMER and verified phone. */
  createVerified(
    tx: TxClient,
    input: { phoneE164: string; verifiedAt: Date; loggedInAt: Date },
  ): Promise<UserRecord>;

  /** Touch lastLoginAt on a returning user. */
  touchLastLogin(tx: TxClient, userId: string, loggedInAt: Date): Promise<void>;

  /**
   * Set or clear the user's Expo push token. Pass `null` to clear (e.g.,
   * the mobile app revoked permission). `pushTokenUpdatedAt` is always
   * stamped with `at` regardless of whether the token actually changed —
   * so a future cleanup worker can spot tokens that haven't been refreshed
   * recently and prune them as Expo-stale (~6 months).
   */
  updatePushToken(
    tx: TxClient,
    params: { userId: string; expoPushToken: string | null; at: Date },
  ): Promise<void>;
}
