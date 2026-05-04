import { MoneyVO } from "./money.vo";

/**
 * Audit-friendly breakdown of how `totalAmount` was reached. Stored as JSON
 * inside `price_quotes.breakdown` so a quote remains explainable years later
 * even if rules change.
 */
export interface AppliedMultiplier {
  ruleId: string;
  name: string;
  multiplier: string; // string for Decimal precision in JSON
  appliedTo: "subtotal";
}

export interface AppliedAddon {
  ruleId: string;
  name: string;
  amount: { amount: string; currency: string };
}

export interface PriceBreakdownJson {
  baseFee: { amount: string; currency: string };
  distanceFee: { amount: string; currency: string };
  hourlyFee: { amount: string; currency: string };
  subtotal: { amount: string; currency: string };
  multipliers: AppliedMultiplier[];
  addons: AppliedAddon[];
  totalAmount: { amount: string; currency: string };
}

export interface PriceBreakdown {
  baseFee: MoneyVO;
  distanceFee: MoneyVO;
  hourlyFee: MoneyVO;
  subtotal: MoneyVO;
  multipliers: AppliedMultiplier[];
  addons: { ruleId: string; name: string; amount: MoneyVO }[];
  totalAmount: MoneyVO;
}

export function breakdownToJson(b: PriceBreakdown): PriceBreakdownJson {
  return {
    baseFee: b.baseFee.toJSON(),
    distanceFee: b.distanceFee.toJSON(),
    hourlyFee: b.hourlyFee.toJSON(),
    subtotal: b.subtotal.toJSON(),
    multipliers: b.multipliers,
    addons: b.addons.map((a) => ({ ruleId: a.ruleId, name: a.name, amount: a.amount.toJSON() })),
    totalAmount: b.totalAmount.toJSON(),
  };
}
