import type { TxClient } from "../../../../common/persistence/tx-client";

export const OTP_REQUEST_REPOSITORY_PORT = Symbol("OTP_REQUEST_REPOSITORY_PORT");

export interface CreateOtpRequestInput {
  phoneE164: string;
  codeHash: string;
  channel: "SMS";
  purpose: "LOGIN";
  expiresAt: Date;
  ipAddress?: string;
  userAgent?: string;
}

export interface OtpRequestRecord {
  id: string;
  phoneE164: string;
  channel: "SMS";
  purpose: "LOGIN";
  expiresAt: Date;
  createdAt: Date;
}

export interface OtpRequestFullRecord extends OtpRequestRecord {
  codeHash: string;
  consumedAt: Date | null;
  attemptCount: number;
}

export interface OtpRequestRepositoryPort {
  /**
   * Create the OtpRequest row AND the OtpRequested outbox event in a single
   * transaction. Atomicity is the contract — implementations MUST NOT split
   * these into two separate transactions.
   */
  createWithOutbox(input: CreateOtpRequestInput): Promise<OtpRequestRecord>;

  /**
   * Look up an OTP row by (id, phone). Returns null if no row matches —
   * the use case decides whether that's "not found" vs "consumed" vs
   * "expired" based on the returned fields.
   */
  findByIdAndPhone(
    tx: TxClient,
    id: string,
    phoneE164: string,
  ): Promise<OtpRequestFullRecord | null>;

  /** Increment attemptCount and return the new value. */
  incrementAttempt(tx: TxClient, id: string): Promise<number>;

  /** Mark consumed (single-use sentinel). */
  consume(tx: TxClient, id: string, consumedAt: Date): Promise<void>;
}
