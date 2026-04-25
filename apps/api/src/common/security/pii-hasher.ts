import { createHmac, timingSafeEqual } from "node:crypto";

import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as argon2 from "argon2";

import type { Env } from "../../config/env";

/**
 * PII-at-rest hashing. Two strategies, picked per data type:
 *
 * - **TCKN → HMAC-SHA256 deterministic.** Admin support needs to look up
 *   "which driver has TCKN X" — that requires deterministic hashing. Secret
 *   leak rotates via dual-write migration window. ADR 0016.
 *
 * - **IBAN → argon2id non-deterministic.** No search use case (admin can
 *   `verifyIban(input, hash)` if needed). Argon2 protects against offline
 *   brute force should the DB ever leak. Display uses a separate `last4`.
 */
@Injectable()
export class PiiHasher {
  private readonly hmacSecret: string;

  constructor(config: ConfigService<Env, true>) {
    this.hmacSecret = config.get("PII_HMAC_SECRET", { infer: true });
  }

  hashNationalId(nationalId: string): string {
    return createHmac("sha256", this.hmacSecret).update(nationalId).digest("hex");
  }

  /** Constant-time compare — useful for "is this hash the one I just computed?" checks. */
  matchesNationalIdHash(nationalId: string, hash: string): boolean {
    const computed = this.hashNationalId(nationalId);
    const a = Buffer.from(computed, "hex");
    const b = Buffer.from(hash, "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  }

  async hashIban(iban: string): Promise<string> {
    return argon2.hash(iban, { type: argon2.argon2id });
  }

  async verifyIban(iban: string, hash: string): Promise<boolean> {
    return argon2.verify(hash, iban);
  }
}
