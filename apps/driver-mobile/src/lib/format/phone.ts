/**
 * Phone format helpers for the TR-mobile-only flow.
 *
 * The shared-types PhoneE164Schema (`/^\+90(5)\d{9}$/`) is the authority
 * on what a *valid* phone is — these helpers handle the input/display
 * layer where users type "5551112233" or "0555 111 22 33" and we need
 * to canonicalise to "+905551112233" before posting to the API.
 *
 * Why not import the Zod schema and validate? Two reasons:
 *   1. The phone screen needs to format-while-typing, which means
 *      working with intermediate strings the schema would reject.
 *   2. We don't ship Zod in the mobile bundle (~30KB savings; the API
 *      is the validation source of truth).
 */

/**
 * Strip all non-digit characters and normalize to a 10-digit national
 * number, dropping a leading 0 (TR mobile is "5XX XXX XX XX" without
 * the leading 0 in E.164). Returns null if the result isn't 10 digits
 * or doesn't start with 5 (TR mobile prefix).
 */
export function normalizeTrMobile(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  // Accept "05XX...", "5XX...", or "+905XX..." → strip to 10 digits
  // starting with 5.
  let national = digits;
  if (national.startsWith("90") && national.length === 12) {
    national = national.slice(2);
  } else if (national.startsWith("0") && national.length === 11) {
    national = national.slice(1);
  }
  if (national.length !== 10 || !national.startsWith("5")) return null;
  return national;
}

/** Returns true when the input normalises to a valid TR mobile number. */
export function isValidTrMobile(input: string): boolean {
  return normalizeTrMobile(input) !== null;
}

/**
 * Convert any of "5551112233" / "0555 111 22 33" / "+90 555 111 22 33"
 * into the canonical E.164 form "+905551112233". Returns null if the
 * input isn't a valid TR mobile.
 */
export function toE164(input: string): string | null {
  const national = normalizeTrMobile(input);
  if (national === null) return null;
  return `+90${national}`;
}

/**
 * Pretty display format: "+90 555 111 22 33". Used by VerifyOtpScreen
 * to confirm which number the OTP was sent to. Falls back to the raw
 * input if it can't be parsed.
 */
export function formatTrMobileForDisplay(input: string): string {
  const national = normalizeTrMobile(input);
  if (national === null) return input;
  return `+90 ${national.slice(0, 3)} ${national.slice(3, 6)} ${national.slice(6, 8)} ${national.slice(8, 10)}`;
}

/**
 * Format-while-typing helper for the phone input. Takes any partial
 * digit string and inserts spaces at the canonical positions:
 *   "5"        → "5"
 *   "555"      → "555"
 *   "5551"     → "555 1"
 *   "555111"   → "555 111"
 *   "5551112"  → "555 111 2"
 *   "55511122" → "555 111 22"
 *   "5551112233" → "555 111 22 33"
 * Strips a leading 0 or +90 if the user pasted them, so the screen
 * always shows the national-number-without-prefix form.
 */
export function formatPartialAsYouType(input: string): string {
  const digits = input.replace(/\D/g, "");
  let national = digits;
  if (national.startsWith("90") && national.length > 10) {
    national = national.slice(2);
  } else if (national.startsWith("0") && national.length > 10) {
    national = national.slice(1);
  }
  national = national.slice(0, 10);

  if (national.length <= 3) return national;
  if (national.length <= 6) return `${national.slice(0, 3)} ${national.slice(3)}`;
  if (national.length <= 8) {
    return `${national.slice(0, 3)} ${national.slice(3, 6)} ${national.slice(6)}`;
  }
  return `${national.slice(0, 3)} ${national.slice(3, 6)} ${national.slice(6, 8)} ${national.slice(8)}`;
}
