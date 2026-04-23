import { Injectable } from "@nestjs/common";
import { InjectPinoLogger, PinoLogger } from "nestjs-pino";

import { RedisService } from "../redis/redis.service";

import type { RateLimitCheckInput, RateLimitResult, RateLimiterPort } from "./rate-limiter.port";

/**
 * Sliding-window-log algorithm via Redis sorted set + Lua script.
 *
 * KEYS[1] = bucket key
 * ARGV    = now_ms, window_ms, limit, ttl_sec
 *
 * Returns: { allowed (1|0), remaining, retry_after_seconds, oldest_ms }
 *
 * - ZREMRANGEBYSCORE evicts entries older than now-window
 * - ZCARD reads current count
 * - If under limit: ZADD a new entry (score = now_ms, member = "<ms>:<rand>"
 *   to keep entries unique) and EXPIRE the key for cleanup safety
 * - If at limit: read oldest entry to compute Retry-After
 *
 * Single round-trip; atomic by Redis single-thread guarantee.
 */
const LUA_SCRIPT = `
local key = KEYS[1]
local now_ms = tonumber(ARGV[1])
local window_ms = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local ttl_sec = tonumber(ARGV[4])

local cutoff = now_ms - window_ms
redis.call('ZREMRANGEBYSCORE', key, 0, cutoff)
local count = redis.call('ZCARD', key)

if count < limit then
  local member = now_ms .. ':' .. math.random(1, 1000000)
  redis.call('ZADD', key, now_ms, member)
  redis.call('EXPIRE', key, ttl_sec)
  local oldest_after = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  local oldest_ms = tonumber(oldest_after[2]) or now_ms
  return {1, limit - count - 1, 0, oldest_ms}
else
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  local oldest_ms = tonumber(oldest[2]) or now_ms
  local retry_after = math.ceil((oldest_ms + window_ms - now_ms) / 1000)
  if retry_after < 1 then retry_after = 1 end
  return {0, 0, retry_after, oldest_ms}
end
`;

@Injectable()
export class RedisSlidingWindowRateLimiter implements RateLimiterPort {
  // EVALSHA cache — set on first call after Redis connect.
  private scriptSha: string | null = null;

  constructor(
    private readonly redis: RedisService,
    @InjectPinoLogger(RedisSlidingWindowRateLimiter.name)
    private readonly logger: PinoLogger,
  ) {}

  async check(input: RateLimitCheckInput): Promise<RateLimitResult> {
    const now = Date.now();
    const windowMs = input.windowSeconds * 1000;
    // TTL = window + 10s slack so idle keys expire on their own.
    const ttlSec = input.windowSeconds + 10;

    const result = await this.evalScript(input.key, [
      String(now),
      String(windowMs),
      String(input.limit),
      String(ttlSec),
    ]);

    const [allowed, remaining, retryAfter, oldestMs] = result;
    const reset = new Date(oldestMs + windowMs);

    if (allowed === 1) {
      return { allowed: true, remaining, resetAt: reset };
    }
    return {
      allowed: false,
      remaining: 0,
      resetAt: reset,
      retryAfterSeconds: retryAfter,
    };
  }

  private async evalScript(key: string, argv: string[]): Promise<[number, number, number, number]> {
    const client = this.redis.client;
    this.scriptSha ??= (await client.script("LOAD", LUA_SCRIPT)) as string;
    try {
      const raw = (await client.evalsha(this.scriptSha, 1, key, ...argv)) as [
        number,
        number,
        number,
        number,
      ];
      return raw;
    } catch (err) {
      // NOSCRIPT — Redis was flushed/restarted; reload and retry once.
      if (err instanceof Error && err.message.includes("NOSCRIPT")) {
        this.logger.warn("EVALSHA NOSCRIPT, reloading script");
        this.scriptSha = (await client.script("LOAD", LUA_SCRIPT)) as string;
        const raw = (await client.evalsha(this.scriptSha, 1, key, ...argv)) as [
          number,
          number,
          number,
          number,
        ];
        return raw;
      }
      throw err;
    }
  }
}
