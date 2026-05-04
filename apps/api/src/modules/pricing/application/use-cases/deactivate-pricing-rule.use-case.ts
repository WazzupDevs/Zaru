import { Inject, Injectable } from "@nestjs/common";

import { CLOCK_PORT, type ClockPort } from "../../../../common/clock/clock.port";
import { NotFoundError } from "../../../../common/errors/domain-error";
import {
  OUTBOX_WRITER_PORT,
  type OutboxWriterPort,
} from "../../../../common/persistence/outbox-writer.port";
import { TX_RUNNER_PORT, type TxRunnerPort } from "../../../../common/persistence/tx-runner.port";
import {
  PRICING_RULE_REPOSITORY_PORT,
  type PricingRuleRepositoryPort,
} from "../ports/pricing-rule.repository.port";

import type { PricingRuleEntity } from "../../domain/entities/pricing-types";

const PRICING_RULE_DEACTIVATED_EVENT_TYPE = "pricing.PricingRuleDeactivated";

@Injectable()
export class DeactivatePricingRuleUseCase {
  constructor(
    @Inject(PRICING_RULE_REPOSITORY_PORT)
    private readonly repo: PricingRuleRepositoryPort,
    @Inject(TX_RUNNER_PORT) private readonly tx: TxRunnerPort,
    @Inject(OUTBOX_WRITER_PORT) private readonly outbox: OutboxWriterPort,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
  ) {}

  async execute(ruleId: string, admin: { userId: string }): Promise<PricingRuleEntity> {
    return this.tx.run(async (tx) => {
      const existing = await this.repo.findById(tx, ruleId);
      if (!existing) throw new NotFoundError(`Pricing rule ${ruleId} not found.`);
      const updated = await this.repo.deactivate(tx, ruleId);
      await this.outbox.write(tx, {
        aggregateType: "PricingRule",
        aggregateId: updated.id,
        eventType: PRICING_RULE_DEACTIVATED_EVENT_TYPE,
        payload: {
          ruleId: updated.id,
          deactivatedByUserId: admin.userId,
          deactivatedAt: this.clock.now().toISOString(),
        },
      });
      return updated;
    });
  }
}
