import { DomainError } from "../../../../common/errors/domain-error";

export class InvalidCoordinatesError extends DomainError {
  readonly code = "PRICING_INVALID_COORDINATES";
  readonly httpStatus = 400;

  constructor(reason: string) {
    super(`Invalid coordinates: ${reason}`, { reason });
  }
}
