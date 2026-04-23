import { InjectQueue } from "@nestjs/bullmq";
import { Injectable, OnApplicationShutdown, OnModuleInit } from "@nestjs/common";
import { Queue } from "bullmq";
import { InjectPinoLogger, PinoLogger } from "nestjs-pino";

import { OUTBOX_DRAIN_INTERVAL_MS, OUTBOX_DRAIN_JOB, OUTBOX_QUEUE_NAME } from "./outbox.constants";

/**
 * Registers the repeatable drain job at boot and tears the queue down
 * on app shutdown so the BullMQ worker disconnects cleanly. Nest's
 * enableShutdownHooks (set in main.ts) drives onApplicationShutdown.
 */
@Injectable()
export class OutboxScheduler implements OnModuleInit, OnApplicationShutdown {
  constructor(
    @InjectQueue(OUTBOX_QUEUE_NAME) private readonly queue: Queue,
    @InjectPinoLogger(OutboxScheduler.name)
    private readonly logger: PinoLogger,
  ) {}

  async onModuleInit(): Promise<void> {
    // Idempotent: jobId pinned so a restart doesn't multiply the schedule.
    await this.queue.add(
      OUTBOX_DRAIN_JOB,
      {},
      {
        jobId: "outbox-drain-repeat",
        repeat: { every: OUTBOX_DRAIN_INTERVAL_MS },
        removeOnComplete: { count: 50 },
        removeOnFail: { count: 100 },
      },
    );
    this.logger.info({ intervalMs: OUTBOX_DRAIN_INTERVAL_MS }, "outbox drain scheduled");
  }

  async onApplicationShutdown(): Promise<void> {
    await this.queue.close();
    this.logger.info("outbox queue closed");
  }
}
