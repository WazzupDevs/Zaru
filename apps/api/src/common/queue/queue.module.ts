import { BullModule } from "@nestjs/bullmq";
import { Global, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import type { Env } from "../../config/env";

/**
 * Global BullMQ root config. Connection points at the same Redis the
 * RedisService uses (REDIS_URL). `maxRetriesPerRequest: null` is REQUIRED
 * by BullMQ — without it BullMQ throws "Using the maxRetriesPerRequest
 * is not supported" at queue creation. See development-notes.md.
 */
@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const url = new URL(config.get("REDIS_URL", { infer: true }));
        return {
          connection: {
            host: url.hostname,
            port: url.port ? parseInt(url.port, 10) : 6379,
            maxRetriesPerRequest: null,
          },
        };
      },
    }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
