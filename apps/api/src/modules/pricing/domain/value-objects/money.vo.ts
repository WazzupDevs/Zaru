import { Decimal } from "decimal.js";

/**
 * Money value object — Decimal arithmetic for currency, never JS number.
 * Currency match is enforced on every operation; rounding is HALF_UP at
 * 2 decimal places so multiplier results land on TRY kuruş cleanly.
 *
 * Why Decimal: `0.1 + 0.2 === 0.30000000000000004` (IEEE 754); the audit
 * trail in PriceQuote.breakdown must equal the totalAmount. ADR 0017.
 */
export class MoneyVO {
  private constructor(
    readonly amount: Decimal,
    readonly currency: string,
  ) {}

  static create(amount: number | string | Decimal, currency = "TRY"): MoneyVO {
    const decimal = new Decimal(amount);
    if (decimal.isNegative()) {
      throw new Error("Money amount cannot be negative");
    }
    if (decimal.decimalPlaces() > 2) {
      throw new Error("Money amount cannot have more than 2 decimal places");
    }
    return new MoneyVO(decimal, currency);
  }

  static zero(currency = "TRY"): MoneyVO {
    return new MoneyVO(new Decimal(0), currency);
  }

  add(other: MoneyVO): MoneyVO {
    if (this.currency !== other.currency) {
      throw new Error(
        `Cannot add money of different currencies: ${this.currency} + ${other.currency}`,
      );
    }
    return new MoneyVO(this.amount.plus(other.amount), this.currency);
  }

  multiply(factor: number | string | Decimal): MoneyVO {
    const result = this.amount.times(factor).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    return new MoneyVO(result, this.currency);
  }

  isZero(): boolean {
    return this.amount.isZero();
  }

  equals(other: MoneyVO): boolean {
    return this.currency === other.currency && this.amount.equals(other.amount);
  }

  toNumber(): number {
    return this.amount.toNumber();
  }

  toString(): string {
    return `${this.amount.toFixed(2)} ${this.currency}`;
  }

  toJSON(): { amount: string; currency: string } {
    return { amount: this.amount.toFixed(2), currency: this.currency };
  }
}
