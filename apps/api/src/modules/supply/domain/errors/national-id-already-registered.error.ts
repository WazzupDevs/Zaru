import { DomainError } from "../../../../common/errors/domain-error";

export class NationalIdAlreadyRegisteredError extends DomainError {
  readonly code = "SUPPLY_NATIONAL_ID_ALREADY_REGISTERED";
  readonly httpStatus = 409;

  constructor() {
    super("Another driver is already registered with this national id.");
  }
}
