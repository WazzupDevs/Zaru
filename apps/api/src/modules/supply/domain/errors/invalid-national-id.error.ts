import { DomainError } from "../../../../common/errors/domain-error";

export type InvalidNationalIdReason =
  | "INVALID_FORMAT"
  | "INVALID_CHECKSUM_10"
  | "INVALID_CHECKSUM_11";

export class InvalidNationalIdError extends DomainError {
  readonly code = "SUPPLY_INVALID_NATIONAL_ID";
  readonly httpStatus = 400;

  constructor(reason: InvalidNationalIdReason) {
    super(`Invalid Turkish national id: ${reason}`, { reason });
  }
}
