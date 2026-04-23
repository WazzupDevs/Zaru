import { type ConfigService } from "@nestjs/config";
import { describe, expect, it } from "vitest";

import { PiiHasher } from "./pii-hasher";

import type { Env } from "../../config/env";

function build(secret = "0".repeat(64)): PiiHasher {
  const config = {
    get: (key: string) => (key === "PII_HMAC_SECRET" ? secret : undefined),
  } as unknown as ConfigService<Env, true>;
  return new PiiHasher(config);
}

describe("PiiHasher.hashNationalId", () => {
  it("is deterministic — same input produces same hash", () => {
    const h = build();
    const a = h.hashNationalId("10000000146");
    const b = h.hashNationalId("10000000146");
    expect(a).toBe(b);
  });

  it("changes when the secret changes", () => {
    const a = build("a".repeat(64)).hashNationalId("10000000146");
    const b = build("b".repeat(64)).hashNationalId("10000000146");
    expect(a).not.toBe(b);
  });

  it("returns a 64-char hex string (sha256)", () => {
    const out = build().hashNationalId("10000000146");
    expect(out).toMatch(/^[0-9a-f]{64}$/);
  });

  it("matchesNationalIdHash accepts the hash it just produced", () => {
    const h = build();
    const hash = h.hashNationalId("10000000146");
    expect(h.matchesNationalIdHash("10000000146", hash)).toBe(true);
    expect(h.matchesNationalIdHash("11111111111", hash)).toBe(false);
  });
});

describe("PiiHasher.hashIban / verifyIban", () => {
  const IBAN = "TR330006100519786457841326";

  it("hashIban produces a non-deterministic argon2id hash", async () => {
    const h = build();
    const a = await h.hashIban(IBAN);
    const b = await h.hashIban(IBAN);
    expect(a).not.toBe(b);
    expect(a).toMatch(/^\$argon2id\$/);
  });

  it("verifyIban returns true for the right IBAN", async () => {
    const h = build();
    const hash = await h.hashIban(IBAN);
    expect(await h.verifyIban(IBAN, hash)).toBe(true);
  });

  it("verifyIban returns false for the wrong IBAN", async () => {
    const h = build();
    const hash = await h.hashIban(IBAN);
    expect(await h.verifyIban("TR330006100519786457841327", hash)).toBe(false);
  });
});
