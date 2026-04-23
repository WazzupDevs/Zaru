import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { LoggerModule } from "nestjs-pino";

import { JwtAuthGuard } from "./common/auth/jwt-auth.guard";
import { EventBusModule } from "./common/events/event-bus.module";
import { DomainExceptionFilter } from "./common/filters/domain-exception.filter";
import { HealthModule } from "./common/health/health.module";
import { IdempotencyModule } from "./common/idempotency/idempotency.module";
import { buildLoggerConfig } from "./common/logger/logger.config";
import { OutboxModule } from "./common/outbox/outbox.module";
import { PrismaModule } from "./common/prisma/prisma.module";
import { QueueModule } from "./common/queue/queue.module";
import { RateLimitModule } from "./common/rate-limit/rate-limit.module";
import { RedisModule } from "./common/redis/redis.module";
import { RequestContextModule } from "./common/request-context/request-context.module";
import { type Env, validateEnv } from "./config/env";
import { IdentityModule } from "./modules/identity/identity.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: (raw) => validateEnv(raw),
      cache: true,
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => buildLoggerConfig(config),
    }),
    RequestContextModule,
    PrismaModule,
    RedisModule,
    QueueModule,
    EventBusModule,
    RateLimitModule,
    IdempotencyModule,
    OutboxModule,
    HealthModule,
    IdentityModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: DomainExceptionFilter },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
