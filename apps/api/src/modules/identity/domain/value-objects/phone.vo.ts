import { PhoneE164Schema } from "@event-fleet/shared-types";

import { InvalidPhoneError } from "../errors/invalid-phone.error";

/**
 * Phone number value object — TR mobile only (see ADR 0003 §7).
 * Construction is the single validation entry; downstream code can trust the value.
 */
export class PhoneVO {
  private constructor(readonly value: string) {}

  static create(raw: string): PhoneVO {
    const result = PhoneE164Schema.safeParse(raw);
    if (!result.success) {
      throw new InvalidPhoneError(`Invalid phone format: ${raw}`, {
        issues: result.error.issues,
      });
    }
    return new PhoneVO(result.data);
  }

  toString(): string {
    return this.value;
  }

  equals(other: PhoneVO): boolean {
    return this.value === other.value;
  }
}
