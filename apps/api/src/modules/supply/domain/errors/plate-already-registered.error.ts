import { DomainError } from "../../../../common/errors/domain-error";

export class PlateAlreadyRegisteredError extends DomainError {
  readonly code = "SUPPLY_PLATE_ALREADY_REGISTERED";
  readonly httpStatus = 409;

  constructor(plateNumber: string) {
    super(`A vehicle with plate ${plateNumber} is already registered.`, { plateNumber });
  }
}
