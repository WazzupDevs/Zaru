import { Decimal } from "decimal.js";

import { DistanceVO } from "../value-objects/distance.vo";
import { DurationVO } from "../value-objects/duration.vo";
import { MoneyVO } from "../value-objects/money.vo";
import { type PriceBreakdown } from "../value-objects/price-breakdown.vo";

import type { PricingProfileEntity, PricingRuleEntity } from "../entities/pricing-types";

export interface CalculationInput {
  profile: PricingProfileEntity;
  distance: DistanceVO;
  duration: DurationVO;
  /** Already filtered by RuleEvaluator. ADDON rules in this list are *available*; only those in selectedAddonIds bill. */
  applicableRules: PricingRuleEntity[];
  selectedAddonIds: string[];
}

/**
 * Pure function. Order:
 *   1. baseFee
 *   2. + distanceFee (only billable km above includedKm)
 *   3. + hourlyFee  (clamp duration to profile.minimumHours)
 *   4. = subtotal
 *   5. multiply by every applicable SEASONAL / DAY_OF_WEEK multiplier (compound)
 *   6. + each opted-in ADDON's fixedAmount
 *   7. = totalAmount
 *
 * Rule order doesn't matter for multiplication (commutative); the test
 * `compound multipliers` pins this contract.
 */
export class PricingCalculator {
  calculate(input: CalculationInput): PriceBreakdown {
    const currency = input.profile.currency;

    // 1. Base fee
    const baseFee = MoneyVO.create(input.profile.baseFee, currency);

    // 2. Distance fee (only billable km above includedKm)
    const distanceKm = input.distance.toNumber();
    const billableKm = Math.max(0, distanceKm - input.profile.includedKm);
    const distanceFee = MoneyVO.create(input.profile.perKmFee, currency).multiply(billableKm);

    // 3. Hourly fee (clamp to profile.minimumHours)
    const billableHours = Decimal.max(input.profile.minimumHours, input.duration.hours);
    const hourlyFee = MoneyVO.create(input.profile.perHourFee, currency).multiply(billableHours);

    // 4. Subtotal
    const subtotal = baseFee.add(distanceFee).add(hourlyFee);

    // 5. Multipliers (compound)
    let withMultipliers = subtotal;
    const appliedMultipliers: PriceBreakdown["multipliers"] = [];
    for (const rule of input.applicableRules) {
      if (
        (rule.type === "SEASONAL_MULTIPLIER" || rule.type === "DAY_OF_WEEK_MULTIPLIER") &&
        rule.multiplier !== null
      ) {
        withMultipliers = withMultipliers.multiply(rule.multiplier);
        appliedMultipliers.push({
          ruleId: rule.id,
          name: rule.name,
          multiplier: new Decimal(rule.multiplier).toFixed(2),
          appliedTo: "subtotal",
        });
      }
    }

    // 6. Addons (after multipliers, fixed amount)
    let total = withMultipliers;
    const appliedAddons: PriceBreakdown["addons"] = [];
    for (const rule of input.applicableRules) {
      if (
        rule.type === "ADDON" &&
        rule.fixedAmount !== null &&
        input.selectedAddonIds.includes(rule.id)
      ) {
        const addonAmount = MoneyVO.create(rule.fixedAmount, currency);
        total = total.add(addonAmount);
        appliedAddons.push({ ruleId: rule.id, name: rule.name, amount: addonAmount });
      }
    }

    return {
      baseFee,
      distanceFee,
      hourlyFee,
      subtotal,
      multipliers: appliedMultipliers,
      addons: appliedAddons,
      totalAmount: total,
    };
  }
}
