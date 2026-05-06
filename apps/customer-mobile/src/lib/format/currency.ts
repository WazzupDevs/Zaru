/**
 * TR-locale currency display: "6877.00" → "6.877,00", number 6877.5 →
 * "6.877,50", invalid → "0,00". The API already pads to two decimals
 * (the booking mapper does Number(d.toString()).toFixed(2)) so this is
 * primarily a thousand-separator + comma-decimal formatter.
 *
 * We deliberately do NOT append the "₺" symbol here — render sites
 * sometimes want the number alone (e.g., breakdown rows where the unit
 * is implied) and sometimes with a symbol on the side. Caller appends.
 */
export function formatTrCurrency(amount: string | number | null | undefined): string {
  if (amount === null || amount === undefined) return "0,00";
  const numeric = typeof amount === "number" ? amount : Number(amount);
  if (!Number.isFinite(numeric)) return "0,00";
  return numeric.toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
