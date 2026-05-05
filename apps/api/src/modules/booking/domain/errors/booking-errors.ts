import { DomainError } from "../../../../common/errors/domain-error";

import type { BookingStatus } from "../booking-types";

export class BookingNotFoundError extends DomainError {
  readonly code = "BOOKING_NOT_FOUND";
  readonly httpStatus = 404;
  constructor() {
    super("Booking not found.");
  }
}

export class InvalidBookingTransitionError extends DomainError {
  readonly code = "BOOKING_INVALID_TRANSITION";
  readonly httpStatus = 409;
  constructor(
    public readonly from: BookingStatus,
    public readonly to: BookingStatus,
  ) {
    super(`Cannot transition booking from ${from} to ${to}.`, { from, to });
  }
}

export class BookingNotCancellableError extends DomainError {
  readonly code = "BOOKING_NOT_CANCELLABLE";
  readonly httpStatus = 409;
  constructor(public readonly status: BookingStatus) {
    super(`Booking in status ${status} cannot be cancelled.`, { status });
  }
}

export class BookingAccessDeniedError extends DomainError {
  readonly code = "BOOKING_ACCESS_DENIED";
  readonly httpStatus = 403;
  constructor() {
    super("Caller is not allowed to access or modify this booking.");
  }
}

export class ConcurrentBookingModificationError extends DomainError {
  readonly code = "BOOKING_CONCURRENT_MODIFICATION";
  readonly httpStatus = 409;
  constructor() {
    super("Booking was modified concurrently. Re-read and retry.");
  }
}

export class CancellationReasonRequiredError extends DomainError {
  readonly code = "BOOKING_CANCELLATION_REASON_REQUIRED";
  readonly httpStatus = 400;
  constructor() {
    super("A non-empty cancellation reason is required.");
  }
}
