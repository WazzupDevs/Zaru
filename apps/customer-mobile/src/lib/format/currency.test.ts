import { describe, expect, it } from "vitest";

import { formatTrCurrency } from "./currency";

describe("formatTrCurrency", () => {
  it("formats a whole-string amount with thousand separators + comma decimal", () => {
    expect(formatTrCurrency("6877.00")).toBe("6.877,00");
    expect(formatTrCurrency("6877")).toBe("6.877,00");
  });

  it("preserves a single-decimal value with two-place padding", () => {
    expect(formatTrCurrency("6877.5")).toBe("6.877,50");
  });

  it("formats a JS number", () => {
    expect(formatTrCurrency(6877)).toBe("6.877,00");
    expect(formatTrCurrency(6877.5)).toBe("6.877,50");
  });

  it("formats sub-1000 amounts without a thousand separator", () => {
    expect(formatTrCurrency(150)).toBe("150,00");
  });

  it("returns '0,00' for null / undefined / NaN-shaped input", () => {
    expect(formatTrCurrency(null)).toBe("0,00");
    expect(formatTrCurrency(undefined)).toBe("0,00");
    expect(formatTrCurrency("not-a-number")).toBe("0,00");
  });
});
