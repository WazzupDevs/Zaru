import { DomainError } from "../../../../common/errors/domain-error";

export class DriverProfileNotFoundError extends DomainError {
  readonly code = "SUPPLY_DRIVER_PROFILE_NOT_FOUND";
  readonly httpStatus = 404;

  constructor() {
    super("Driver profile not found.");
  }
}
