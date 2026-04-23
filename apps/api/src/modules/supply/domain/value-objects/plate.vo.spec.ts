import { describe, expect, it } from "vitest";

import { PlateVO } from "./plate.vo";
import { InvalidPlateError } from "../errors/invalid-plate.error";

describe("PlateVO", () => {
  it.each([
    ["34 ABC 1234", "34ABC1234"],
    ["06 BB 99", "06BB99"],
    ["35 EFG 567", "35EFG567"],
    ["01 a 1234", "01A1234"],
  ])("normalizes '%s' to '%s'", (input, expected) => {
    expect(PlateVO.create(input).value).toBe(expected);
  });

  it("rejects plates without province digits", () => {
    expect(() => PlateVO.create("ABC 1234")).toThrowError(InvalidPlateError);
  });

  it("rejects plates with no letters", () => {
    expect(() => PlateVO.create("34 12 1234")).toThrowError(InvalidPlateError);
  });

  it("rejects plates with too many digits at the end", () => {
    expect(() => PlateVO.create("34 ABC 12345")).toThrowError(InvalidPlateError);
  });

  it("rejects plates with too few digits at the end", () => {
    expect(() => PlateVO.create("34 ABC 1")).toThrowError(InvalidPlateError);
  });
});
