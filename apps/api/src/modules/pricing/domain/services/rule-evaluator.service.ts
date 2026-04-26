import type { PricingRuleEntity } from "../entities/pricing-types";

export interface RuleContext {
  eventStartAt: Date;
  categoryId: string;
  vehicleTypeId: string;
}

/**
 * Filters the active rule set down to the rules that apply for a given
 * (date, category, vehicleType) tuple. Pure function — no I/O.
 *
 * Day-of-week bitmask convention: bit 0 = Monday, ..., bit 6 = Sunday.
 * JS `Date#getUTCDay()` returns 0 = Sunday, so we re-map.
 */
export class RuleEvaluator {
  filterApplicable(allRules: PricingRuleEntity[], ctx: RuleContext): PricingRuleEntity[] {
    return allRules.filter((rule) => {
      if (!rule.isActive) return false;
      if (rule.categoryId !== null && rule.categoryId !== ctx.categoryId) return false;
      if (rule.vehicleTypeId !== null && rule.vehicleTypeId !== ctx.vehicleTypeId) return false;

      switch (rule.type) {
        case "SEASONAL_MULTIPLIER":
          return this.matchesSeason(rule, ctx.eventStartAt);
        case "DAY_OF_WEEK_MULTIPLIER":
          return this.matchesDayOfWeek(rule, ctx.eventStartAt);
        case "ADDON":
          // Addons are always available — the customer chooses which to apply.
          return true;
      }
    });
  }

  private matchesSeason(rule: PricingRuleEntity, eventStartAt: Date): boolean {
    if (rule.multiplier === null) return false;
    const eventDay = startOfUtcDay(eventStartAt);
    if (rule.validFrom !== null && eventDay.getTime() < rule.validFrom.getTime()) return false;
    if (rule.validTo !== null && eventDay.getTime() > rule.validTo.getTime()) return false;
    return true;
  }

  private matchesDayOfWeek(rule: PricingRuleEntity, eventStartAt: Date): boolean {
    if (rule.multiplier === null || rule.daysOfWeek === null) return false;
    const bitmask = jsDayToBitmask(eventStartAt.getUTCDay());
    return (rule.daysOfWeek & bitmask) !== 0;
  }
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/** JS getUTCDay: 0=Sun, 1=Mon, ..., 6=Sat → bit 0=Mon, ..., bit 6=Sun. */
function jsDayToBitmask(jsDay: number): number {
  // Sunday is bit 6 (=64), Monday is bit 0 (=1), ..., Saturday is bit 5 (=32).
  const map = [64, 1, 2, 4, 8, 16, 32];
  return map[jsDay] ?? 0;
}
