/**
 * Dispatch domain event payloads. Same PII discipline as booking events
 * (ADR 0019, A4b notes): bookingId + driver/vehicle ids + scoring context
 * are OK; driver name, plate, lat/lng never appear in payload.
 *
 * Event types are namespaced under `dispatch.*` to keep aggregate
 * ownership obvious in the outbox stream.
 */

export const DISPATCH_EVENT_TYPES = {
  DRIVER_DISPATCHED: "dispatch.DriverDispatched",
  DISPATCH_FAILED: "dispatch.DispatchFailed",
  MANUAL_REASSIGNMENT: "dispatch.ManualReassignment",
  // A4f-2 offer lifecycle. DriverDispatched still fires on offer
  // CREATE (notification listener routes a push or SMS to the
  // candidate driver). The new events fire on the driver-side
  // responses + status transitions.
  DRIVER_OFFER_ACCEPTED: "dispatch.DriverOfferAccepted",
  DRIVER_OFFER_REJECTED: "dispatch.DriverOfferRejected",
  DRIVER_OFFER_EXPIRED: "dispatch.DriverOfferExpired",
  DRIVER_ON_THE_WAY: "dispatch.DriverOnTheWay",
  DRIVER_ARRIVED: "dispatch.DriverArrived",
  BOOKING_IN_PROGRESS: "dispatch.BookingInProgress",
  BOOKING_COMPLETED: "dispatch.BookingCompleted",
} as const;

export type DispatchEventType = (typeof DISPATCH_EVENT_TYPES)[keyof typeof DISPATCH_EVENT_TYPES];

export interface DriverDispatchedPayload {
  bookingId: string;
  driverProfileId: string;
  vehicleId: string;
  distanceKm: number;
  score: number;
  attempts: number;
  dispatchedAt: string; // ISO
}

export type DispatchFailureReason = "no_drivers_in_radius" | "no_eligible_drivers";

export interface DispatchFailedPayload {
  bookingId: string;
  attempts: number;
  reason: DispatchFailureReason;
  requiresManualReview: boolean;
  failedAt: string; // ISO
}

export interface ManualReassignmentPayload {
  bookingId: string;
  previousDriverProfileId: string;
  newDriverProfileId: string;
  reassignedByUserId: string;
  reassignedAt: string; // ISO
}

// =====================================================================
// A4f-2 — driver offer lifecycle event payloads. PII discipline same
// as elsewhere in dispatch: ids + timestamps + structured reason
// codes are fine; driver / customer names and addresses never appear.
// =====================================================================

export interface DriverOfferAcceptedPayload {
  offerId: string;
  bookingId: string;
  driverProfileId: string;
  vehicleId: string;
  acceptedAt: string; // ISO
}

export interface DriverOfferRejectedPayload {
  offerId: string;
  bookingId: string;
  driverProfileId: string;
  reason: "TOO_FAR" | "TIME_CONFLICT" | "VEHICLE_UNAVAILABLE" | "OTHER";
  rejectedAt: string; // ISO
}

export interface DriverOfferExpiredPayload {
  offerId: string;
  bookingId: string;
  driverProfileId: string;
  expiredAt: string; // ISO
}

export interface DriverOnTheWayPayload {
  offerId: string;
  bookingId: string;
  driverProfileId: string;
  onTheWayAt: string; // ISO
}

export interface DriverArrivedPayload {
  offerId: string;
  bookingId: string;
  driverProfileId: string;
  arrivedAt: string; // ISO
}

export interface BookingInProgressPayload {
  offerId: string;
  bookingId: string;
  driverProfileId: string;
  inProgressAt: string; // ISO
}

export interface BookingCompletedPayload {
  offerId: string;
  bookingId: string;
  driverProfileId: string;
  completedAt: string; // ISO
}
