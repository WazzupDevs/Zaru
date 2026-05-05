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
