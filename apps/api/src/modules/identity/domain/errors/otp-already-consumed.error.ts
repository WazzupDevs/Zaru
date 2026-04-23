import { DomainError } from "../../../../common/errors/domain-error";

export class OtpAlreadyConsumedError extends DomainError {
  readonly code = "OTP_ALREADY_CONSUMED";
  readonly httpStatus = 409;
}
