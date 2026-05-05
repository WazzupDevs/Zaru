import type { TxClient } from "../../../../common/persistence/tx-client";
import type { BookingEntity, BookingStatus } from "../booking-types";

export const BOOKING_REPOSITORY_PORT = Symbol("BOOKING_REPOSITORY_PORT");

export interface CreateBookingInput {
  id?: string;
  customerId: string;
  priceQuoteId: string;
  status: BookingStatus;
  vehicleTypeId: string;
  categoryId: string;
  pickupLat: string | number;
  pickupLng: string | number;
  pickupAddress: string;
  dropoffLat: string | number;
  dropoffLng: string | number;
  dropoffAddress: string;
  eventStartAt: Date;
  eventEndAt: Date;
  totalAmount: string | number;
  currency: string;
  confirmedAt?: Date | null;
}

export interface TransitionBookingStatusInput {
  id: string;
  fromVersion: number;
  toStatus: BookingStatus;
  fields?: {
    cancelledAt?: Date;
    cancelledByUserId?: string;
    cancellationReason?: string;
    expiredAt?: Date;
    completedAt?: Date;
    startedAt?: Date;
    driverAssignedAt?: Date;
    driverId?: string;
    vehicleId?: string;
  };
}

export interface BookingListFilter {
  customerId?: string;
  status?: BookingStatus;
  cursor?: string;
  limit?: number;
}

export interface AssignDriverInput {
  id: string;
  fromVersion: number;
  driverId: string;
  vehicleId: string;
  assignedAt: Date;
  /** Updated dispatchAttempts value to write atomically with the transition. */
  dispatchAttempts: number;
}

export interface DispatchMetadataInput {
  id: string;
  fromVersion: number;
  dispatchAttempts: number;
  lastDispatchAt: Date;
  dispatchFailedReason: string | null;
}

export interface FindDispatchableInput {
  maxAttempts: number;
  /** Skip rows touched in the last `cooldownMs` milliseconds. */
  cooldownMs: number;
  now: Date;
  limit?: number;
}

export interface BookingRepositoryPort {
  create(tx: TxClient, input: CreateBookingInput): Promise<BookingEntity>;
  findById(tx: TxClient, id: string): Promise<BookingEntity | null>;
  /**
   * Atomic optimistic-lock transition. Returns the updated entity on
   * success, or null when the version did not match (caller should
   * surface ConcurrentBookingModificationError).
   */
  transitionStatus(
    tx: TxClient,
    input: TransitionBookingStatusInput,
  ): Promise<BookingEntity | null>;
  /**
   * Bulk DRAFT → EXPIRED for rows older than `cutoff`. Returns the
   * affected entities so the caller can emit one outbox event per row.
   */
  expireDraftsOlderThan(tx: TxClient, cutoff: Date, now: Date): Promise<BookingEntity[]>;
  /** Customer-scoped list with optional status filter and id-cursor pagination. */
  listForCustomer(tx: TxClient, filter: BookingListFilter): Promise<BookingEntity[]>;
  /**
   * Atomic CONFIRMED → DRIVER_ASSIGNED with driver/vehicle assignment.
   * `where` includes `status='CONFIRMED' AND version=fromVersion`, so
   * stale callers see null. Returns the updated entity on success.
   */
  assignDriver(tx: TxClient, input: AssignDriverInput): Promise<BookingEntity | null>;
  /**
   * Records a failed dispatch attempt without changing status. Updates
   * dispatchAttempts + lastDispatchAt + dispatchFailedReason. Caller
   * still emits the dispatch.DispatchFailed outbox event.
   */
  recordDispatchFailure(tx: TxClient, input: DispatchMetadataInput): Promise<boolean>;
  /**
   * CONFIRMED bookings the dispatch worker can attempt right now —
   * dispatchAttempts < max AND lastDispatchAt is null OR older than the
   * cooldown. Ordered by createdAt ASC (FIFO fairness).
   */
  findDispatchable(tx: TxClient, input: FindDispatchableInput): Promise<BookingEntity[]>;
  /**
   * Atomic driver swap on a DRIVER_ASSIGNED booking. Status stays
   * DRIVER_ASSIGNED — only driverId/vehicleId/driverAssignedAt change,
   * dispatchAttempts increments. Avoids the state-machine round-trip
   * (DRIVER_ASSIGNED → CONFIRMED → DRIVER_ASSIGNED) that would otherwise
   * be needed for manual reassign. Where guard enforces current status
   * + version.
   */
  reassignDriver(tx: TxClient, input: AssignDriverInput): Promise<BookingEntity | null>;
}
