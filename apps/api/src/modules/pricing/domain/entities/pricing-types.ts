/**
 * Domain-shaped read models for the pricing module. Repositories return
 * these (not raw Prisma rows) so the calculator stays pure / testable.
 */
import type { PricingRuleType } from "@prisma/client";

export interface PricingProfileEntity {
  id: string;
  vehicleTypeId: string;
  currency: string;
  baseFee: string;
  perKmFee: string;
  perHourFee: string;
  minimumHours: number;
  includedKm: number;
  isActive: boolean;
}

export interface PricingRuleEntity {
  id: string;
  type: PricingRuleType;
  categoryId: string | null;
  vehicleTypeId: string | null;
  name: string;
  description: string | null;
  validFrom: Date | null;
  validTo: Date | null;
  daysOfWeek: number | null;
  multiplier: string | null;
  fixedAmount: string | null;
  isOptional: boolean;
  sortOrder: number;
  isActive: boolean;
}
