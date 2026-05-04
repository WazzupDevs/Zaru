import { InjectQueue } from "@nestjs/bullmq";
import { Injectable, OnApplicationShutdown, OnModuleInit } from "@nestjs/common";
import { Queue } from "bullmq";
import { InjectPinoLogger, PinoLogger } from "nestjs-pino";

import {
  BOOKING_EXPIRY_INTERVAL_MS,
  BOOKING_EXPIRY_JOB,
  BOOKING_EXPIRY_QUEUE_NAME,
} from "./booking-expiry.constants";

@Injectable()
export class BookingExpiryScheduler implements OnModuleInit, OnApplicationShutdown {
  constructor(
    @InjectQueue(BOOKING_EXPIRY_QUEUE_NAME) private readonly queue: Queue,
    @InjectPinoLogger(BookingExpiryScheduler.name)
    private readonly logger: PinoLogger,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.queue.add(
      BOOKING_EXPIRY_JOB,
      {},
      {
        jobId: "booking-expiry-repeat",
        repeat: { every: BOOKING_EXPIRY_INTERVAL_MS },
        removeOnComplete: { count: 24 },
        removeOnFail: { count: 24 },
      },
    );
    this.logger.info({ intervalMs: BOOKING_EXPIRY_INTERVAL_MS }, "booking expiry scheduled");
  }

  async onApplicationShutdown(): Promise<void> {
    await this.queue.close();
    this.logger.info("booking expiry queue closed");
  }
}
