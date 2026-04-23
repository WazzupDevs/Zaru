import { describe, expect, it } from "vitest";

import { SlugVO } from "./slug.vo";
import { InvalidSlugError } from "../errors/invalid-slug.error";

describe("SlugVO", () => {
  it.each(["wedding-car", "tow-truck", "valet", "shuttle-bus", "k9"])("accepts %s", (s) => {
    expect(SlugVO.create(s).value).toBe(s);
  });

  it.each([
    "Wedding-Car", // uppercase
    "WEDDING", // all caps
    "wedding car", // space
    "wedding--car", // double dash
    "-wedding", // leading dash
    "wedding-", // trailing dash
    "", // empty
    "a", // too short
  ])("rejects %s", (s) => {
    expect(() => SlugVO.create(s)).toThrow(InvalidSlugError);
  });
});
