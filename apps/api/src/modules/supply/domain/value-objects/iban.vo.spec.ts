import { describe, expect, it } from "vitest";

import { IbanVO } from "./iban.vo";
import { InvalidIbanError } from "../errors/invalid-iban.error";

// IBAN registry sample for Türkiye — algorithmically valid, never a real account.
const VALID_TR_IBAN = "TR330006100519786457841326";

describe("IbanVO", () => {
  it("accepts a valid Turkish IBAN", () => {
    const vo = IbanVO.create(VALID_TR_IBAN);
    expect(vo.fullIban).toBe(VALID_TR_IBAN);
  });

  it("normalizes whitespace and lowercase", () => {
    const vo = IbanVO.create(" tr33 0006 1005 1978 6457 8413 26 ");
    expect(vo.fullIban).toBe(VALID_TR_IBAN);
  });

  it("exposes last4 for safe display", () => {
    const vo = IbanVO.create(VALID_TR_IBAN);
    expect(vo.last4).toBe("1326");
  });

  it("rejects non-TR IBAN as INVALID_FORMAT", () => {
    expect(() => IbanVO.create("DE89370400440532013000")).toThrowError(InvalidIbanError);
    try {
      IbanVO.create("DE89370400440532013000");
    } catch (err) {
      expect((err as InvalidIbanError).details?.reason).toBe("INVALID_FORMAT");
    }
  });

  it("rejects too-short input", () => {
    expect(() => IbanVO.create("TR3300061005197864578413")).toThrowError(/INVALID_FORMAT/);
  });

  it("rejects too-long input", () => {
    expect(() => IbanVO.create("TR330006100519786457841326999")).toThrowError(/INVALID_FORMAT/);
  });

  it("rejects letters in BBAN", () => {
    expect(() => IbanVO.create("TR3300061005197864578413AB")).toThrowError(/INVALID_FORMAT/);
  });

  it("rejects valid format with bad checksum (off-by-one)", () => {
    // Same BBAN but wrong control digits.
    expect(() => IbanVO.create("TR320006100519786457841326")).toThrowError(InvalidIbanError);
    try {
      IbanVO.create("TR320006100519786457841326");
    } catch (err) {
      expect((err as InvalidIbanError).details?.reason).toBe("INVALID_CHECKSUM");
    }
  });
});
