import { InvalidBookingTransitionError } from "./errors/booking-errors";

import type { BookingStatus } from "./booking-types";

/**
 * Custom state machine for the Booking aggregate. Hand-rolled instead of
 * XState — see ADR 0019. The transitions table is the single source of
 * truth; everything else (assertTransition, isTerminal, isCancellable)
 * derives from it.
 *
 * The four cancellation entry points (DRAFT/CONFIRMED/DRIVER_ASSIGNED →
 * CANCELLED_BY_*, IN_PROGRESS → DISPUTED) deliberately leave
 * `IN_PROGRESS → CANCELLED_*` OFF the table — once the event window has
 * started the customer must escalate via DISPUTED, not silently cancel.
 */

const ALLOWED_TRANSITIONS: Record<BookingStatus, readonly BookingStatus[]> = {
  DRAFT: ["CONFIRMED", "EXPIRED", "CANCELLED_BY_CUSTOMER"],
  CONFIRMED: ["DRIVER_ASSIGNED", "CANCELLED_BY_CUSTOMER"],
  DRIVER_ASSIGNED: ["IN_PROGRESS", "CANCELLED_BY_CUSTOMER", "CANCELLED_BY_DRIVER"],
  IN_PROGRESS: ["COMPLETED", "DISPUTED"],
  // Terminal states — no further transitions.
  COMPLETED: [],
  CANCELLED_BY_CUSTOMER: [],
  CANCELLED_BY_DRIVER: [],
  EXPIRED: [],
  DISPUTED: [],
};

const CANCELLABLE_STATES: ReadonlySet<BookingStatus> = new Set([
  "DRAFT",
  "CONFIRMED",
  "DRIVER_ASSIGNED",
]);

export const BookingStateMachine = {
  canTransition(from: BookingStatus, to: BookingStatus): boolean {
    return ALLOWED_TRANSITIONS[from].includes(to);
  },

  assertTransition(from: BookingStatus, to: BookingStatus): void {
    if (!this.canTransition(from, to)) {
      throw new InvalidBookingTransitionError(from, to);
    }
  },

  isTerminal(status: BookingStatus): boolean {
    return ALLOWED_TRANSITIONS[status].length === 0;
  },

  isCancellable(status: BookingStatus): boolean {
    return CANCELLABLE_STATES.has(status);
  },
} as const;
