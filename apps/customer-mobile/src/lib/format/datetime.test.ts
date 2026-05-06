import { describe, expect, it } from "vitest";

import { formatLocalDateTime, parseLocalDateTime } from "./datetime";

describe("parseLocalDateTime", () => {
  it("parses a canonical 'YYYY-MM-DD HH:mm' string", () => {
    const d = parseLocalDateTime("2026-08-15 14:00");
    expect(d).not.toBeNull();
    expect(d?.getFullYear()).toBe(2026);
    expect(d?.getMonth()).toBe(7); // August (0-indexed)
    expect(d?.getDate()).toBe(15);
    expect(d?.getHours()).toBe(14);
    expect(d?.getMinutes()).toBe(0);
  });

  it("accepts the ISO-style 'T' separator", () => {
    expect(parseLocalDateTime("2026-08-15T22:30")).not.toBeNull();
  });

  it("trims surrounding whitespace", () => {
    expect(parseLocalDateTime("  2026-08-15 14:00  ")).not.toBeNull();
  });

  it.each([
    ["", "empty"],
    ["2026-08-15", "missing time"],
    ["14:00", "missing date"],
    ["2026/08/15 14:00", "wrong separator"],
    ["2026-13-15 14:00", "invalid month"],
    ["2026-02-30 14:00", "Feb 30 (round-trip rejection)"],
    ["2026-08-15 25:00", "invalid hour"],
    ["2026-08-15 14:60", "invalid minute"],
    ["abcd-ef-gh ij:kl", "non-numeric"],
  ])("rejects %s (%s)", (input) => {
    expect(parseLocalDateTime(input)).toBeNull();
  });
});

describe("formatLocalDateTime", () => {
  it("zero-pads single-digit components", () => {
    const d = new Date(2026, 0, 5, 9, 4); // 2026-01-05 09:04
    expect(formatLocalDateTime(d)).toBe("2026-01-05 09:04");
  });

  it("round-trips through parseLocalDateTime", () => {
    const original = new Date(2026, 7, 15, 14, 0);
    const reparsed = parseLocalDateTime(formatLocalDateTime(original));
    expect(reparsed?.getTime()).toBe(original.getTime());
  });
});
