import { z } from "zod";

import { UuidSchema } from "../common/uuid.js";

// =====================================================================
// PriceQuote
// =====================================================================

export const PricingRuleTypeSchema = z.enum([
  "SEASONAL_MULTIPLIER",
  "DAY_OF_WEEK_MULTIPLIER",
  "ADDON",
]);
export type PricingRuleType = z.infer<typeof PricingRuleTypeSchema>;

export const PriceQuoteStatusSchema = z.enum(["ACTIVE", "EXPIRED", "CONSUMED"]);
export type PriceQuoteStatus = z.infer<typeof PriceQuoteStatusSchema>;

const LatSchema = z.coerce.number().min(-90).max(90);
const LngSchema = z.coerce.number().min(-180).max(180);

export const RequestPriceQuoteInputSchema = z.object({
  vehicleTypeId: UuidSchema,
  categoryId: UuidSchema,
  pickupLat: LatSchema,
  pickupLng: LngSchema,
  pickupAddress: z.string().min(1).max(500),
  dropoffLat: LatSchema,
  dropoffLng: LngSchema,
  dropoffAddress: z.string().min(1).max(500),
  eventStartAt: z.string().datetime(),
  eventEndAt: z.string().datetime(),
  selectedAddonIds: z.array(UuidSchema).default([]),
});
export type RequestPriceQuoteInput = z.infer<typeof RequestPriceQuoteInputSchema>;

const MoneyJsonSchema = z.object({
  amount: z.string(),
  currency: z.string(),
});

const PriceBreakdownJsonSchema = z.object({
  baseFee: MoneyJsonSchema,
  distanceFee: MoneyJsonSchema,
  hourlyFee: MoneyJsonSchema,
  subtotal: MoneyJsonSchema,
  multipliers: z.array(
    z.object({
      ruleId: UuidSchema,
      name: z.string(),
      multiplier: z.string(),
      appliedTo: z.literal("subtotal"),
    }),
  ),
  addons: z.array(
    z.object({
      ruleId: UuidSchema,
      name: z.string(),
      amount: MoneyJsonSchema,
    }),
  ),
  totalAmount: MoneyJsonSchema,
});

export const PriceQuoteResponseSchema = z.object({
  id: UuidSchema,
  vehicleTypeId: UuidSchema,
  categoryId: UuidSchema,
  pickupAddress: z.string(),
  dropoffAddress: z.string(),
  distanceKm: z.string(),
  durationMinutes: z.number().int(),
  eventStartAt: z.string().datetime(),
  eventEndAt: z.string().datetime(),
  durationHours: z.string(),
  breakdown: PriceBreakdownJsonSchema,
  totalAmount: z.string(),
  currency: z.string(),
  selectedAddons: z.array(UuidSchema),
  status: PriceQuoteStatusSchema,
  expiresAt: z.string().datetime(),
  createdAt: z.string().datetime(),
});
export type PriceQuoteResponse = z.infer<typeof PriceQuoteResponseSchema>;

export const ListActiveAddonRulesQuerySchema = z.object({
  categoryId: UuidSchema,
  vehicleTypeId: UuidSchema,
  eventStartAt: z.string().datetime().optional(),
});
export type ListActiveAddonRulesQuery = z.infer<typeof ListActiveAddonRulesQuerySchema>;

// =====================================================================
// Admin: PricingProfile + PricingRule
// =====================================================================

export const UpsertPricingProfileInputSchema = z.object({
  vehicleTypeId: UuidSchema,
  currency: z.string().min(3).max(3).default("TRY"),
  baseFee: z.string().regex(/^\d+(\.\d{1,2})?$/),
  perKmFee: z.string().regex(/^\d+(\.\d{1,2})?$/),
  perHourFee: z.string().regex(/^\d+(\.\d{1,2})?$/),
  minimumHours: z.number().int().min(1).max(48),
  includedKm: z.number().int().min(0).max(10_000),
  isActive: z.boolean().optional(),
});
export type UpsertPricingProfileInput = z.infer<typeof UpsertPricingProfileInputSchema>;

export const PricingProfileResponseSchema = z.object({
  id: UuidSchema,
  vehicleTypeId: UuidSchema,
  currency: z.string(),
  baseFee: z.string(),
  perKmFee: z.string(),
  perHourFee: z.string(),
  minimumHours: z.number().int(),
  includedKm: z.number().int(),
  isActive: z.boolean(),
});
export type PricingProfileResponse = z.infer<typeof PricingProfileResponseSchema>;

export const CreatePricingRuleInputSchema = z
  .object({
    type: PricingRuleTypeSchema,
    categoryId: UuidSchema.optional(),
    vehicleTypeId: UuidSchema.optional(),
    name: z.string().min(1).max(100),
    description: z.string().max(500).optional(),
    validFrom: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    validTo: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    daysOfWeek: z.number().int().min(0).max(127).optional(),
    multiplier: z
      .string()
      .regex(/^\d+(\.\d{1,2})?$/)
      .optional(),
    fixedAmount: z
      .string()
      .regex(/^\d+(\.\d{1,2})?$/)
      .optional(),
    isOptional: z.boolean().optional(),
    sortOrder: z.number().int().min(0).optional(),
  })
  .refine(
    (v) =>
      v.type !== "SEASONAL_MULTIPLIER" || (v.multiplier !== undefined && v.validFrom !== undefined),
    { message: "SEASONAL_MULTIPLIER requires multiplier and validFrom", path: ["multiplier"] },
  )
  .refine(
    (v) =>
      v.type !== "DAY_OF_WEEK_MULTIPLIER" ||
      (v.multiplier !== undefined && v.daysOfWeek !== undefined),
    {
      message: "DAY_OF_WEEK_MULTIPLIER requires multiplier and daysOfWeek",
      path: ["multiplier"],
    },
  )
  .refine((v) => v.type !== "ADDON" || v.fixedAmount !== undefined, {
    message: "ADDON requires fixedAmount",
    path: ["fixedAmount"],
  });
export type CreatePricingRuleInput = z.infer<typeof CreatePricingRuleInputSchema>;

export const PricingRuleResponseSchema = z.object({
  id: UuidSchema,
  type: PricingRuleTypeSchema,
  categoryId: UuidSchema.nullable(),
  vehicleTypeId: UuidSchema.nullable(),
  name: z.string(),
  description: z.string().nullable(),
  validFrom: z.string().nullable(),
  validTo: z.string().nullable(),
  daysOfWeek: z.number().int().nullable(),
  multiplier: z.string().nullable(),
  fixedAmount: z.string().nullable(),
  isOptional: z.boolean(),
  sortOrder: z.number().int(),
  isActive: z.boolean(),
});
export type PricingRuleResponse = z.infer<typeof PricingRuleResponseSchema>;
