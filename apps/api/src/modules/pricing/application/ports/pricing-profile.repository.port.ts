import type { TxClient } from "../../../../common/persistence/tx-client";
import type { PricingProfileEntity } from "../../domain/entities/pricing-types";

export const PRICING_PROFILE_REPOSITORY_PORT = Symbol("PRICING_PROFILE_REPOSITORY_PORT");

export interface UpsertPricingProfileInput {
  vehicleTypeId: string;
  currency?: string | undefined;
  baseFee: string;
  perKmFee: string;
  perHourFee: string;
  minimumHours: number;
  includedKm: number;
  isActive?: boolean | undefined;
}

export interface PricingProfileRepositoryPort {
  findActiveByVehicleType(
    tx: TxClient,
    vehicleTypeId: string,
  ): Promise<PricingProfileEntity | null>;
  list(tx: TxClient): Promise<PricingProfileEntity[]>;
  upsert(tx: TxClient, input: UpsertPricingProfileInput): Promise<PricingProfileEntity>;
}
