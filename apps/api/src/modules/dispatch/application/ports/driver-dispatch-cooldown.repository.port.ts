import type { TxClient } from "../../../../common/persistence/tx-client";

export const DRIVER_DISPATCH_COOLDOWN_REPOSITORY_PORT = Symbol(
  "DRIVER_DISPATCH_COOLDOWN_REPOSITORY_PORT",
);

export interface DriverDispatchCooldownRecord {
  id: string;
  driverProfileId: string;
  bookingId: string;
  expiresAt: Date;
  createdAt: Date;
}

export interface UpsertCooldownInput {
  driverProfileId: string;
  bookingId: string;
  expiresAt: Date;
}

export interface FindActiveCooldownInput {
  driverProfileId: string;
  bookingId: string;
  now: Date;
}

/**
 * Cooldown rows the dispatch worker honours when re-matching a booking
 * after a driver's REJECTED offer. The worker (A4f-2b-2) will pass
 * candidate IDs through this port to skip drivers with an active row
 * for the booking it's re-dispatching. Within the same (driver,
 * booking) pair the row is upsert-only — re-reject slides expiresAt
 * forward without creating a duplicate.
 */
export interface DriverDispatchCooldownRepositoryPort {
  upsert(tx: TxClient, input: UpsertCooldownInput): Promise<DriverDispatchCooldownRecord>;
  findActive(
    tx: TxClient,
    input: FindActiveCooldownInput,
  ): Promise<DriverDispatchCooldownRecord | null>;
  /** Worker cleanup (called from A4f-2b-2 scheduler). Returns deleted row count. */
  deleteExpired(tx: TxClient, now: Date): Promise<number>;
}
