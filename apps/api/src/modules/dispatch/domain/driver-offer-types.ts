import type {
  DriverOfferStatus as PrismaDriverOfferStatus,
  DriverRejectReason as PrismaDriverRejectReason,
} from "@prisma/client";
import type { Decimal } from "@prisma/client/runtime/library";

export type DriverOfferStatus = PrismaDriverOfferStatus;
export type DriverRejectReason = PrismaDriverRejectReason;

/**
 * DriverOffer is a 1:N child of Booking. The booking stays CONFIRMED
 * while an offer is PENDING; only on ACCEPTED does the booking
 * transition to DRIVER_ASSIGNED. That timing decision keeps ADR 0019's
 * 9-state booking machine unchanged — the driver-side lifecycle lives
 * on the offer aggregate instead.
 *
 * The five "active" statuses (ACCEPTED → ON_THE_WAY → ARRIVED →
 * IN_PROGRESS → COMPLETED) map onto the actual driving phases. The
 * timestamps mirror the status transitions one-for-one so we can audit
 * "when did the driver tap arrived" without joining against an event
 * log.
 */
export interface DriverOfferEntity {
  id: string;
  bookingId: string;
  driverProfileId: string;
  status: DriverOfferStatus;

  expiresAt: Date;

  acceptedAt: Date | null;
  rejectedAt: Date | null;
  expiredAt: Date | null;
  onTheWayAt: Date | null;
  arrivedAt: Date | null;
  inProgressAt: Date | null;
  completedAt: Date | null;
  cancelledAt: Date | null;

  rejectReason: DriverRejectReason | null;
  rejectNote: string | null;

  matchedDistanceKm: Decimal | null;
  matchedScore: Decimal | null;

  version: number;
  createdAt: Date;
  updatedAt: Date;
}

/** Statuses the worker should treat as "this offer still owns the booking". */
export const ACTIVE_OFFER_STATUSES: readonly DriverOfferStatus[] = [
  "PENDING",
  "ACCEPTED",
  "ON_THE_WAY",
  "ARRIVED",
  "IN_PROGRESS",
];

/** Statuses the driver mobile shows in the active job slot. */
export const POST_ACCEPT_STATUSES: readonly DriverOfferStatus[] = [
  "ACCEPTED",
  "ON_THE_WAY",
  "ARRIVED",
  "IN_PROGRESS",
];

/** Statuses that appear in the driver's history tab (terminal + completed). */
export const HISTORY_STATUSES: readonly DriverOfferStatus[] = [
  "COMPLETED",
  "REJECTED",
  "EXPIRED",
  "CANCELLED",
];
