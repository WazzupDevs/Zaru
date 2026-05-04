import type {
  PriceQuoteResponse,
  PricingProfileResponse,
  PricingRuleResponse,
} from "@event-fleet/shared-types";

import type { PriceQuoteEntity } from "../../application/ports/price-quote.repository.port";
import type { PricingProfileEntity, PricingRuleEntity } from "../../domain/entities/pricing-types";

export function toQuoteResponse(rec: PriceQuoteEntity): PriceQuoteResponse {
  return {
    id: rec.id,
    vehicleTypeId: rec.vehicleTypeId,
    categoryId: rec.categoryId,
    pickupAddress: rec.pickupAddress,
    dropoffAddress: rec.dropoffAddress,
    distanceKm: rec.distanceKm,
    durationMinutes: rec.durationMinutes,
    eventStartAt: rec.eventStartAt.toISOString(),
    eventEndAt: rec.eventEndAt.toISOString(),
    durationHours: rec.durationHours,
    breakdown: rec.breakdown,
    totalAmount: rec.totalAmount,
    currency: rec.currency,
    selectedAddons: rec.selectedAddons,
    status: rec.status,
    expiresAt: rec.expiresAt.toISOString(),
    createdAt: rec.createdAt.toISOString(),
  };
}

export function toProfileResponse(rec: PricingProfileEntity): PricingProfileResponse {
  return {
    id: rec.id,
    vehicleTypeId: rec.vehicleTypeId,
    currency: rec.currency,
    baseFee: rec.baseFee,
    perKmFee: rec.perKmFee,
    perHourFee: rec.perHourFee,
    minimumHours: rec.minimumHours,
    includedKm: rec.includedKm,
    isActive: rec.isActive,
  };
}

export function toRuleResponse(rec: PricingRuleEntity): PricingRuleResponse {
  return {
    id: rec.id,
    type: rec.type,
    categoryId: rec.categoryId,
    vehicleTypeId: rec.vehicleTypeId,
    name: rec.name,
    description: rec.description,
    validFrom: rec.validFrom ? rec.validFrom.toISOString().slice(0, 10) : null,
    validTo: rec.validTo ? rec.validTo.toISOString().slice(0, 10) : null,
    daysOfWeek: rec.daysOfWeek,
    multiplier: rec.multiplier,
    fixedAmount: rec.fixedAmount,
    isOptional: rec.isOptional,
    sortOrder: rec.sortOrder,
    isActive: rec.isActive,
  };
}
