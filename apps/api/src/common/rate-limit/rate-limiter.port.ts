export const RATE_LIMITER_PORT = Symbol("RATE_LIMITER_PORT");

export interface RateLimitCheckInput {
  /**
   * Fully-qualified key. Convention: `rl:<feature>:<scope>:<value>` —
   * e.g. `rl:otp:request:phone:+905551234567`. The `rl:` prefix is added
   * by callers, not the limiter itself, so the same port can host
   * non-rate-limit semantics if needed (e.g. queue cooldowns).
   */
  key: string;
  /** Maximum allowed events inside the window. */
  limit: number;
  /** Sliding window size in seconds. */
  windowSeconds: number;
}

export interface RateLimitResult {
  /** True if this call is admitted; false if it would exceed the limit. */
  allowed: boolean;
  /** How many further calls are still allowed inside the current window. */
  remaining: number;
  /** Wall-clock instant the oldest entry will roll out of the window. */
  resetAt: Date;
  /** Set when allowed=false: seconds until the next admission would succeed. */
  retryAfterSeconds?: number;
}

/**
 * Sliding-window rate limiter. Implementation is atomic across concurrent
 * callers (Redis Lua script in production, in-memory fake in tests).
 *
 * Semantics: every call that returns `allowed: true` is recorded; calls
 * that return `allowed: false` are NOT recorded (so a flood of denials
 * doesn't keep extending the window).
 */
export interface RateLimiterPort {
  check(input: RateLimitCheckInput): Promise<RateLimitResult>;
}
