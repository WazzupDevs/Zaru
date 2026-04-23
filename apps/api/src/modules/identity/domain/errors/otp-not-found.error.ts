import { DomainError } from "../../../../common/errors/domain-error";

/**
 * No active OTP row matched (phone, requestId). May indicate a typo, a
 * rotation chain mismatch, or an OTP that was invalidated after too many
 * failed attempts. Use 404 (not 400) — there's nothing wrong with the
 * client's input format; the resource just isn't there.
 */
export class OtpNotFoundError extends DomainError {
  readonly code = "OTP_NOT_FOUND";
  readonly httpStatus = 404;
}
