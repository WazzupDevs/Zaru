import { Processor, WorkerHost } from "@nestjs/bullmq";

import { BOOKING_EXPIRY_QUEUE_NAME } from "./booking-expiry.constants";
import { BookingExpiryService } from "./booking-expiry.service";

@Processor(BOOKING_EXPIRY_QUEUE_NAME, { concurrency: 1 })
export class BookingExpiryWorker extends WorkerHost {
  constructor(private readonly service: BookingExpiryService) {
    super();
  }

  async process(): Promise<{ expired: number }> {
    return this.service.sweep();
  }
}
