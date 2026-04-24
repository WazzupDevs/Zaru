/**
 * Time source abstraction. Application code reads time through this port
 * so tests can install a deterministic clock without freezing the real one.
 *
 * Conventions:
 *  - `now()` returns a fresh Date instance each call (never share Date refs
 *    across callers — they're mutable through setters).
 *  - `nowMs()` is the cheap path for code that only wants millis (rate
 *    limiter Lua ARGV, outbox backoff, perf measurements).
 *
 * Promoted from identity-internal (A2c) to common (A3a) so the rate limiter,
 * outbox worker, and any future module share one clock contract. ADR 0014.
 */
export const CLOCK_PORT = Symbol("CLOCK_PORT");

export interface ClockPort {
  now(): Date;
  nowMs(): number;
}
