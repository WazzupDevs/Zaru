import { DomainError } from "../../../../common/errors/domain-error";

export class VerifyRateLimitedError extends DomainError {
  readonly code = "OTP_VERIFY_RATE_LIMITED";
  readonly httpStatus = 429;

  constructor(readonly retryAfterSeconds: number) {
    super(`OTP verify rate limit exceeded`, { retryAfterSeconds });
  }
}
