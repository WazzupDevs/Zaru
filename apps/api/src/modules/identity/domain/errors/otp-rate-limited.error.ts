import { DomainError } from "../../../../common/errors/domain-error";

export type OtpRateLimitScope = "per_minute" | "per_hour" | "per_ip_minute";

export class OtpRateLimitedError extends DomainError {
  readonly code = "OTP_RATE_LIMITED";
  readonly httpStatus = 429;

  constructor(
    readonly scope: OtpRateLimitScope,
    readonly retryAfterSeconds: number,
  ) {
    super(`OTP rate limit exceeded (${scope})`, { scope, retryAfterSeconds });
  }
}
