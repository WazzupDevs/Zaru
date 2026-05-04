import { Inject, Injectable } from "@nestjs/common";

import { CLOCK_PORT, type ClockPort } from "../../../../common/clock/clock.port";
import {
  OUTBOX_WRITER_PORT,
  type OutboxWriterPort,
} from "../../../../common/persistence/outbox-writer.port";
import { TX_RUNNER_PORT, type TxRunnerPort } from "../../../../common/persistence/tx-runner.port";
import {
  PRICING_RULE_REPOSITORY_PORT,
  type CreatePricingRuleInput,
  type PricingRuleRepositoryPort,
} from "../ports/pricing-rule.repository.port";

import type { PricingRuleEntity } from "../../domain/entities/pricing-types";

const PRICING_RULE_CREATED_EVENT_TYPE = "pricing.PricingRuleCreated";

@Injectable()
export class CreatePricingRuleUseCase {
  constructor(
    @Inject(PRICING_RULE_REPOSITORY_PORT)
    private readonly repo: PricingRuleRepositoryPort,
    @Inject(TX_RUNNER_PORT) private readonly tx: TxRunnerPort,
    @Inject(OUTBOX_WRITER_PORT) private readonly outbox: OutboxWriterPort,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
  ) {}

  async execute(
    input: CreatePricingRuleInput,
    admin: { userId: string },
  ): Promise<PricingRuleEntity> {
    return this.tx.run(async (tx) => {
      const rule = await this.repo.create(tx, input);
      await this.outbox.write(tx, {
        aggregateType: "PricingRule",
        aggregateId: rule.id,
        eventType: PRICING_RULE_CREATED_EVENT_TYPE,
        payload: {
          ruleId: rule.id,
          type: rule.type,
          name: rule.name,
          createdByUserId: admin.userId,
          createdAt: this.clock.now().toISOString(),
        },
      });
      return rule;
    });
  }
}
