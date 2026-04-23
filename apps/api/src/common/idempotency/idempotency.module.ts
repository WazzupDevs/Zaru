import { BullModule } from "@nestjs/bullmq";
import { Global, Module } from "@nestjs/common";

import { IdempotencyCleanupScheduler } from "./idempotency-cleanup-scheduler.service";
import { IDEMPOTENCY_CLEANUP_QUEUE_NAME } from "./idempotency-cleanup.constants";
import { IdempotencyCleanupService } from "./idempotency-cleanup.service";
import { IdempotencyCleanupWorker } from "./idempotency-cleanup.worker";
import { IdempotencyInterceptor } from "./idempotency.interceptor";

@Global()
@Module({
  imports: [BullModule.registerQueue({ name: IDEMPOTENCY_CLEANUP_QUEUE_NAME })],
  providers: [
    IdempotencyInterceptor,
    IdempotencyCleanupService,
    IdempotencyCleanupWorker,
    IdempotencyCleanupScheduler,
  ],
  exports: [IdempotencyInterceptor, IdempotencyCleanupService],
})
export class IdempotencyModule {}
