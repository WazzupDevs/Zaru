import { OfferStateTransitionError } from "./errors/dispatch-errors";

import type { DriverOfferStatus } from "./driver-offer-types";

/**
 * Hand-rolled FSM for the DriverOffer aggregate, mirroring the
 * booking pattern in ADR 0019. The transitions table is the single
 * source of truth; helpers derive from it.
 *
 * Acceptance flow (happy path):
 *   PENDING → ACCEPTED → ON_THE_WAY → ARRIVED → IN_PROGRESS → COMPLETED
 *
 * Failure / cancellation:
 *   PENDING → REJECTED (driver tapped Reddet)
 *   PENDING → EXPIRED  (5-min window elapsed; worker auto-expires)
 *   PENDING → CANCELLED (customer cancelled the booking)
 *   ACCEPTED/ON_THE_WAY/ARRIVED/IN_PROGRESS → CANCELLED
 *     (customer cancel cascade — driver should stop driving)
 *
 * The driver-side cannot reject after accepting. If a driver needs to
 * back out post-accept, that's a customer-impacting incident; admin
 * cancels the booking and we'd revisit a "driver no-show" flow as a
 * future feature.
 */

const ALLOWED_TRANSITIONS: Record<DriverOfferStatus, readonly DriverOfferStatus[]> = {
  PENDING: ["ACCEPTED", "REJECTED", "EXPIRED", "CANCELLED"],
  ACCEPTED: ["ON_THE_WAY", "CANCELLED"],
  ON_THE_WAY: ["ARRIVED", "CANCELLED"],
  ARRIVED: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED", "CANCELLED"],
  // Terminal states.
  COMPLETED: [],
  REJECTED: [],
  EXPIRED: [],
  CANCELLED: [],
};

/** Status updates the driver app is allowed to drive itself. */
const DRIVER_DRIVEN_TRANSITIONS: ReadonlySet<DriverOfferStatus> = new Set([
  "ON_THE_WAY",
  "ARRIVED",
  "IN_PROGRESS",
  "COMPLETED",
]);

export const DriverOfferStateMachine = {
  canTransition(from: DriverOfferStatus, to: DriverOfferStatus): boolean {
    return ALLOWED_TRANSITIONS[from].includes(to);
  },

  assertTransition(from: DriverOfferStatus, to: DriverOfferStatus): void {
    if (!this.canTransition(from, to)) {
      throw new OfferStateTransitionError(from, to);
    }
  },

  isTerminal(status: DriverOfferStatus): boolean {
    return ALLOWED_TRANSITIONS[status].length === 0;
  },

  isDriverDriven(target: DriverOfferStatus): boolean {
    return DRIVER_DRIVEN_TRANSITIONS.has(target);
  },
} as const;
