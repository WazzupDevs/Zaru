import { Processor, WorkerHost } from "@nestjs/bullmq";

import { IDEMPOTENCY_CLEANUP_QUEUE_NAME } from "./idempotency-cleanup.constants";
import { IdempotencyCleanupService } from "./idempotency-cleanup.service";

@Processor(IDEMPOTENCY_CLEANUP_QUEUE_NAME, { concurrency: 1 })
export class IdempotencyCleanupWorker extends WorkerHost {
  constructor(private readonly service: IdempotencyCleanupService) {
    super();
  }

  async process(): Promise<{ deleted: number }> {
    const deleted = await this.service.sweep();
    return { deleted };
  }
}
