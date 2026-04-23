import { Global, Module } from "@nestjs/common";

import { RATE_LIMITER_PORT } from "./rate-limiter.port";
import { RedisSlidingWindowRateLimiter } from "./redis-sliding-window-rate-limiter";

@Global()
@Module({
  providers: [
    RedisSlidingWindowRateLimiter,
    { provide: RATE_LIMITER_PORT, useExisting: RedisSlidingWindowRateLimiter },
  ],
  exports: [RATE_LIMITER_PORT],
})
export class RateLimitModule {}
