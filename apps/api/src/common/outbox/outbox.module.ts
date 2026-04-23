import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";

import { OutboxDrainService } from "./outbox-drain.service";
import { OutboxScheduler } from "./outbox-scheduler.service";
import { OUTBOX_QUEUE_NAME } from "./outbox.constants";
import { OutboxWorker } from "./outbox.worker";

@Module({
  imports: [BullModule.registerQueue({ name: OUTBOX_QUEUE_NAME })],
  providers: [OutboxDrainService, OutboxWorker, OutboxScheduler],
  exports: [OutboxDrainService],
})
export class OutboxModule {}
