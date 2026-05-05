import { InjectQueue } from "@nestjs/bullmq";
import { Injectable, OnApplicationShutdown, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Queue } from "bullmq";
import { InjectPinoLogger, PinoLogger } from "nestjs-pino";

import { BOOKING_DISPATCH_JOB, BOOKING_DISPATCH_QUEUE_NAME } from "./booking-dispatch.constants";

import type { Env } from "../../../../config/env";

@Injectable()
export class BookingDispatchScheduler implements OnModuleInit, OnApplicationShutdown {
  private readonly intervalMs: number;

  constructor(
    @InjectQueue(BOOKING_DISPATCH_QUEUE_NAME) private readonly queue: Queue,
    @InjectPinoLogger(BookingDispatchScheduler.name)
    private readonly logger: PinoLogger,
    config: ConfigService<Env, true>,
  ) {
    this.intervalMs = config.get("DISPATCH_WORKER_INTERVAL_MS", { infer: true });
  }

  async onModuleInit(): Promise<void> {
    await this.queue.add(
      BOOKING_DISPATCH_JOB,
      {},
      {
        jobId: "booking-dispatch-repeat",
        repeat: { every: this.intervalMs },
        removeOnComplete: { count: 24 },
        removeOnFail: { count: 24 },
      },
    );
    this.logger.info({ intervalMs: this.intervalMs }, "booking dispatch scheduled");
  }

  async onApplicationShutdown(): Promise<void> {
    await this.queue.close();
    this.logger.info("booking dispatch queue closed");
  }
}
