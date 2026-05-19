import { Processor, WorkerHost } from "@nestjs/bullmq";

import { BOOKING_DISPATCH_QUEUE_NAME } from "./booking-dispatch.constants";
import { BookingDispatchService } from "./booking-dispatch.service";

@Processor(BOOKING_DISPATCH_QUEUE_NAME, { concurrency: 1 })
export class BookingDispatchWorker extends WorkerHost {
  constructor(private readonly service: BookingDispatchService) {
    super();
  }

  async process(): Promise<{
    expired: number;
    attempted: number;
    succeeded: number;
    failed: number;
    cooldownsCleared: number;
  }> {
    return this.service.sweep();
  }
}
