import { Processor, WorkerHost } from "@nestjs/bullmq";

import { PRICE_QUOTE_CLEANUP_QUEUE_NAME } from "./price-quote-cleanup.constants";
import { PriceQuoteCleanupService } from "./price-quote-cleanup.service";

@Processor(PRICE_QUOTE_CLEANUP_QUEUE_NAME, { concurrency: 1 })
export class PriceQuoteCleanupWorker extends WorkerHost {
  constructor(private readonly service: PriceQuoteCleanupService) {
    super();
  }

  async process(): Promise<{ expired: number }> {
    return this.service.sweep();
  }
}
