import type {
  RateLimitCheckInput,
  RateLimitResult,
  RateLimiterPort,
} from "../../src/common/rate-limit/rate-limiter.port";

/**
 * In-memory sliding-window rate limiter. Test-only — production code
 * uses the Redis Lua-script implementation. Purpose: exercise the
 * RateLimiterPort contract in unit tests without spinning a Redis
 * container.
 *
 * Time source is injectable so specs can fast-forward by passing a
 * `nowProvider` instead of relying on `vi.setSystemTime`.
 */
export class InMemoryRateLimiter implements RateLimiterPort {
  private readonly buckets = new Map<string, number[]>();

  constructor(private readonly nowProvider: () => number = () => Date.now()) {}

  reset(): void {
    this.buckets.clear();
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async check(input: RateLimitCheckInput): Promise<RateLimitResult> {
    const now = this.nowProvider();
    const windowMs = input.windowSeconds * 1000;
    const cutoff = now - windowMs;

    const existing = this.buckets.get(input.key) ?? [];
    const live = existing.filter((ts) => ts > cutoff);

    if (live.length < input.limit) {
      live.push(now);
      this.buckets.set(input.key, live);
      const oldest = live[0] ?? now;
      return {
        allowed: true,
        remaining: input.limit - live.length,
        resetAt: new Date(oldest + windowMs),
      };
    }

    // Denied — do NOT record this attempt; preserve the original window.
    this.buckets.set(input.key, live);
    const oldest = live[0] ?? now;
    const retryAfterMs = oldest + windowMs - now;
    return {
      allowed: false,
      remaining: 0,
      resetAt: new Date(oldest + windowMs),
      retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)),
    };
  }
}
