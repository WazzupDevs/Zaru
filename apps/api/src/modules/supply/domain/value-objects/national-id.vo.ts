import { InvalidNationalIdError } from "../errors/invalid-national-id.error";

/**
 * Turkish national identity number (TCKN). 11 digits with two checksum
 * digits (10th and 11th) computed from the first nine.
 *
 * **Plaintext value lives only in memory** during request processing — never
 * written to DB (we store HMAC-SHA256 hash via PiiHasher) and never logged
 * (pino redaction `*.nationalId` strips it). ADR 0016.
 */
export class NationalIdVO {
  private constructor(readonly value: string) {}

  static create(raw: string): NationalIdVO {
    const cleaned = raw.replace(/\s/g, "");

    // 11 digits, fully numeric, first digit cannot be 0.
    if (!/^[1-9]\d{10}$/.test(cleaned)) {
      throw new InvalidNationalIdError("INVALID_FORMAT");
    }

    const digits = cleaned.split("").map(Number) as [
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
    ];

    // 10th digit: ((d1+d3+d5+d7+d9) * 7 - (d2+d4+d6+d8)) mod 10
    const oddSum = digits[0] + digits[2] + digits[4] + digits[6] + digits[8];
    const evenSum = digits[1] + digits[3] + digits[5] + digits[7];
    const check10 = (((oddSum * 7 - evenSum) % 10) + 10) % 10;
    if (check10 !== digits[9]) {
      throw new InvalidNationalIdError("INVALID_CHECKSUM_10");
    }

    // 11th digit: sum of first 10 mod 10
    const sum10 = digits.slice(0, 10).reduce((a, b) => a + b, 0);
    const check11 = sum10 % 10;
    if (check11 !== digits[10]) {
      throw new InvalidNationalIdError("INVALID_CHECKSUM_11");
    }

    return new NationalIdVO(cleaned);
  }

  toString(): string {
    return this.value;
  }
}
