import { Injectable } from "@nestjs/common";
import { HealthIndicator, HealthIndicatorResult, HealthCheckError } from "@nestjs/terminus";

import { RedisService } from "../redis/redis.service";

const PING_TIMEOUT_MS = 500;

@Injectable()
export class RedisHealthIndicator extends HealthIndicator {
  constructor(private readonly redis: RedisService) {
    super();
  }

  async pingCheck(key: string): Promise<HealthIndicatorResult> {
    try {
      const ping = this.redis.client.ping();
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => {
          reject(new Error("redis ping timeout"));
        }, PING_TIMEOUT_MS),
      );
      await Promise.race([ping, timeout]);
      return this.getStatus(key, true);
    } catch (err) {
      const result = this.getStatus(key, false, {
        message: err instanceof Error ? err.message : "redis ping failed",
      });
      throw new HealthCheckError("Redis check failed", result);
    }
  }
}
