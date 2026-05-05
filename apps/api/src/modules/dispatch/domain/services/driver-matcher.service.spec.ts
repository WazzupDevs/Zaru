import { describe, expect, it } from "vitest";

import { DriverMatcher, type DriverCandidate } from "./driver-matcher.service";
import { InvalidDispatchPolicyError } from "../errors/dispatch-errors";
import { DEFAULT_MATCHING_POLICY } from "../value-objects/matching-policy";

const matcher = new DriverMatcher();

function c(
  id: string,
  distanceKm: number,
  ratingAverage: number,
  overrides: Partial<DriverCandidate> = {},
): DriverCandidate {
  return {
    driverProfileId: id,
    userId: `user-${id}`,
    vehicleId: `vehicle-${id}`,
    vehicleTypeId: "vt-sedan",
    distanceKm,
    ratingAverage,
    ratingCount: 10,
    ...overrides,
  };
}

describe("DriverMatcher.pickBestMatch", () => {
  it("returns null on empty candidates", () => {
    expect(matcher.pickBestMatch([], DEFAULT_MATCHING_POLICY)).toBeNull();
  });

  it("picks the only candidate when single eligible", () => {
    const result = matcher.pickBestMatch([c("d1", 5, 4.8)], DEFAULT_MATCHING_POLICY);
    expect(result?.candidate.driverProfileId).toBe("d1");
  });

  it("filters out candidates beyond maxRadiusKm", () => {
    const result = matcher.pickBestMatch(
      [c("far", 30, 5.0), c("near", 4, 4.5)],
      DEFAULT_MATCHING_POLICY,
    );
    expect(result?.candidate.driverProfileId).toBe("near");
  });

  it("filters out candidates below minRating", () => {
    const result = matcher.pickBestMatch(
      [c("low", 2, 3.5), c("good", 6, 4.6)],
      DEFAULT_MATCHING_POLICY,
    );
    expect(result?.candidate.driverProfileId).toBe("good");
  });

  it("returns null when all candidates fail filters", () => {
    expect(
      matcher.pickBestMatch([c("far", 40, 5.0), c("low", 1, 3.0)], DEFAULT_MATCHING_POLICY),
    ).toBeNull();
  });

  it("breaks score ties by driverProfileId ascending (deterministic)", () => {
    // Both candidates: distance 5, rating 5 → identical score
    const result = matcher.pickBestMatch(
      [c("zzz", 5, 5.0), c("aaa", 5, 5.0), c("mmm", 5, 5.0)],
      DEFAULT_MATCHING_POLICY,
    );
    expect(result?.candidate.driverProfileId).toBe("aaa");
  });

  it("calculates a precise score with default weights (5 km, rating 5.0)", () => {
    // distanceScore = 1 - 5/25 = 0.8 ; ratingScore = 1.0
    // score = 0.7 * 0.8 + 0.3 * 1.0 = 0.56 + 0.30 = 0.86
    const result = matcher.pickBestMatch([c("d1", 5, 5.0)], DEFAULT_MATCHING_POLICY);
    expect(result?.score).toBeCloseTo(0.86, 6);
  });

  it("favours close-but-low-rating over far-and-high-rating with default weights", () => {
    // close-low: 1 km, 4.0 → 0.7*(24/25) + 0.3*(0.8) = 0.672 + 0.24 = 0.912
    // far-high:  20 km, 5.0 → 0.7*(5/25) + 0.3*1.0 = 0.14 + 0.30 = 0.44
    const result = matcher.pickBestMatch(
      [c("far-high", 20, 5.0), c("close-low", 1, 4.0)],
      DEFAULT_MATCHING_POLICY,
    );
    expect(result?.candidate.driverProfileId).toBe("close-low");
  });

  it("with distanceWeight=1 ignores rating differences", () => {
    const policy = { ...DEFAULT_MATCHING_POLICY, distanceWeight: 1, ratingWeight: 0 };
    const result = matcher.pickBestMatch(
      [c("far-perfect", 20, 5.0), c("near-okay", 5, 4.0)],
      policy,
    );
    expect(result?.candidate.driverProfileId).toBe("near-okay");
  });

  it("with ratingWeight=1 ignores distance within radius", () => {
    const policy = { ...DEFAULT_MATCHING_POLICY, distanceWeight: 0, ratingWeight: 1 };
    const result = matcher.pickBestMatch([c("near-mid", 1, 4.2), c("far-top", 20, 5.0)], policy);
    expect(result?.candidate.driverProfileId).toBe("far-top");
  });

  it("filters negative distance defensively", () => {
    expect(matcher.pickBestMatch([c("bad", -1, 5.0)], DEFAULT_MATCHING_POLICY)).toBeNull();
  });

  it("throws InvalidDispatchPolicyError on bad policy bounds", () => {
    expect(() =>
      matcher.pickBestMatch([c("d1", 5, 5)], {
        maxRadiusKm: 100, // > 50 cap
        minRating: 4,
        distanceWeight: 0.7,
        ratingWeight: 0.3,
      }),
    ).toThrow(InvalidDispatchPolicyError);
  });
});
