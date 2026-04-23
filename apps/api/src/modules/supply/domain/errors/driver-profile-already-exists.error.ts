import { DomainError } from "../../../../common/errors/domain-error";

export class DriverProfileAlreadyExistsError extends DomainError {
  readonly code = "SUPPLY_DRIVER_PROFILE_ALREADY_EXISTS";
  readonly httpStatus = 409;

  constructor() {
    super("This user already has a driver profile.");
  }
}
