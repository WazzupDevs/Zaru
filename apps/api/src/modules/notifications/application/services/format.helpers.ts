/**
 * Money + date formatting helpers shared by the outbox listener and
 * any future template caller. Pulled into application/services so
 * unit tests can pin them without spinning AppModule.
 */

/**
 * Formats a Decimal-string or numeric amount as a Turkish lira money
 * string with exactly two decimal places. Examples:
 *   "6877"     → "6877.00"
 *   "6877.5"   → "6877.50"
 *   6877       → "6877.00"
 *   "6877.999" → "7000.00"  (caller pre-rounds; we just clamp display)
 *
 * Defensive: invalid inputs return "0.00" so SMS bodies never carry
 * "NaN" or "undefined". Production callers (RequestPriceQuote,
 * ConfirmBooking) always pass real values; the fallback is for the
 * listener path where outbox payload shape changes might surprise us.
 */
export function formatTrCurrency(amount: string | number | null | undefined): string {
  if (amount === null || amount === undefined) return "0.00";
  const numeric = typeof amount === "number" ? amount : Number(amount);
  if (!Number.isFinite(numeric)) return "0.00";
  return numeric.toFixed(2);
}
