import { describe, expect, it } from "vitest";

import { RuleEvaluator } from "./rule-evaluator.service";

import type { PricingRuleEntity } from "../entities/pricing-types";

function rule(over: Partial<PricingRuleEntity>): PricingRuleEntity {
  return {
    id: "r-?",
    type: "SEASONAL_MULTIPLIER",
    categoryId: null,
    vehicleTypeId: null,
    name: "?",
    description: null,
    validFrom: null,
    validTo: null,
    daysOfWeek: null,
    multiplier: null,
    fixedAmount: null,
    isOptional: false,
    sortOrder: 0,
    isActive: true,
    ...over,
  };
}

const ctx = {
  eventStartAt: new Date("2026-08-15T14:00:00.000Z"), // a Saturday in August
  categoryId: "cat-wedding",
  vehicleTypeId: "vt-sedan",
};

describe("RuleEvaluator", () => {
  const evaluator = new RuleEvaluator();

  it("seasonal multiplier inside [validFrom, validTo] applies", () => {
    const result = evaluator.filterApplicable(
      [
        rule({
          id: "r-summer",
          type: "SEASONAL_MULTIPLIER",
          validFrom: new Date("2026-05-01"),
          validTo: new Date("2026-09-30"),
          multiplier: "1.30",
        }),
      ],
      ctx,
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("r-summer");
  });

  it("seasonal multiplier outside the window does not apply", () => {
    const result = evaluator.filterApplicable(
      [
        rule({
          type: "SEASONAL_MULTIPLIER",
          validFrom: new Date("2026-12-01"),
          validTo: new Date("2026-12-31"),
          multiplier: "1.50",
        }),
      ],
      ctx,
    );
    expect(result).toHaveLength(0);
  });

  it("day-of-week multiplier matches Saturday (bit 5 = 32)", () => {
    const result = evaluator.filterApplicable(
      [
        rule({
          id: "r-sat",
          type: "DAY_OF_WEEK_MULTIPLIER",
          daysOfWeek: 32, // Saturday only
          multiplier: "1.15",
        }),
      ],
      ctx,
    );
    expect(result).toHaveLength(1);
  });

  it("day-of-week multiplier matches weekend (Sat | Sun = 32 | 64 = 96)", () => {
    const result = evaluator.filterApplicable(
      [
        rule({
          id: "r-weekend",
          type: "DAY_OF_WEEK_MULTIPLIER",
          daysOfWeek: 96,
          multiplier: "1.15",
        }),
      ],
      ctx,
    );
    expect(result).toHaveLength(1);
  });

  it("day-of-week miss (weekday-only on a Saturday)", () => {
    const result = evaluator.filterApplicable(
      [
        rule({
          type: "DAY_OF_WEEK_MULTIPLIER",
          daysOfWeek: 1 | 2 | 4 | 8 | 16, // Mon-Fri
          multiplier: "1.10",
        }),
      ],
      ctx,
    );
    expect(result).toHaveLength(0);
  });

  it("category mismatch filters the rule out", () => {
    const result = evaluator.filterApplicable(
      [
        rule({
          type: "ADDON",
          categoryId: "cat-other",
          name: "Other category addon",
          fixedAmount: "100.00",
        }),
      ],
      ctx,
    );
    expect(result).toHaveLength(0);
  });

  it("vehicle type mismatch filters the rule out", () => {
    const result = evaluator.filterApplicable(
      [
        rule({
          type: "SEASONAL_MULTIPLIER",
          vehicleTypeId: "vt-other",
          validFrom: new Date("2026-01-01"),
          validTo: new Date("2026-12-31"),
          multiplier: "1.30",
        }),
      ],
      ctx,
    );
    expect(result).toHaveLength(0);
  });

  it("inactive rules are filtered out", () => {
    const result = evaluator.filterApplicable(
      [rule({ type: "ADDON", isActive: false, fixedAmount: "100.00" })],
      ctx,
    );
    expect(result).toHaveLength(0);
  });

  it("ADDON rules are always available when scope matches", () => {
    const result = evaluator.filterApplicable(
      [rule({ type: "ADDON", fixedAmount: "500.00", isOptional: true, name: "Süs" })],
      ctx,
    );
    expect(result).toHaveLength(1);
  });
});
