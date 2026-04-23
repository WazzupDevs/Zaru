import { Logger as NestLogger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { RedisSlidingWindowRateLimiter } from "../src/common/rate-limit/redis-sliding-window-rate-limiter";
import { RedisService } from "../src/common/redis/redis.service";

import type { Env } from "../src/config/env";
import type { PinoLogger } from "nestjs-pino";

/**
 * Real Redis (Testcontainers — provided by setup-integration.ts) +
 * the production limiter implementation. Port contract is already covered
 * by the unit suite via the in-memory fake; this suite verifies that the
 * Lua script behaves identically under real Redis semantics, especially
 * concurrent dispatch (single-thread Redis guarantee).
 */
describe("RedisSlidingWindowRateLimiter (Testcontainers)", () => {
  let redis: RedisService;
  let limiter: RedisSlidingWindowRateLimiter;

  beforeAll(async () => {
    const config = {
      get: (key: string) => process.env[key] ?? undefined,
    } as unknown as ConfigService<Env, true>;
    redis = new RedisService(config);
    await redis.onModuleInit();
    const noopLogger = {
      debug: () => undefined,
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined,
    } as unknown as PinoLogger;
    limiter = new RedisSlidingWindowRateLimiter(redis, noopLogger);
    NestLogger.overrideLogger(false);
  });

  afterAll(async () => {
    await redis.onModuleDestroy();
  });

  beforeEach(async () => {
    // Wipe any rate-limit keys between tests so we get a clean window.
    const keys = await redis.client.keys("rl:integration:*");
    if (keys.length) {
      await redis.client.del(...keys);
    }
  });

  it("admits exactly `limit` calls inside the window then denies", async () => {
    const key = `rl:integration:basic:${Date.now().toString()}`;
    const r1 = await limiter.check({ key, limit: 3, windowSeconds: 60 });
    const r2 = await limiter.check({ key, limit: 3, windowSeconds: 60 });
    const r3 = await limiter.check({ key, limit: 3, windowSeconds: 60 });
    const r4 = await limiter.check({ key, limit: 3, windowSeconds: 60 });

    expect([r1.allowed, r2.allowed, r3.allowed, r4.allowed]).toEqual([true, true, true, false]);
    expect(r1.remaining).toBe(2);
    expect(r4.retryAfterSeconds).toBeGreaterThan(0);
    expect(r4.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it("denied attempts are NOT recorded — window stays anchored to admitted entries", async () => {
    const key = `rl:integration:noop:${Date.now().toString()}`;
    await limiter.check({ key, limit: 1, windowSeconds: 60 });
    // 5 reddedilmiş istek bucket'ı genişletmemeli
    for (let i = 0; i < 5; i++) {
      const denied = await limiter.check({ key, limit: 1, windowSeconds: 60 });
      expect(denied.allowed).toBe(false);
    }
    const card = await redis.client.zcard(key);
    expect(card).toBe(1);
  });

  it("isolates buckets by key", async () => {
    const ts = Date.now().toString();
    const a1 = await limiter.check({
      key: `rl:integration:iso:a:${ts}`,
      limit: 1,
      windowSeconds: 60,
    });
    const a2 = await limiter.check({
      key: `rl:integration:iso:a:${ts}`,
      limit: 1,
      windowSeconds: 60,
    });
    const b1 = await limiter.check({
      key: `rl:integration:iso:b:${ts}`,
      limit: 1,
      windowSeconds: 60,
    });
    expect(a1.allowed).toBe(true);
    expect(a2.allowed).toBe(false);
    expect(b1.allowed).toBe(true);
  });

  it("concurrent dispatch admits exactly `limit` (Redis Lua atomicity)", async () => {
    const key = `rl:integration:concurrent:${Date.now().toString()}`;
    const promises = Array.from({ length: 10 }, () =>
      limiter.check({ key, limit: 5, windowSeconds: 60 }),
    );
    const results = await Promise.all(promises);
    const admitted = results.filter((r) => r.allowed).length;
    const denied = results.filter((r) => !r.allowed).length;
    expect(admitted).toBe(5);
    expect(denied).toBe(5);
  });

  it("sets a TTL within `windowSeconds + slack` so idle keys self-expire", async () => {
    const key = `rl:integration:ttl:${Date.now().toString()}`;
    await limiter.check({ key, limit: 1, windowSeconds: 60 });
    const ttl = await redis.client.ttl(key);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(60 + 10);
  });
});
