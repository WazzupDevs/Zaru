import { InvalidIbanError } from "../errors/invalid-iban.error";

/**
 * Turkish IBAN (ISO 13616). 26 chars: "TR" + 2 control digits + 22 BBAN digits.
 * Verified via the mod-97-10 checksum.
 *
 * Plaintext is hashed with argon2id at the persistence boundary
 * (PiiHasher.hashIban). Display uses the `last4` field on DriverProfile.
 */
export class IbanVO {
  private constructor(
    /** Normalized form: uppercase, no spaces. */
    readonly fullIban: string,
    /** Last four BBAN digits — safe to show in lists / receipts. */
    readonly last4: string,
  ) {}

  static create(raw: string): IbanVO {
    const cleaned = raw.replace(/\s/g, "").toUpperCase();
    if (!/^TR\d{24}$/.test(cleaned)) {
      throw new InvalidIbanError("INVALID_FORMAT");
    }

    // mod-97 verification: move first 4 chars to end, replace letters with
    // their numeric equivalents (T=29, R=27), then verify the BigInt mod 97 == 1.
    const rearranged = cleaned.slice(4) + "2927" + cleaned.slice(2, 4);
    if (BigInt(rearranged) % 97n !== 1n) {
      throw new InvalidIbanError("INVALID_CHECKSUM");
    }

    return new IbanVO(cleaned, cleaned.slice(-4));
  }
}
