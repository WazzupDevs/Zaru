import { Processor, WorkerHost } from "@nestjs/bullmq";
import { ConfigService } from "@nestjs/config";
import { type Job } from "bullmq";
import { InjectPinoLogger, PinoLogger } from "nestjs-pino";

import { NOTIFICATION_QUEUE_NAME } from "./notification.constants";
import { DeadLetterNotificationUseCase } from "../../application/use-cases/dead-letter-notification.use-case";
import { SendNotificationUseCase } from "../../application/use-cases/send-notification.use-case";

import type { Env } from "../../../../config/env";

@Processor(NOTIFICATION_QUEUE_NAME, { concurrency: 4 })
export class NotificationWorker extends WorkerHost {
  private readonly maxAttempts: number;

  constructor(
    private readonly sendUseCase: SendNotificationUseCase,
    private readonly deadLetterUseCase: DeadLetterNotificationUseCase,
    @InjectPinoLogger(NotificationWorker.name)
    private readonly logger: PinoLogger,
    config: ConfigService<Env, true>,
  ) {
    super();
    this.maxAttempts = config.get("NOTIFICATION_MAX_ATTEMPTS", { infer: true });
  }

  async process(job: Job<{ notificationId: string }>): Promise<void> {
    const attemptNumber = job.attemptsMade + 1;
    try {
      await this.sendUseCase.execute({
        notificationId: job.data.notificationId,
        attemptNumber,
      });
    } catch (err) {
      const isFinalAttempt = attemptNumber >= this.maxAttempts;
      if (isFinalAttempt) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          { notificationId: job.data.notificationId, attempt: attemptNumber },
          "final attempt failed — dead-lettering",
        );
        await this.deadLetterUseCase.execute({
          notificationId: job.data.notificationId,
          finalError: message,
          attempts: attemptNumber,
        });
      }
      throw err; // BullMQ records the failure; for non-final attempts it
      // schedules the next retry per the queue's backoff config.
    }
  }
}
