import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { LoggerModule } from "nestjs-pino";

import { JwtAuthGuard } from "./common/auth/jwt-auth.guard";
import { RolesGuard } from "./common/auth/roles.guard";
import { ClockModule } from "./common/clock/clock.module";
import { EventBusModule } from "./common/events/event-bus.module";
import { DomainExceptionFilter } from "./common/filters/domain-exception.filter";
import { HealthModule } from "./common/health/health.module";
import { IdempotencyModule } from "./common/idempotency/idempotency.module";
import { buildLoggerConfig } from "./common/logger/logger.config";
import { OutboxModule } from "./common/outbox/outbox.module";
import { PersistenceModule } from "./common/persistence/persistence.module";
import { PrismaModule } from "./common/prisma/prisma.module";
import { QueueModule } from "./common/queue/queue.module";
import { RateLimitModule } from "./common/rate-limit/rate-limit.module";
import { RedisModule } from "./common/redis/redis.module";
import { RequestContextModule } from "./common/request-context/request-context.module";
import { SecurityModule } from "./common/security/security.module";
import { StorageModule } from "./common/storage/storage.module";
import { type Env, validateEnv } from "./config/env";
import { BookingModule } from "./modules/booking/booking.module";
import { CatalogModule } from "./modules/catalog/catalog.module";
import { DispatchModule } from "./modules/dispatch/dispatch.module";
import { IdentityModule } from "./modules/identity/identity.module";
import { NotificationsModule } from "./modules/notifications/notifications.module";
import { PricingModule } from "./modules/pricing/pricing.module";
import { SupplyModule } from "./modules/supply/supply.module";

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
    ClockModule,
    PrismaModule,
    PersistenceModule,
    SecurityModule,
    StorageModule,
    RedisModule,
    QueueModule,
    EventBusModule,
    RateLimitModule,
    IdempotencyModule,
    OutboxModule,
    HealthModule,
    IdentityModule,
    CatalogModule,
    SupplyModule,
    PricingModule,
    BookingModule,
    DispatchModule,
    NotificationsModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: DomainExceptionFilter },
    // Order matters: APP_GUARD providers run in registration order, so
    // JwtAuthGuard hydrates req.user before RolesGuard inspects it.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
