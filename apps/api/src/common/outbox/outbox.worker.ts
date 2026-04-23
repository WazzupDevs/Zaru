import { Processor, WorkerHost } from "@nestjs/bullmq";

import { OutboxDrainService } from "./outbox-drain.service";
import { OUTBOX_QUEUE_NAME } from "./outbox.constants";

/**
 * Single-worker BullMQ processor. Concurrency is pinned to 1 so the
 * outbox preserves natural per-aggregate ordering (ADR 0009). Multi-worker
 * + aggregate_id partitioning is a scale concern parked for A4+.
 */
@Processor(OUTBOX_QUEUE_NAME, { concurrency: 1 })
export class OutboxWorker extends WorkerHost {
  constructor(private readonly drain: OutboxDrainService) {
    super();
  }

  async process(): Promise<{ drained: number }> {
    const drained = await this.drain.drainOnce();
    return { drained };
  }
}
