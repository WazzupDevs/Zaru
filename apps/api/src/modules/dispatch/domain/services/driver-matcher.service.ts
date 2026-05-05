import { Injectable } from "@nestjs/common";

import { InvalidDispatchPolicyError } from "../errors/dispatch-errors";
import { isPolicyValid, type MatchingPolicy } from "../value-objects/matching-policy";

/**
 * Candidate row a search adapter returns. Distance is already in km
 * (geography ST_Distance returns metres, the adapter divides by 1000).
 */
export interface DriverCandidate {
  driverProfileId: string;
  userId: string;
  vehicleId: string;
  vehicleTypeId: string;
  distanceKm: number;
  ratingAverage: number;
  ratingCount: number;
}

export interface ScoredCandidate {
  candidate: DriverCandidate;
  score: number;
}

/**
 * Pure scoring + ranking. No I/O, no clock, no logger — input → output.
 * The SQL adapter does all filtering that depends on PostGIS or table
 * joins; the matcher only enforces minRating + maxRadiusKm here as a
 * defence in depth (cheap belt-and-braces in case the adapter is widened).
 *
 * Ties are broken by driverProfileId asc — deterministic so tests can
 * pin exact picks across runs (ADR 0020).
 */
@Injectable()
export class DriverMatcher {
  pickBestMatch(candidates: DriverCandidate[], policy: MatchingPolicy): ScoredCandidate | null {
    if (!isPolicyValid(policy)) {
      throw new InvalidDispatchPolicyError(
        "policy bounds violated (radius, rating, or weight out of range)",
      );
    }

    const eligible = candidates.filter(
      (c) =>
        c.distanceKm >= 0 &&
        c.distanceKm <= policy.maxRadiusKm &&
        c.ratingAverage >= policy.minRating,
    );

    if (eligible.length === 0) return null;

    const scored: ScoredCandidate[] = eligible.map((c) => ({
      candidate: c,
      score: this.calculateScore(c, policy),
    }));

    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.candidate.driverProfileId.localeCompare(b.candidate.driverProfileId);
    });

    return scored[0] ?? null;
  }

  /** Exposed for tests; otherwise an internal of pickBestMatch. */
  calculateScore(c: DriverCandidate, policy: MatchingPolicy): number {
    const distanceScore = Math.max(0, 1 - c.distanceKm / policy.maxRadiusKm);
    const ratingScore = Math.min(1, c.ratingAverage / 5);
    return policy.distanceWeight * distanceScore + policy.ratingWeight * ratingScore;
  }
}
