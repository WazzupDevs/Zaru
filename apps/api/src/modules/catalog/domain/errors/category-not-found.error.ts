import { DomainError } from "../../../../common/errors/domain-error";

export class CategoryNotFoundError extends DomainError {
  readonly code = "CATEGORY_NOT_FOUND";
  readonly httpStatus = 404;
}
