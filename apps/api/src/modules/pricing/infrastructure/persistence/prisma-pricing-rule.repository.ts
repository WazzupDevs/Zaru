import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";

import type { TxClient } from "../../../../common/persistence/tx-client";
import type {
  CreatePricingRuleInput,
  ListPricingRulesFilter,
  PricingRuleRepositoryPort,
} from "../../application/ports/pricing-rule.repository.port";
import type { PricingRuleEntity } from "../../domain/entities/pricing-types";

@Injectable()
export class PrismaPricingRuleRepository implements PricingRuleRepositoryPort {
  async findActive(tx: TxClient): Promise<PricingRuleEntity[]> {
    const rows = await tx.pricingRule.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
    return rows.map(toEntity);
  }

  async findById(tx: TxClient, id: string): Promise<PricingRuleEntity | null> {
    const row = await tx.pricingRule.findUnique({ where: { id } });
    return row ? toEntity(row) : null;
  }

  async list(tx: TxClient, filter: ListPricingRulesFilter): Promise<PricingRuleEntity[]> {
    const rows = await tx.pricingRule.findMany({
      where: {
        ...(filter.type !== undefined ? { type: filter.type } : {}),
        ...(filter.isActive !== undefined ? { isActive: filter.isActive } : {}),
        ...(filter.categoryId !== undefined ? { categoryId: filter.categoryId } : {}),
        ...(filter.vehicleTypeId !== undefined ? { vehicleTypeId: filter.vehicleTypeId } : {}),
      },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
    return rows.map(toEntity);
  }

  async create(tx: TxClient, input: CreatePricingRuleInput): Promise<PricingRuleEntity> {
    const row = await tx.pricingRule.create({
      data: {
        type: input.type,
        ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
        ...(input.vehicleTypeId !== undefined ? { vehicleTypeId: input.vehicleTypeId } : {}),
        name: input.name,
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.validFrom !== undefined ? { validFrom: input.validFrom } : {}),
        ...(input.validTo !== undefined ? { validTo: input.validTo } : {}),
        ...(input.daysOfWeek !== undefined ? { daysOfWeek: input.daysOfWeek } : {}),
        ...(input.multiplier !== undefined
          ? { multiplier: new Prisma.Decimal(input.multiplier) }
          : {}),
        ...(input.fixedAmount !== undefined
          ? { fixedAmount: new Prisma.Decimal(input.fixedAmount) }
          : {}),
        ...(input.isOptional !== undefined ? { isOptional: input.isOptional } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      },
    });
    return toEntity(row);
  }

  async deactivate(tx: TxClient, id: string): Promise<PricingRuleEntity> {
    const row = await tx.pricingRule.update({
      where: { id },
      data: { isActive: false, version: { increment: 1 } },
    });
    return toEntity(row);
  }
}

function toEntity(
  row: Awaited<ReturnType<TxClient["pricingRule"]["findFirstOrThrow"]>>,
): PricingRuleEntity {
  return {
    id: row.id,
    type: row.type,
    categoryId: row.categoryId,
    vehicleTypeId: row.vehicleTypeId,
    name: row.name,
    description: row.description,
    validFrom: row.validFrom,
    validTo: row.validTo,
    daysOfWeek: row.daysOfWeek,
    multiplier: row.multiplier !== null ? row.multiplier.toFixed(2) : null,
    fixedAmount: row.fixedAmount !== null ? row.fixedAmount.toFixed(2) : null,
    isOptional: row.isOptional,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
  };
}
