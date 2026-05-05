import { DomainError } from "../../../../common/errors/domain-error";

export class PricingRateLimitedError extends DomainError {
  readonly code = "PRICING_RATE_LIMITED";
  readonly httpStatus = 429;
  constructor(public readonly retryAfterSeconds: number) {
    super("Too many quote requests. Try again shortly.", { retryAfterSeconds });
  }
}
