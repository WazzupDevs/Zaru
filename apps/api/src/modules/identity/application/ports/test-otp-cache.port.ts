export const TEST_OTP_CACHE_PORT = Symbol("TEST_OTP_CACHE_PORT");

/**
 * Dev/test-only plaintext OTP cache. Wired to a real adapter only when
 * NODE_ENV !== production; in production we bind a no-op stub so any
 * accidental call is a silent miss instead of a leak.
 *
 * The use case calls `record(phone, code)` right after generating the
 * plaintext OTP. The TestOnlyController reads via `getLast(phone)`. See
 * docs/development-notes.md "Test-only OTP endpoint" for the rationale.
 */
export interface TestOtpCachePort {
  record(phone: string, code: string): void;
  getLast(phone: string): { code: string; issuedAt: Date } | null;
  reset(): void;
}
