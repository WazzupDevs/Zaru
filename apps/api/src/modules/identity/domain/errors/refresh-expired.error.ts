import { DomainError } from "../../../../common/errors/domain-error";

export class RefreshExpiredError extends DomainError {
  readonly code = "REFRESH_EXPIRED";
  readonly httpStatus = 401;
}
