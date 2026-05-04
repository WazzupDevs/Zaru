import { Inject, Injectable } from "@nestjs/common";

import { TX_RUNNER_PORT, type TxRunnerPort } from "../../../../common/persistence/tx-runner.port";
import { RuleEvaluator } from "../../domain/services/rule-evaluator.service";
import {
  PRICING_RULE_REPOSITORY_PORT,
  type PricingRuleRepositoryPort,
} from "../ports/pricing-rule.repository.port";

import type { PricingRuleEntity } from "../../domain/entities/pricing-types";

export interface ListActiveRulesInput {
  categoryId: string;
  vehicleTypeId: string;
  /** Defaults to clock.now()-ish (today) when not provided. */
  eventStartAt?: Date;
}

/**
 * Public listing — used by the customer UI to render addon checkboxes
 * before they request a quote. Returns ADDON rules only (multipliers are
 * applied automatically; the customer doesn't pick them).
 */
@Injectable()
export class ListActiveRulesUseCase {
  constructor(
    @Inject(PRICING_RULE_REPOSITORY_PORT)
    private readonly ruleRepo: PricingRuleRepositoryPort,
    @Inject(TX_RUNNER_PORT) private readonly tx: TxRunnerPort,
    private readonly evaluator: RuleEvaluator,
  ) {}

  async execute(input: ListActiveRulesInput): Promise<PricingRuleEntity[]> {
    const allRules = await this.tx.run((tx) => this.ruleRepo.findActive(tx));
    const applicable = this.evaluator.filterApplicable(allRules, {
      eventStartAt: input.eventStartAt ?? new Date(),
      categoryId: input.categoryId,
      vehicleTypeId: input.vehicleTypeId,
    });
    return applicable.filter((r) => r.type === "ADDON");
  }
}
