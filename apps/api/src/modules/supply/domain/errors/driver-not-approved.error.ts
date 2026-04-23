import { DomainError } from "../../../../common/errors/domain-error";

export class DriverNotApprovedError extends DomainError {
  readonly code = "SUPPLY_DRIVER_NOT_APPROVED";
  readonly httpStatus = 409;

  constructor() {
    super("Driver profile must be APPROVED before vehicles can be registered.");
  }
}
