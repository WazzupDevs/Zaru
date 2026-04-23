import type { UserRole } from "@event-fleet/shared-types";

import type { PrismaClient } from "@prisma/client";

export const USER_REPOSITORY_PORT = Symbol("USER_REPOSITORY_PORT");

export interface UserRecord {
  id: string;
  phoneE164: string;
  displayName: string | null;
  role: UserRole;
  phoneVerifiedAt: Date | null;
  lastLoginAt: Date | null;
  createdAt: Date;
}

export type TxClient = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

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
}
