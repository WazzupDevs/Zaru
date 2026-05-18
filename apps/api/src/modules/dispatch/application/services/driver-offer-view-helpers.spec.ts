import { Decimal } from "@prisma/client/runtime/library";
import { describe, expect, it } from "vitest";

import { calculateDriverEarnings, maskE164 } from "./driver-offer-view-helpers";

describe("calculateDriverEarnings", () => {
  it("applies a 20% commission to a TRY total", () => {
    const result = calculateDriverEarnings("6877.00", "0.20", "TRY");
    expect(result).toEqual({ amount: "5501.60", currency: "TRY" });
  });

  it("applies a 15% commission to a TRY total (legacy seed)", () => {
    const result = calculateDriverEarnings("6877.00", "0.15", "TRY");
    expect(result).toEqual({ amount: "5845.45", currency: "TRY" });
  });

  it("returns 0.00 when commission rate is 1.0", () => {
    const result = calculateDriverEarnings("100.00", "1.0", "TRY");
    expect(result).toEqual({ amount: "0.00", currency: "TRY" });
  });

  it("returns total when commission rate is 0", () => {
    const result = calculateDriverEarnings("250.50", "0", "TRY");
    expect(result).toEqual({ amount: "250.50", currency: "TRY" });
  });

  it("accepts Decimal inputs", () => {
    const result = calculateDriverEarnings(new Decimal("1000.00"), new Decimal("0.25"), "TRY");
    expect(result).toEqual({ amount: "750.00", currency: "TRY" });
  });

  it("rounds to two decimals (banker-cut)", () => {
    // 33.33 × (1 - 0.2) = 26.664 → toFixed(2) rounds half-away-from-zero.
    const result = calculateDriverEarnings("33.33", "0.20", "TRY");
    expect(result.amount).toMatch(/^26\.6[56]$/);
  });

  it("preserves the passed-in currency", () => {
    const result = calculateDriverEarnings("100", "0.10", "EUR");
    expect(result.currency).toBe("EUR");
  });
});

describe("maskE164", () => {
  it("masks a Turkish mobile number keeping first 6 + last 4", () => {
    expect(maskE164("+905551234567")).toBe("+90555***4567");
  });

  it("masks any E.164 input as long as it has >=10 chars", () => {
    expect(maskE164("+14155552671")).toBe("+14155***2671");
  });

  it("returns *** for an empty string", () => {
    expect(maskE164("")).toBe("***");
  });

  it("returns *** for a too-short string (defensive)", () => {
    expect(maskE164("+9055")).toBe("***");
  });
});
