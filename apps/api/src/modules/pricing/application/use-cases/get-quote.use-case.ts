import { Inject, Injectable } from "@nestjs/common";

import { CLOCK_PORT, type ClockPort } from "../../../../common/clock/clock.port";
import { ForbiddenError } from "../../../../common/errors/domain-error";
import { TX_RUNNER_PORT, type TxRunnerPort } from "../../../../common/persistence/tx-runner.port";
import {
  QuoteAlreadyConsumedError,
  QuoteExpiredError,
  QuoteNotFoundError,
} from "../../domain/errors/pricing-errors";
import {
  PRICE_QUOTE_REPOSITORY_PORT,
  type PriceQuoteEntity,
  type PriceQuoteRepositoryPort,
} from "../ports/price-quote.repository.port";

@Injectable()
export class GetQuoteUseCase {
  constructor(
    @Inject(PRICE_QUOTE_REPOSITORY_PORT)
    private readonly quoteRepo: PriceQuoteRepositoryPort,
    @Inject(TX_RUNNER_PORT) private readonly tx: TxRunnerPort,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
  ) {}

  async execute(quoteId: string, actor: { userId: string }): Promise<PriceQuoteEntity> {
    const quote = await this.tx.run((tx) => this.quoteRepo.findById(tx, quoteId));
    if (!quote) throw new QuoteNotFoundError();
    if (quote.requestedByUserId !== actor.userId) {
      throw new ForbiddenError("Cannot read another user's quote.");
    }
    if (quote.status === "CONSUMED") throw new QuoteAlreadyConsumedError();
    const now = this.clock.now();
    if (quote.status === "EXPIRED" || quote.expiresAt.getTime() <= now.getTime()) {
      throw new QuoteExpiredError();
    }
    return quote;
  }
}
