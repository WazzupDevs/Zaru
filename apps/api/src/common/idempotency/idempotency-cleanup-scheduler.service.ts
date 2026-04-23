import { InjectQueue } from "@nestjs/bullmq";
import { Injectable, OnApplicationShutdown, OnModuleInit } from "@nestjs/common";
import { Queue } from "bullmq";
import { InjectPinoLogger, PinoLogger } from "nestjs-pino";

import {
  IDEMPOTENCY_CLEANUP_INTERVAL_MS,
  IDEMPOTENCY_CLEANUP_JOB,
  IDEMPOTENCY_CLEANUP_QUEUE_NAME,
} from "./idempotency-cleanup.constants";

@Injectable()
export class IdempotencyCleanupScheduler implements OnModuleInit, OnApplicationShutdown {
  constructor(
    @InjectQueue(IDEMPOTENCY_CLEANUP_QUEUE_NAME) private readonly queue: Queue,
    @InjectPinoLogger(IdempotencyCleanupScheduler.name)
    private readonly logger: PinoLogger,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.queue.add(
      IDEMPOTENCY_CLEANUP_JOB,
      {},
      {
        jobId: "idempotency-cleanup-repeat",
        repeat: { every: IDEMPOTENCY_CLEANUP_INTERVAL_MS },
        removeOnComplete: { count: 24 },
        removeOnFail: { count: 24 },
      },
    );
    this.logger.info(
      { intervalMs: IDEMPOTENCY_CLEANUP_INTERVAL_MS },
      "idempotency cleanup scheduled",
    );
  }

  async onApplicationShutdown(): Promise<void> {
    await this.queue.close();
    this.logger.info("idempotency cleanup queue closed");
  }
}
