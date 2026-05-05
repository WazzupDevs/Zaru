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
}
