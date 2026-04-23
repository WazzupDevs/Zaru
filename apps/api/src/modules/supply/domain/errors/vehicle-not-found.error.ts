import { DomainError } from "../../../../common/errors/domain-error";

export class VehicleNotFoundError extends DomainError {
  readonly code = "SUPPLY_VEHICLE_NOT_FOUND";
  readonly httpStatus = 404;

  constructor() {
    super("Vehicle not found.");
  }
}

export class VehicleConcurrencyError extends DomainError {
  readonly code = "SUPPLY_VEHICLE_CONCURRENT_MODIFICATION";
  readonly httpStatus = 409;

  constructor() {
    super("Vehicle was modified by another request. Reload and retry.");
  }
}
