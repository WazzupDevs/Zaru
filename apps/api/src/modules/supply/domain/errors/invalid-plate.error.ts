import { DomainError } from "../../../../common/errors/domain-error";

export class InvalidPlateError extends DomainError {
  readonly code = "SUPPLY_INVALID_PLATE";
  readonly httpStatus = 400;

  constructor() {
    super("Plate number does not match the Turkish format (NN AAA NNNN).");
  }
}
