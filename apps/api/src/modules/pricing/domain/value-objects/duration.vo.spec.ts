import { describe, expect, it } from "vitest";

import { DurationVO } from "./duration.vo";

describe("DurationVO", () => {
  it("converts ms to fractional hours", () => {
    expect(DurationVO.fromMs(8 * 3_600_000).toNumber()).toBe(8);
    expect(DurationVO.fromMs(4.5 * 3_600_000).toNumber()).toBe(4.5);
  });

  it("rejects zero or negative duration", () => {
    expect(() => DurationVO.fromHours(0)).toThrowError(/strictly positive/);
    expect(() => DurationVO.fromHours(-1)).toThrowError(/strictly positive/);
  });

  it("rounds half-up to 2 decimals", () => {
    expect(DurationVO.fromHours("1.555").toNumber()).toBe(1.56);
  });
});
