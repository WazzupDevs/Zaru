import { describe, it, expect } from "vitest";

import { PhoneVO } from "./phone.vo";
import { InvalidPhoneError } from "../errors/invalid-phone.error";

describe("PhoneVO", () => {
  it("creates a VO from a valid TR mobile number", () => {
    const phone = PhoneVO.create("+905551234567");
    expect(phone.value).toBe("+905551234567");
    expect(phone.toString()).toBe("+905551234567");
  });

  it.each([
    "+15551234567",
    "+902121234567",
    "+90551234567",
    "905551234567",
    "+90 555 123 45 67",
    "",
    "abc",
  ])("throws InvalidPhoneError for %s", (input) => {
    expect(() => PhoneVO.create(input)).toThrow(InvalidPhoneError);
  });

  it("two VOs with same value are structurally equal", () => {
    const a = PhoneVO.create("+905551234567");
    const b = PhoneVO.create("+905551234567");
    expect(a.equals(b)).toBe(true);
  });
});
