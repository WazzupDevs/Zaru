import { DomainError } from "../../../../common/errors/domain-error";

export class InvalidSlugError extends DomainError {
  readonly code = "INVALID_SLUG";
  readonly httpStatus = 400;
}
