import { InvalidOtpError } from "../errors/invalid-otp.error";

/**
 * OTP code value object — exactly 6 numeric digits.
 * Construction is the single validation entry; downstream code can trust
 * the value. Whitespace is trimmed before validation so users pasting
 * "123 456" or "  123456  " still work.
 */
export class OtpCodeVO {
  private constructor(readonly value: string) {}

  static create(raw: string): OtpCodeVO {
    const trimmed = raw.replace(/\s+/g, "");
    if (!/^\d{6}$/.test(trimmed)) {
      throw new InvalidOtpError(`Invalid OTP code format: ${raw}`);
    }
    return new OtpCodeVO(trimmed);
  }

  toString(): string {
    return this.value;
  }
}
