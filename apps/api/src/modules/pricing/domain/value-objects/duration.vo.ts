import { Decimal } from "decimal.js";

/** Event duration in hours (decimal), e.g. 4.5 = 4 hours 30 minutes. */
export class DurationVO {
  private constructor(readonly hours: Decimal) {}

  static fromHours(hours: number | string | Decimal): DurationVO {
    const decimal = new Decimal(hours);
    if (decimal.isNegative() || decimal.isZero()) {
      throw new Error("Duration must be strictly positive");
    }
    return new DurationVO(decimal.toDecimalPlaces(2, Decimal.ROUND_HALF_UP));
  }

  static fromMs(milliseconds: number): DurationVO {
    return DurationVO.fromHours(new Decimal(milliseconds).div(3_600_000));
  }

  toNumber(): number {
    return this.hours.toNumber();
  }
}
