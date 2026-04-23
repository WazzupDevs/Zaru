import { DomainError } from "../../../../common/errors/domain-error";

export class RefreshNotFoundError extends DomainError {
  readonly code = "REFRESH_NOT_FOUND";
  readonly httpStatus = 401;
}
