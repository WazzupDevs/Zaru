import { DomainError } from "../../../../common/errors/domain-error";

export class InvalidPhoneError extends DomainError {
  readonly code = "INVALID_PHONE";
  readonly httpStatus = 400;
}
