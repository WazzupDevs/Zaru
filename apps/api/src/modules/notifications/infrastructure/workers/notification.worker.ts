import { Processor, WorkerHost } from "@nestjs/bullmq";
import { type Job } from "bullmq";

import { NOTIFICATION_QUEUE_NAME } from "./notification.constants";
import { SendNotificationUseCase } from "../../application/use-cases/send-notification.use-case";

@Processor(NOTIFICATION_QUEUE_NAME, { concurrency: 4 })
export class NotificationWorker extends WorkerHost {
  constructor(private readonly useCase: SendNotificationUseCase) {
    super();
  }

  async process(job: Job<{ notificationId: string }>): Promise<void> {
    await this.useCase.execute({ notificationId: job.data.notificationId });
  }
}
