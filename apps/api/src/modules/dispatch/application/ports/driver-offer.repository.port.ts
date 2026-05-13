import type { TxClient } from "../../../../common/persistence/tx-client";
import type {
  DriverOfferEntity,
  DriverOfferStatus,
  DriverRejectReason,
} from "../../domain/driver-offer-types";

export const DRIVER_OFFER_REPOSITORY_PORT = Symbol("DRIVER_OFFER_REPOSITORY_PORT");

export interface CreateDriverOfferInput {
  bookingId: string;
  driverProfileId: string;
  /** Matcher-selected vehicle, frozen on the row at offer creation. */
  vehicleId: string;
  expiresAt: Date;
  matchedDistanceKm: number;
  matchedScore: number;
}

export interface TransitionOfferStatusInput {
  offerId: string;
  fromVersion: number;
  toStatus: DriverOfferStatus;
  /** Timestamp + reason fields written atomically with the transition. */
  fields?: {
    acceptedAt?: Date;
    rejectedAt?: Date;
    expiredAt?: Date;
    onTheWayAt?: Date;
    arrivedAt?: Date;
    inProgressAt?: Date;
    completedAt?: Date;
    cancelledAt?: Date;
    rejectReason?: DriverRejectReason;
    rejectNote?: string | null;
  };
}

export interface ListOffersForDriverInput {
  driverProfileId: string;
  /** When provided, restrict to these statuses (default: all). */
  status?: readonly DriverOfferStatus[];
  limit: number;
}

export interface DriverOfferRepositoryPort {
  /**
   * Create a PENDING offer. The (booking, driver) unique constraint
   * guarantees we never duplicate-offer the same driver on a re-
   * dispatch — the worker excludes prior drivers via the candidate
   * query instead.
   */
  create(tx: TxClient, input: CreateDriverOfferInput): Promise<DriverOfferEntity>;

  findById(tx: TxClient, id: string): Promise<DriverOfferEntity | null>;

  /**
   * Atomic optimistic-lock transition. Returns the updated entity on
   * success, or null when the version did not match (caller surfaces
   * ConcurrentOfferModificationError).
   */
  transitionStatus(
    tx: TxClient,
    input: TransitionOfferStatusInput,
  ): Promise<DriverOfferEntity | null>;

  /**
   * "Does the driver have an offer they should be looking at right
   * now?" — returns the at-most-one active row (PENDING + the 4
   * post-accept statuses). The DB constraint is application-level: a
   * driver SHOULD only have one active offer; if they have two
   * (corruption), the caller treats it as an error condition.
   */
  findActiveByDriverId(tx: TxClient, driverProfileId: string): Promise<DriverOfferEntity[]>;

  /**
   * Active offer for a booking — used by the worker to decide whether
   * to re-dispatch, and by the customer booking detail endpoint to
   * enrich the response with the current offer.
   */
  findActiveByBookingId(tx: TxClient, bookingId: string): Promise<DriverOfferEntity | null>;

  /**
   * Driver IDs who have already received an offer for this booking
   * (any status) — fed to the candidate search so the worker doesn't
   * re-offer the same driver after their EXPIRED/REJECTED.
   */
  findPriorDriverIdsForBooking(tx: TxClient, bookingId: string): Promise<string[]>;

  /**
   * Worker auto-expire sweep — find PENDING offers whose 5-minute
   * window has elapsed. Caller transitions them to EXPIRED in the
   * same tx + emits one outbox event per row.
   */
  findExpiredPending(tx: TxClient, now: Date, limit: number): Promise<DriverOfferEntity[]>;

  list(tx: TxClient, input: ListOffersForDriverInput): Promise<DriverOfferEntity[]>;
}
