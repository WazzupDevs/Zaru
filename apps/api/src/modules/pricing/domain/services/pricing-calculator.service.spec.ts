import { describe, expect, it } from "vitest";

import { PricingCalculator } from "./pricing-calculator.service";
import { DistanceVO } from "../value-objects/distance.vo";
import { DurationVO } from "../value-objects/duration.vo";

import type { PricingProfileEntity, PricingRuleEntity } from "../entities/pricing-types";

const baseProfile: PricingProfileEntity = {
  id: "p-1",
  vehicleTypeId: "vt-1",
  currency: "TRY",
  baseFee: "3000.00",
  perKmFee: "15.00",
  perHourFee: "200.00",
  minimumHours: 4,
  includedKm: 50,
  isActive: true,
};

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

describe("PricingCalculator", () => {
  const calc = new PricingCalculator();

  it("base + included km + minimum hours: distance under includedKm bills 0", () => {
    const result = calc.calculate({
      profile: baseProfile,
      distance: DistanceVO.fromKm(30),
      duration: DurationVO.fromHours(2),
      applicableRules: [],
      selectedAddonIds: [],
    });
    expect(result.baseFee.toString()).toBe("3000.00 TRY");
    expect(result.distanceFee.toString()).toBe("0.00 TRY");
    // minimumHours = 4, even though duration is 2 → bill 4 × 200 = 800
    expect(result.hourlyFee.toString()).toBe("800.00 TRY");
    expect(result.subtotal.toString()).toBe("3800.00 TRY");
    expect(result.totalAmount.toString()).toBe("3800.00 TRY");
  });

  it("billable km only above includedKm (60 km, includedKm 50, perKm 15)", () => {
    const result = calc.calculate({
      profile: baseProfile,
      distance: DistanceVO.fromKm(60),
      duration: DurationVO.fromHours(8),
      applicableRules: [],
      selectedAddonIds: [],
    });
    expect(result.distanceFee.toString()).toBe("150.00 TRY"); // 10 km × 15
    expect(result.hourlyFee.toString()).toBe("1600.00 TRY"); // 8 × 200
    expect(result.subtotal.toString()).toBe("4750.00 TRY");
  });

  it("seasonal multiplier 1.30 applies to subtotal (5500 × 1.30 = 7150.00)", () => {
    const result = calc.calculate({
      profile: { ...baseProfile, baseFee: "5000.00", includedKm: 0 },
      distance: DistanceVO.fromKm(0),
      duration: DurationVO.fromHours(2.5), // 2.5 < min 4 → 4 × 200 = 800
      applicableRules: [
        rule({
          id: "r-summer",
          type: "SEASONAL_MULTIPLIER",
          name: "Yaz Sezonu",
          multiplier: "1.30",
        }),
      ],
      selectedAddonIds: [],
    });
    // base 5000 + distance 0 + hourly 800 = 5800; × 1.30 = 7540.00
    expect(result.subtotal.toString()).toBe("5800.00 TRY");
    expect(result.totalAmount.toString()).toBe("7540.00 TRY");
    expect(result.multipliers).toHaveLength(1);
  });

  it("compound multipliers apply commutatively (1.30 × 1.15 = 1.495)", () => {
    const result = calc.calculate({
      profile: { ...baseProfile, baseFee: "3000.00", includedKm: 0 },
      distance: DistanceVO.fromKm(0),
      duration: DurationVO.fromHours(0.1), // clamp to min 4 → 800
      applicableRules: [
        rule({ id: "r-summer", type: "SEASONAL_MULTIPLIER", name: "Yaz", multiplier: "1.30" }),
        rule({
          id: "r-weekend",
          type: "DAY_OF_WEEK_MULTIPLIER",
          name: "Hafta Sonu",
          multiplier: "1.15",
          daysOfWeek: 96,
        }),
      ],
      selectedAddonIds: [],
    });
    // subtotal 3800 × 1.30 = 4940; × 1.15 = 5681.00
    expect(result.totalAmount.toString()).toBe("5681.00 TRY");
    expect(result.multipliers).toHaveLength(2);
  });

  it("addons add fixed amounts AFTER multipliers", () => {
    const result = calc.calculate({
      profile: { ...baseProfile, includedKm: 0 },
      distance: DistanceVO.fromKm(0),
      duration: DurationVO.fromHours(4),
      applicableRules: [
        rule({ id: "r-mult", type: "SEASONAL_MULTIPLIER", name: "x1.30", multiplier: "1.30" }),
        rule({
          id: "addon-trim",
          type: "ADDON",
          name: "Süsleme",
          fixedAmount: "500.00",
          isOptional: true,
        }),
        rule({
          id: "addon-driver",
          type: "ADDON",
          name: "Şoför Üniforma",
          fixedAmount: "800.00",
          isOptional: true,
        }),
      ],
      selectedAddonIds: ["addon-trim"], // only one selected
    });
    // base 3000 + distance 0 + hourly 800 = 3800; × 1.30 = 4940; + 500 = 5440
    expect(result.totalAmount.toString()).toBe("5440.00 TRY");
    expect(result.addons).toHaveLength(1);
    expect(result.addons[0]?.name).toBe("Süsleme");
  });

  it("decimal-precision multiplier (5500.50 × 1.30 = 7150.65)", () => {
    const result = calc.calculate({
      profile: { ...baseProfile, baseFee: "5500.50", includedKm: 0, perHourFee: "0.00" },
      distance: DistanceVO.fromKm(0),
      duration: DurationVO.fromHours(4),
      applicableRules: [
        rule({ id: "r-mult", type: "SEASONAL_MULTIPLIER", name: "x1.30", multiplier: "1.30" }),
      ],
      selectedAddonIds: [],
    });
    // 5500.50 × 1.30 = 7150.65
    expect(result.totalAmount.toString()).toBe("7150.65 TRY");
  });

  it("unselected addons in applicableRules are NOT billed", () => {
    const result = calc.calculate({
      profile: { ...baseProfile, includedKm: 0 },
      distance: DistanceVO.fromKm(0),
      duration: DurationVO.fromHours(4),
      applicableRules: [
        rule({
          id: "addon",
          type: "ADDON",
          name: "Süs",
          fixedAmount: "500.00",
          isOptional: true,
        }),
      ],
      selectedAddonIds: [], // not selected
    });
    expect(result.addons).toHaveLength(0);
    expect(result.totalAmount.toString()).toBe("3800.00 TRY"); // 3000 + 800
  });
});
