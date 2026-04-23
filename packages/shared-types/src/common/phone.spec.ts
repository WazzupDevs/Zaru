import { describe, it, expect } from "vitest";

import { PhoneE164Schema } from "./phone.js";

describe("PhoneE164Schema (TR mobile only)", () => {
  it.each(["+905551234567", "+905001234567", "+905991234567"])(
    "accepts valid TR mobile %s",
    (input) => {
      expect(PhoneE164Schema.parse(input)).toBe(input);
    },
  );

  it.each([
    ["+15551234567", "international (US)"],
    ["+902121234567", "TR landline (212)"],
    ["+90551234567", "missing one digit"],
    ["+9055512345678", "extra digit"],
    ["905551234567", "missing + prefix"],
    ["+90 555 123 45 67", "spaces present"],
    ["", "empty string"],
    ["+90455551234", "wrong second digit (4 not 5)"],
  ])("rejects %s (%s)", (input) => {
    expect(() => PhoneE164Schema.parse(input)).toThrow();
  });
});
