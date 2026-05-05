import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import type { Env } from "../../../../config/env";
import type { MatchingPolicy } from "../value-objects/matching-policy";

/**
 * Reads the matching policy out of env. Vehicle-type-aware overrides are
 * a future hook (e.g. classic-car may want a tighter radius); for A4c
 * a single global policy is enough — operator can change at deploy time.
 */
@Injectable()
export class DispatchPolicyService {
  constructor(private readonly config: ConfigService<Env, true>) {}

  getPolicy(): MatchingPolicy {
    return {
      maxRadiusKm: this.config.get("DISPATCH_MAX_RADIUS_KM", { infer: true }),
      minRating: this.config.get("DISPATCH_MIN_RATING", { infer: true }),
      distanceWeight: this.config.get("DISPATCH_DISTANCE_WEIGHT", { infer: true }),
      ratingWeight: this.config.get("DISPATCH_RATING_WEIGHT", { infer: true }),
    };
  }
}
