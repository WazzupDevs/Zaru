import { describe, expect, it } from "vitest";

import {
  formatPartialAsYouType,
  formatTrMobileForDisplay,
  isValidTrMobile,
  normalizeTrMobile,
  toE164,
} from "./phone";

describe("normalizeTrMobile", () => {
  it("accepts the bare national 10-digit form", () => {
    expect(normalizeTrMobile("5551112233")).toBe("5551112233");
  });

  it("strips a leading 0 (Turkish national-call form)", () => {
    expect(normalizeTrMobile("05551112233")).toBe("5551112233");
  });

  it("strips a leading +90 / 90 (E.164 paste)", () => {
    expect(normalizeTrMobile("+905551112233")).toBe("5551112233");
    expect(normalizeTrMobile("905551112233")).toBe("5551112233");
  });

  it("strips spaces, parens, dashes from a formatted input", () => {
    expect(normalizeTrMobile("0 (555) 111-22-33")).toBe("5551112233");
    expect(normalizeTrMobile("+90 555 111 22 33")).toBe("5551112233");
  });

  it("rejects landlines (don't start with 5)", () => {
    expect(normalizeTrMobile("02121234567")).toBeNull();
    expect(normalizeTrMobile("4441234")).toBeNull();
  });

  it("rejects too-short or too-long inputs", () => {
    expect(normalizeTrMobile("555111")).toBeNull();
    expect(normalizeTrMobile("555111223344")).toBeNull();
  });

  it("rejects empty input", () => {
    expect(normalizeTrMobile("")).toBeNull();
  });
});

describe("isValidTrMobile", () => {
  it("returns true for a valid mobile, false otherwise", () => {
    expect(isValidTrMobile("5551112233")).toBe(true);
    expect(isValidTrMobile("+905551112233")).toBe(true);
    expect(isValidTrMobile("4441234")).toBe(false);
    expect(isValidTrMobile("")).toBe(false);
  });
});

describe("toE164", () => {
  it("converts national + formatted forms to canonical E.164", () => {
    expect(toE164("5551112233")).toBe("+905551112233");
    expect(toE164("0555 111 22 33")).toBe("+905551112233");
    expect(toE164("+90 555 111 22 33")).toBe("+905551112233");
  });

  it("returns null for invalid input", () => {
    expect(toE164("not-a-phone")).toBeNull();
    expect(toE164("4441234")).toBeNull();
  });
});

describe("formatTrMobileForDisplay", () => {
  it("formats a valid number as +90 555 111 22 33", () => {
    expect(formatTrMobileForDisplay("5551112233")).toBe("+90 555 111 22 33");
    expect(formatTrMobileForDisplay("+905551112233")).toBe("+90 555 111 22 33");
  });

  it("falls back to the raw input when not parseable", () => {
    expect(formatTrMobileForDisplay("garbage")).toBe("garbage");
  });
});

describe("formatPartialAsYouType", () => {
  it.each([
    ["", ""],
    ["5", "5"],
    ["55", "55"],
    ["555", "555"],
    ["5551", "555 1"],
    ["555111", "555 111"],
    ["5551112", "555 111 2"],
    ["55511122", "555 111 22"],
    ["555111223", "555 111 22 3"],
    ["5551112233", "555 111 22 33"],
  ])("%s → %s", (input, expected) => {
    expect(formatPartialAsYouType(input)).toBe(expected);
  });

  it("strips a leading 0 from a paste of 0555...", () => {
    expect(formatPartialAsYouType("05551112233")).toBe("555 111 22 33");
  });

  it("strips +90 / 90 from a paste", () => {
    expect(formatPartialAsYouType("+905551112233")).toBe("555 111 22 33");
    expect(formatPartialAsYouType("905551112233")).toBe("555 111 22 33");
  });

  it("clamps overflow to 10 national digits", () => {
    expect(formatPartialAsYouType("55511122334455")).toBe("555 111 22 33");
  });
});
