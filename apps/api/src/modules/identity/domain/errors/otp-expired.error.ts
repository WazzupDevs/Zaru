import { DomainError } from "../../../../common/errors/domain-error";

export class OtpExpiredError extends DomainError {
  readonly code = "OTP_EXPIRED";
  readonly httpStatus = 410;
}
