import { describe, expect, it } from "vitest";

import { MoneyVO } from "./money.vo";

describe("MoneyVO", () => {
  it("creates from number, string, and Decimal", () => {
    expect(MoneyVO.create(100).toString()).toBe("100.00 TRY");
    expect(MoneyVO.create("99.99").toString()).toBe("99.99 TRY");
    expect(MoneyVO.create(0).isZero()).toBe(true);
  });

  it("rejects negative amounts", () => {
    expect(() => MoneyVO.create(-1)).toThrowError(/cannot be negative/);
  });

  it("rejects more than 2 decimal places", () => {
    expect(() => MoneyVO.create("1.234")).toThrowError(/2 decimal places/);
  });

  it("addition keeps Decimal precision", () => {
    const a = MoneyVO.create("0.10");
    const b = MoneyVO.create("0.20");
    expect(a.add(b).toString()).toBe("0.30 TRY"); // not 0.30000000000000004
  });

  it("rejects addition across currencies", () => {
    expect(() => MoneyVO.create(10, "TRY").add(MoneyVO.create(10, "USD"))).toThrowError(
      /different currencies/,
    );
  });

  it("multiply rounds HALF_UP at 2 places (5500 × 1.30 = 7150.00)", () => {
    expect(MoneyVO.create(5500).multiply("1.30").toString()).toBe("7150.00 TRY");
  });

  it("multiply rounds HALF_UP at 2 places (5500.50 × 1.30 = 7150.65)", () => {
    expect(MoneyVO.create("5500.50").multiply("1.30").toString()).toBe("7150.65 TRY");
  });

  it("multiply by zero returns zero of same currency", () => {
    expect(MoneyVO.create(100, "USD").multiply(0).equals(MoneyVO.zero("USD"))).toBe(true);
  });

  it("toJSON serializes amount as fixed-2 string", () => {
    expect(MoneyVO.create("10").toJSON()).toEqual({ amount: "10.00", currency: "TRY" });
  });
});
