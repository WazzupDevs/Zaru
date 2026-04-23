import type { DriverOnboardingStatus } from "@event-fleet/shared-types";

import type { TxClient } from "../../../../common/persistence/tx-client";

export const DRIVER_PROFILE_REPOSITORY_PORT = Symbol("DRIVER_PROFILE_REPOSITORY_PORT");

export interface DriverProfileRecord {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  nationalIdHash: string;
  birthDate: Date;
  ibanHash: string;
  ibanLast4: string;
  status: DriverOnboardingStatus;
  rejectionReason: string | null;
  approvedAt: Date | null;
  approvedByUserId: string | null;
  commissionRate: string;
  version: number;
  createdAt: Date;
}

export interface CreateDriverProfileRow {
  userId: string;
  firstName: string;
  lastName: string;
  nationalIdHash: string;
  birthDate: Date;
  ibanHash: string;
  ibanLast4: string;
}

export interface DriverProfileRepositoryPort {
  create(tx: TxClient, input: CreateDriverProfileRow): Promise<DriverProfileRecord>;
  findActiveByUserId(tx: TxClient, userId: string): Promise<DriverProfileRecord | null>;
  findActiveById(tx: TxClient, id: string): Promise<DriverProfileRecord | null>;
  /**
   * Used for "this TCKN is already on file" duplicate detection. The HMAC
   * is deterministic, so equality on the hash is equivalent to equality on
   * the plaintext (ADR 0016).
   */
  findByNationalIdHash(tx: TxClient, hash: string): Promise<DriverProfileRecord | null>;
  updateBasics(
    tx: TxClient,
    id: string,
    input: { firstName?: string; lastName?: string },
  ): Promise<void>;
  setStatus(
    tx: TxClient,
    id: string,
    next: {
      status: DriverOnboardingStatus;
      rejectionReason?: string | null;
      approvedAt?: Date | null;
      approvedByUserId?: string | null;
    },
  ): Promise<void>;
  /** Pending = DOCUMENTS_PENDING, paginated by createdAt DESC. Admin queue. */
  listPending(
    tx: TxClient,
    args: { limit: number; cursor?: string | undefined },
  ): Promise<{ items: DriverProfileRecord[]; nextCursor: string | null }>;
}
