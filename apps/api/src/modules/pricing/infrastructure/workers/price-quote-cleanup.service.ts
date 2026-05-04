import { Inject, Injectable } from "@nestjs/common";
import { InjectPinoLogger, PinoLogger } from "nestjs-pino";

import { CLOCK_PORT, type ClockPort } from "../../../../common/clock/clock.port";
import {
  OUTBOX_WRITER_PORT,
  type OutboxWriterPort,
} from "../../../../common/persistence/outbox-writer.port";
import { TX_RUNNER_PORT, type TxRunnerPort } from "../../../../common/persistence/tx-runner.port";
import {
  PRICE_QUOTE_REPOSITORY_PORT,
  type PriceQuoteRepositoryPort,
} from "../../application/ports/price-quote.repository.port";

const PRICE_QUOTE_EXPIRED_EVENT_TYPE = "pricing.PriceQuoteExpired";

/**
 * Sweeps ACTIVE PriceQuote rows whose expiresAt is past now and flips
 * them to EXPIRED, emitting one outbox event per row. Idempotent.
 */
@Injectable()
export class PriceQuoteCleanupService {
  constructor(
    @Inject(PRICE_QUOTE_REPOSITORY_PORT)
    private readonly repo: PriceQuoteRepositoryPort,
    @Inject(TX_RUNNER_PORT) private readonly tx: TxRunnerPort,
    @Inject(OUTBOX_WRITER_PORT) private readonly outbox: OutboxWriterPort,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
    @InjectPinoLogger(PriceQuoteCleanupService.name)
    private readonly logger: PinoLogger,
  ) {}

  async sweep(): Promise<{ expired: number }> {
    const now = this.clock.now();
    const expired = await this.tx.run(async (tx) => {
      const rows = await this.repo.expireOlderThan(tx, now);
      for (const quote of rows) {
        await this.outbox.write(tx, {
          aggregateType: "PriceQuote",
          aggregateId: quote.id,
          eventType: PRICE_QUOTE_EXPIRED_EVENT_TYPE,
          payload: {
            quoteId: quote.id,
            expiredAt: now.toISOString(),
          },
        });
      }
      return rows;
    });
    if (expired.length > 0) {
      this.logger.info({ expired: expired.length }, "price quotes expired");
    }
    return { expired: expired.length };
  }
}
