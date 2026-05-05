import { DomainError } from "../../../../common/errors/domain-error";

import type { BookingStatus } from "../../../booking/domain/booking-types";

export class NoAvailableDriverError extends DomainError {
  readonly code = "DISPATCH_NO_AVAILABLE_DRIVER";
  readonly httpStatus = 409;
  constructor(public readonly reason: "no_drivers_in_radius" | "no_eligible_drivers") {
    super("No driver could be assigned to this booking right now.", { reason });
  }
}

export class BookingNotDispatchableError extends DomainError {
  readonly code = "DISPATCH_BOOKING_NOT_DISPATCHABLE";
  readonly httpStatus = 409;
  constructor(public readonly currentStatus: BookingStatus) {
    super(`Booking in status ${currentStatus} cannot accept dispatch (must be CONFIRMED).`, {
      currentStatus,
    });
  }
}

export class ConcurrentDispatchError extends DomainError {
  readonly code = "DISPATCH_CONCURRENT_MODIFICATION";
  readonly httpStatus = 409;
  constructor() {
    super("Booking was modified by a concurrent dispatch attempt. Re-read and retry.");
  }
}

export class InvalidDispatchPolicyError extends DomainError {
  readonly code = "DISPATCH_INVALID_POLICY";
  readonly httpStatus = 500;
  constructor(reason: string) {
    super(`Dispatch policy is invalid: ${reason}`, { reason });
  }
}

export class DriverProfileNotFoundError extends DomainError {
  readonly code = "DISPATCH_DRIVER_PROFILE_NOT_FOUND";
  readonly httpStatus = 404;
  constructor() {
    super("Driver profile not found.");
  }
}

export class DriverLocationForbiddenError extends DomainError {
  readonly code = "DISPATCH_DRIVER_LOCATION_FORBIDDEN";
  readonly httpStatus = 403;
  constructor() {
    super("Driver can only update their own location.");
  }
}
