import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";

import type { Env } from "../../config/env";

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  readonly client: Redis;

  constructor(config: ConfigService<Env, true>) {
    const url = config.get("REDIS_URL", { infer: true });
    this.client = new Redis(url, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: true,
    });

    this.client.on("error", (err) => {
      this.logger.error({ err }, "Redis error");
    });
  }

  async onModuleInit(): Promise<void> {
    await this.client.connect();
    await this.client.ping();
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }
}
