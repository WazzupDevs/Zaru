import { DomainError } from "../../../../common/errors/domain-error";

export type InvalidIbanReason = "INVALID_FORMAT" | "INVALID_CHECKSUM";

export class InvalidIbanError extends DomainError {
  readonly code = "SUPPLY_INVALID_IBAN";
  readonly httpStatus = 400;

  constructor(reason: InvalidIbanReason) {
    super(`Invalid IBAN: ${reason}`, { reason });
  }
}
