import type { TxClient } from "../../../../common/persistence/tx-client";
import type { PricingRuleEntity } from "../../domain/entities/pricing-types";
import type { PricingRuleType } from "@prisma/client";

export const PRICING_RULE_REPOSITORY_PORT = Symbol("PRICING_RULE_REPOSITORY_PORT");

export interface CreatePricingRuleInput {
  type: PricingRuleType;
  categoryId?: string | undefined;
  vehicleTypeId?: string | undefined;
  name: string;
  description?: string | undefined;
  validFrom?: Date | undefined;
  validTo?: Date | undefined;
  daysOfWeek?: number | undefined;
  multiplier?: string | undefined;
  fixedAmount?: string | undefined;
  isOptional?: boolean;
  sortOrder?: number;
}

export interface ListPricingRulesFilter {
  type?: PricingRuleType;
  isActive?: boolean;
  categoryId?: string;
  vehicleTypeId?: string;
}

export interface PricingRuleRepositoryPort {
  findActive(tx: TxClient): Promise<PricingRuleEntity[]>;
  findById(tx: TxClient, id: string): Promise<PricingRuleEntity | null>;
  list(tx: TxClient, filter: ListPricingRulesFilter): Promise<PricingRuleEntity[]>;
  create(tx: TxClient, input: CreatePricingRuleInput): Promise<PricingRuleEntity>;
  deactivate(tx: TxClient, id: string): Promise<PricingRuleEntity>;
}
