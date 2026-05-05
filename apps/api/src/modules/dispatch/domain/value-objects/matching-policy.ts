/**
 * Matching policy: the knobs DriverMatcher uses to score candidates.
 *
 * Validation:
 *   - 0 < maxRadiusKm <= 50 (50 km is platform-wide cap; deeper radius
 *     would push candidate counts past the SQL LIMIT)
 *   - 0 <= minRating <= 5
 *   - 0 <= weights <= 1 each
 *   - distanceWeight + ratingWeight should equal 1.0; we tolerate other
 *     sums (operator can experiment) but the scoring math assumes both
 *     terms are bounded in [0, 1].
 */
export interface MatchingPolicy {
  maxRadiusKm: number;
  minRating: number;
  distanceWeight: number;
  ratingWeight: number;
}

export const DEFAULT_MATCHING_POLICY: MatchingPolicy = {
  maxRadiusKm: 25,
  minRating: 4.0,
  distanceWeight: 0.7,
  ratingWeight: 0.3,
};

export function isPolicyValid(policy: MatchingPolicy): boolean {
  return (
    policy.maxRadiusKm > 0 &&
    policy.maxRadiusKm <= 50 &&
    policy.minRating >= 0 &&
    policy.minRating <= 5 &&
    policy.distanceWeight >= 0 &&
    policy.distanceWeight <= 1 &&
    policy.ratingWeight >= 0 &&
    policy.ratingWeight <= 1
  );
}
