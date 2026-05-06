import { describe, expect, it } from "vitest";

import { formatTrCurrency } from "./format.helpers";

describe("formatTrCurrency", () => {
  it("pads a whole-string Decimal to two decimal places", () => {
    expect(formatTrCurrency("6877")).toBe("6877.00");
  });

  it("pads a single-decimal string to two decimal places", () => {
    expect(formatTrCurrency("6877.5")).toBe("6877.50");
  });

  it("preserves a two-decimal string", () => {
    expect(formatTrCurrency("6877.00")).toBe("6877.00");
  });

  it("accepts a JS number", () => {
    expect(formatTrCurrency(6877)).toBe("6877.00");
    expect(formatTrCurrency(6877.5)).toBe("6877.50");
  });

  it("returns '0.00' for null / undefined / NaN-shaped input", () => {
    expect(formatTrCurrency(null)).toBe("0.00");
    expect(formatTrCurrency(undefined)).toBe("0.00");
    expect(formatTrCurrency("not-a-number")).toBe("0.00");
  });

  it("clamps long-decimal input to two places (display only — callers pre-round money math)", () => {
    // Number.toFixed uses IEEE-754 banker's rounding, so 6877.995 →
    // 6877.99 not 6878.00. We do not depend on a specific rounding mode
    // here — the helper is for display, MoneyVO + Decimal.js handle
    // the real arithmetic with HALF_UP. Just assert the length / shape.
    const out = formatTrCurrency("6877.995");
    expect(out).toMatch(/^\d+\.\d{2}$/);
  });
});
