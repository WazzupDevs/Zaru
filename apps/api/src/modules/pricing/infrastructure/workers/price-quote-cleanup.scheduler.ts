import { InjectQueue } from "@nestjs/bullmq";
import { Injectable, OnApplicationShutdown, OnModuleInit } from "@nestjs/common";
import { Queue } from "bullmq";
import { InjectPinoLogger, PinoLogger } from "nestjs-pino";

import {
  PRICE_QUOTE_CLEANUP_INTERVAL_MS,
  PRICE_QUOTE_CLEANUP_JOB,
  PRICE_QUOTE_CLEANUP_QUEUE_NAME,
} from "./price-quote-cleanup.constants";

@Injectable()
export class PriceQuoteCleanupScheduler implements OnModuleInit, OnApplicationShutdown {
  constructor(
    @InjectQueue(PRICE_QUOTE_CLEANUP_QUEUE_NAME) private readonly queue: Queue,
    @InjectPinoLogger(PriceQuoteCleanupScheduler.name)
    private readonly logger: PinoLogger,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.queue.add(
      PRICE_QUOTE_CLEANUP_JOB,
      {},
      {
        jobId: "price-quote-cleanup-repeat",
        repeat: { every: PRICE_QUOTE_CLEANUP_INTERVAL_MS },
        removeOnComplete: { count: 24 },
        removeOnFail: { count: 24 },
      },
    );
    this.logger.info(
      { intervalMs: PRICE_QUOTE_CLEANUP_INTERVAL_MS },
      "price quote cleanup scheduled",
    );
  }

  async onApplicationShutdown(): Promise<void> {
    await this.queue.close();
    this.logger.info("price quote cleanup queue closed");
  }
}
