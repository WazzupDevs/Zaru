import { describe, expect, it } from "vitest";

import { InMemoryRateLimiter } from "../../../test/fakes/in-memory-rate-limiter";

const KEY = "rl:test:demo";

describe("RateLimiterPort contract (in-memory fake)", () => {
  it("admits exactly `limit` calls inside the window", async () => {
    const limiter = new InMemoryRateLimiter();
    const r1 = await limiter.check({ key: KEY, limit: 3, windowSeconds: 60 });
    const r2 = await limiter.check({ key: KEY, limit: 3, windowSeconds: 60 });
    const r3 = await limiter.check({ key: KEY, limit: 3, windowSeconds: 60 });
    const r4 = await limiter.check({ key: KEY, limit: 3, windowSeconds: 60 });

    expect(r1.allowed).toBe(true);
    expect(r1.remaining).toBe(2);
    expect(r2.remaining).toBe(1);
    expect(r3.remaining).toBe(0);
    expect(r4.allowed).toBe(false);
    expect(r4.retryAfterSeconds).toBeGreaterThan(0);
    expect(r4.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it("does not record denied attempts (window stays anchored to original calls)", async () => {
    let now = 1000;
    const limiter = new InMemoryRateLimiter(() => now);
    await limiter.check({ key: KEY, limit: 1, windowSeconds: 60 });
    // 30 saniye içinde 5 reddedilmiş istek; pencere ilk admit'e bağlı kalmalı.
    for (let i = 0; i < 5; i++) {
      now += 5_000;
      const denied = await limiter.check({ key: KEY, limit: 1, windowSeconds: 60 });
      expect(denied.allowed).toBe(false);
    }
    // İlk admit + 60s + 1ms — yeni pencere açılır, admit edilir.
    now = 1000 + 60_001;
    const fresh = await limiter.check({ key: KEY, limit: 1, windowSeconds: 60 });
    expect(fresh.allowed).toBe(true);
  });

  it("slides the window: old entries roll out so new admissions are possible", async () => {
    let now = 0;
    const limiter = new InMemoryRateLimiter(() => now);

    // 3 admit at t=0, t=10s, t=20s (window=30s, limit=3)
    now = 0;
    await limiter.check({ key: KEY, limit: 3, windowSeconds: 30 });
    now = 10_000;
    await limiter.check({ key: KEY, limit: 3, windowSeconds: 30 });
    now = 20_000;
    await limiter.check({ key: KEY, limit: 3, windowSeconds: 30 });

    now = 25_000;
    const denied = await limiter.check({ key: KEY, limit: 3, windowSeconds: 30 });
    expect(denied.allowed).toBe(false);

    // t=31s — t=0 entry'si pencerden çıkar, yeniden admit edilir
    now = 31_000;
    const fresh = await limiter.check({ key: KEY, limit: 3, windowSeconds: 30 });
    expect(fresh.allowed).toBe(true);
    expect(fresh.remaining).toBe(0); // 3 girer (10s, 20s, 31s)
  });

  it("isolates buckets by key", async () => {
    const limiter = new InMemoryRateLimiter();
    const a1 = await limiter.check({ key: "rl:a", limit: 1, windowSeconds: 60 });
    const a2 = await limiter.check({ key: "rl:a", limit: 1, windowSeconds: 60 });
    const b1 = await limiter.check({ key: "rl:b", limit: 1, windowSeconds: 60 });

    expect(a1.allowed).toBe(true);
    expect(a2.allowed).toBe(false);
    expect(b1.allowed).toBe(true);
  });
});
