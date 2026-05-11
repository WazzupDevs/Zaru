import type { TxClient } from "../../../../common/persistence/tx-client";

export const DRIVER_INVITE_REPOSITORY_PORT = Symbol("DRIVER_INVITE_REPOSITORY_PORT");

export type DriverInviteStatus = "PENDING" | "ACCEPTED" | "REVOKED";

export interface DriverInviteRecord {
  id: string;
  phoneE164: string;
  phoneE164Hash: string;
  status: DriverInviteStatus;
  invitedAt: Date;
  acceptedAt: Date | null;
  acceptedUserId: string | null;
  invitedByAdminId: string;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateDriverInviteInput {
  phoneE164: string;
  phoneE164Hash: string;
  invitedByAdminId: string;
  notes: string | null;
}

export interface ListDriverInvitesQuery {
  status?: DriverInviteStatus;
  limit?: number;
  cursor?: string;
}

export interface DriverInviteRepositoryPort {
  /** Whitelist hot path — looks up by hash; status filter applied at use case layer. */
  findActiveByPhoneHash(tx: TxClient, phoneE164Hash: string): Promise<DriverInviteRecord | null>;
  findById(tx: TxClient, id: string): Promise<DriverInviteRecord | null>;
  create(tx: TxClient, input: CreateDriverInviteInput): Promise<DriverInviteRecord>;
  /** PENDING → ACCEPTED. Atomic — returns null if the row already moved (race). */
  markAccepted(
    tx: TxClient,
    input: { id: string; acceptedUserId: string; acceptedAt: Date },
  ): Promise<DriverInviteRecord | null>;
  /** PENDING → REVOKED + soft delete. Use case rejects ACCEPTED upstream. */
  markRevoked(tx: TxClient, id: string, at: Date): Promise<DriverInviteRecord | null>;
  list(tx: TxClient, query: ListDriverInvitesQuery): Promise<DriverInviteRecord[]>;
}
