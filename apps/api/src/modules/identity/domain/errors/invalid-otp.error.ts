import { DomainError } from "../../../../common/errors/domain-error";

/**
 * Code did not match the stored hash. The use case bumps `attempt_count`
 * and throws this with `remainingAttempts` in details so the client can
 * surface a "you have N tries left" hint.
 */
export class InvalidOtpError extends DomainError {
  readonly code = "INVALID_OTP";
  readonly httpStatus = 400;
}
