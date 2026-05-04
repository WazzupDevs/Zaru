import { Decimal } from "decimal.js";

/** Distance in kilometers, stored at 2-decimal precision. */
export class DistanceVO {
  private constructor(readonly km: Decimal) {}

  static fromKm(km: number | string | Decimal): DistanceVO {
    const decimal = new Decimal(km);
    if (decimal.isNegative()) {
      throw new Error("Distance cannot be negative");
    }
    return new DistanceVO(decimal.toDecimalPlaces(2, Decimal.ROUND_HALF_UP));
  }

  static zero(): DistanceVO {
    return new DistanceVO(new Decimal(0));
  }

  toNumber(): number {
    return this.km.toNumber();
  }
}
