import type { AvailabilityType } from "@event-fleet/shared-types";

import { DomainError } from "../../../../common/errors/domain-error";

export class InvalidAvailabilityRangeError extends DomainError {
  readonly code = "SUPPLY_INVALID_AVAILABILITY_RANGE";
  readonly httpStatus = 400;
  constructor() {
    super("endAt must be strictly after startAt.");
  }
}

export class PastDateError extends DomainError {
  readonly code = "SUPPLY_PAST_DATE";
  readonly httpStatus = 400;
  constructor() {
    super("Cannot block a calendar slot in the past.");
  }
}

export class VehicleNotActiveError extends DomainError {
  readonly code = "SUPPLY_VEHICLE_NOT_ACTIVE";
  readonly httpStatus = 409;
  constructor() {
    super("Vehicle must be ACTIVE to manage availability.");
  }
}

export interface AvailabilityConflict {
  id: string;
  startAt: Date;
  endAt: Date;
  type: AvailabilityType;
}

export class AvailabilityConflictError extends DomainError {
  readonly code = "SUPPLY_AVAILABILITY_CONFLICT";
  readonly httpStatus = 409;
  constructor(conflicts: AvailabilityConflict[]) {
    super(
      `The requested time range overlaps ${String(conflicts.length)} existing entr${conflicts.length === 1 ? "y" : "ies"}.`,
      {
        conflicts: conflicts.map((c) => ({
          id: c.id,
          startAt: c.startAt.toISOString(),
          endAt: c.endAt.toISOString(),
          type: c.type,
        })),
      },
    );
  }
}

export class AvailabilityNotFoundError extends DomainError {
  readonly code = "SUPPLY_AVAILABILITY_NOT_FOUND";
  readonly httpStatus = 404;
  constructor() {
    super("Availability entry not found.");
  }
}

export class CannotRemoveBookedAvailabilityError extends DomainError {
  readonly code = "SUPPLY_CANNOT_REMOVE_BOOKED_AVAILABILITY";
  readonly httpStatus = 409;
  constructor() {
    super("BOOKED availability rows are managed by the booking module and cannot be removed here.");
  }
}
