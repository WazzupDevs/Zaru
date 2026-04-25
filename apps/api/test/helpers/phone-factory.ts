/**
 * Returns a unique TR mobile phone in E.164 format for test isolation.
 * The rate limiter buckets per phone (and per IP); reusing hard-coded phones
 * across sibling tests trips the per-phone-minute limit and surprises tests.
 *
 * Format: `+905XXXXXXXXX` (10 digits after the +905). The leading mobile
 * prefix `5` is fixed (TR mobile validator), the remaining 9 digits are random.
 */
export function uniquePhone(): string {
  const random = String(Math.floor(Math.random() * 1_000_000_000)).padStart(9, "0");
  return `+905${random}`;
}
