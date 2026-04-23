import { describe, expect, it } from "vitest";

import { OtpCodeVO } from "./otp-code.vo";
import { InvalidOtpError } from "../errors/invalid-otp.error";

describe("OtpCodeVO", () => {
  it("accepts a 6-digit numeric code", () => {
    const vo = OtpCodeVO.create("123456");
    expect(vo.value).toBe("123456");
  });

  it("trims surrounding whitespace", () => {
    expect(OtpCodeVO.create("  123456  ").value).toBe("123456");
  });

  it("trims interior whitespace (paste from formatted SMS)", () => {
    expect(OtpCodeVO.create("123 456").value).toBe("123456");
  });

  it("rejects 5-digit code", () => {
    expect(() => OtpCodeVO.create("12345")).toThrow(InvalidOtpError);
  });

  it("rejects 7-digit code", () => {
    expect(() => OtpCodeVO.create("1234567")).toThrow(InvalidOtpError);
  });

  it("rejects non-numeric code", () => {
    expect(() => OtpCodeVO.create("abc123")).toThrow(InvalidOtpError);
  });

  it("rejects empty string", () => {
    expect(() => OtpCodeVO.create("")).toThrow(InvalidOtpError);
  });
});
