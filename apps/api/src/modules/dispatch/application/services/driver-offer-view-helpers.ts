import { Decimal } from "@prisma/client/runtime/library";

import type { DriverOfferMoneyView } from "../use-cases/driver-offer-view-types";

/**
 * Driver's take-home share of the booking total: totalAmount × (1 -
 * commissionRate). The per-driver commission lives on DriverProfile
 * (default 0.20 in closed beta; admin can override). Returns a
 * string-formatted MoneyView with exactly two decimal places.
 */
export function calculateDriverEarnings(
  totalAmount: Decimal | string | number,
  commissionRate: Decimal | string | number,
  currency: string,
): DriverOfferMoneyView {
  const total = new Decimal(totalAmount.toString());
  const rate = new Decimal(commissionRate.toString());
  const earnings = total.mul(new Decimal(1).minus(rate));
  return { amount: earnings.toFixed(2), currency };
}

/**
 * E.164 phone masker for cross-party display. The driver app gets a
 * masked customer phone so the platform-no-side-deal rule (CLAUDE.md)
 * is enforced at the data boundary: even with a tampered client the
 * driver can't read the full number out of the response.
 *
 *   "+905551234567" → "+90555***4567"
 *
 * The shape is: keep first 6 chars + insert "***" + keep last 4.
 * Numbers shorter than 10 chars are returned as a generic "***"
 * placeholder rather than risk leaking any digit.
 */
export function maskE164(phoneE164: string): string {
  if (!phoneE164 || phoneE164.length < 10) return "***";
  return `${phoneE164.slice(0, 6)}***${phoneE164.slice(-4)}`;
}
