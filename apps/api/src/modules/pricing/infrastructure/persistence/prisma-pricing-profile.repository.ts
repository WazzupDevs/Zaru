import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";

import type { TxClient } from "../../../../common/persistence/tx-client";
import type {
  PricingProfileRepositoryPort,
  UpsertPricingProfileInput,
} from "../../application/ports/pricing-profile.repository.port";
import type { PricingProfileEntity } from "../../domain/entities/pricing-types";

@Injectable()
export class PrismaPricingProfileRepository implements PricingProfileRepositoryPort {
  async findActiveByVehicleType(
    tx: TxClient,
    vehicleTypeId: string,
  ): Promise<PricingProfileEntity | null> {
    const row = await tx.pricingProfile.findFirst({
      where: { vehicleTypeId, isActive: true },
    });
    return row ? toEntity(row) : null;
  }

  async list(tx: TxClient): Promise<PricingProfileEntity[]> {
    const rows = await tx.pricingProfile.findMany({ orderBy: { createdAt: "desc" } });
    return rows.map(toEntity);
  }

  async upsert(tx: TxClient, input: UpsertPricingProfileInput): Promise<PricingProfileEntity> {
    const row = await tx.pricingProfile.upsert({
      where: { vehicleTypeId: input.vehicleTypeId },
      create: {
        vehicleTypeId: input.vehicleTypeId,
        currency: input.currency ?? "TRY",
        baseFee: new Prisma.Decimal(input.baseFee),
        perKmFee: new Prisma.Decimal(input.perKmFee),
        perHourFee: new Prisma.Decimal(input.perHourFee),
        minimumHours: input.minimumHours,
        includedKm: input.includedKm,
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
      update: {
        ...(input.currency !== undefined ? { currency: input.currency } : {}),
        baseFee: new Prisma.Decimal(input.baseFee),
        perKmFee: new Prisma.Decimal(input.perKmFee),
        perHourFee: new Prisma.Decimal(input.perHourFee),
        minimumHours: input.minimumHours,
        includedKm: input.includedKm,
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        version: { increment: 1 },
      },
    });
    return toEntity(row);
  }
}

function toEntity(
  row: Awaited<ReturnType<TxClient["pricingProfile"]["findFirstOrThrow"]>>,
): PricingProfileEntity {
  return {
    id: row.id,
    vehicleTypeId: row.vehicleTypeId,
    currency: row.currency,
    baseFee: row.baseFee.toFixed(2),
    perKmFee: row.perKmFee.toFixed(2),
    perHourFee: row.perHourFee.toFixed(2),
    minimumHours: row.minimumHours,
    includedKm: row.includedKm,
    isActive: row.isActive,
  };
}
