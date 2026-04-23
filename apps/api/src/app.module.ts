import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { APP_FILTER } from "@nestjs/core";
import { LoggerModule } from "nestjs-pino";

import { DomainExceptionFilter } from "./common/filters/domain-exception.filter";
import { HealthModule } from "./common/health/health.module";
import { IdempotencyModule } from "./common/idempotency/idempotency.module";
import { buildLoggerConfig } from "./common/logger/logger.config";
import { PrismaModule } from "./common/prisma/prisma.module";
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
    IdempotencyModule,
    HealthModule,
    IdentityModule,
  ],
  providers: [{ provide: APP_FILTER, useClass: DomainExceptionFilter }],
})
export class AppModule {}
