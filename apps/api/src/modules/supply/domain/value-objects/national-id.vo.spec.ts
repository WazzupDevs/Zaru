import { describe, expect, it } from "vitest";

import { NationalIdVO } from "./national-id.vo";
import { InvalidNationalIdError } from "../errors/invalid-national-id.error";

describe("NationalIdVO", () => {
  it.each(["10000000146", "11111111110", "12345678950"])(
    "accepts algorithmically valid TCKN %s",
    (input) => {
      const vo = NationalIdVO.create(input);
      expect(vo.value).toBe(input);
      expect(vo.toString()).toBe(input);
    },
  );

  it("strips inner whitespace before validating", () => {
    const vo = NationalIdVO.create("10000000146"); // already clean
    expect(vo.value).toBe("10000000146");
  });

  it("rejects 10-digit input as INVALID_FORMAT", () => {
    expect(() => NationalIdVO.create("1234567890")).toThrowError(InvalidNationalIdError);
    try {
      NationalIdVO.create("1234567890");
    } catch (err) {
      expect((err as InvalidNationalIdError).details?.reason).toBe("INVALID_FORMAT");
    }
  });

  it("rejects all-zeros (first digit 0) as INVALID_FORMAT", () => {
    expect(() => NationalIdVO.create("00000000000")).toThrowError(/INVALID_FORMAT/);
  });

  it("rejects checksum-failing TCKN", () => {
    // 12345678901 has the right format but wrong d10/d11.
    expect(() => NationalIdVO.create("12345678901")).toThrowError(InvalidNationalIdError);
  });

  it("rejects non-digit characters", () => {
    expect(() => NationalIdVO.create("1000000014A")).toThrowError(/INVALID_FORMAT/);
  });
});
