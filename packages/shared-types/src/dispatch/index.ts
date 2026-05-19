import { z } from "zod";

import { UuidSchema } from "../common/uuid.js";

export const UpdateDriverLocationInputSchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});
export type UpdateDriverLocationInput = z.infer<typeof UpdateDriverLocationInputSchema>;

export const SetDriverOnlineStatusInputSchema = z.object({
  isOnline: z.coerce.boolean(),
});
export type SetDriverOnlineStatusInput = z.infer<typeof SetDriverOnlineStatusInputSchema>;

export const ReassignDriverInputSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});
export type ReassignDriverInput = z.infer<typeof ReassignDriverInputSchema>;

export const DriverDispatchStatusResponseSchema = z.object({
  driverProfileId: UuidSchema,
  isOnline: z.boolean(),
  lastLocationUpdate: z.string().datetime().nullable(),
});
export type DriverDispatchStatusResponse = z.infer<typeof DriverDispatchStatusResponseSchema>;

// =====================================================================
// Driver offer schemas (A4f-2b-2). The driver mobile (A4f-2b-3) and
// admin tooling parse responses through these schemas; the controller
// uses the input schemas for body / query validation via ZodValidationPipe.
// =====================================================================

export const DriverOfferStatusSchema = z.enum([
  "PENDING",
  "ACCEPTED",
  "ON_THE_WAY",
  "ARRIVED",
  "IN_PROGRESS",
  "COMPLETED",
  "REJECTED",
  "EXPIRED",
  "CANCELLED",
]);
export type DriverOfferStatus = z.infer<typeof DriverOfferStatusSchema>;

export const DriverRejectReasonSchema = z.enum([
  "TOO_FAR",
  "TIME_CONFLICT",
  "VEHICLE_UNAVAILABLE",
  "OTHER",
]);
export type DriverRejectReason = z.infer<typeof DriverRejectReasonSchema>;

export const DriverOfferMoneySchema = z.object({
  amount: z.string(),
  currency: z.string(),
});
export type DriverOfferMoney = z.infer<typeof DriverOfferMoneySchema>;

export const DriverOfferDetailSchema = z.object({
  offerId: UuidSchema,
  bookingId: UuidSchema,
  status: DriverOfferStatusSchema,
  expiresAt: z.string().datetime(),
  acceptedAt: z.string().datetime().nullable(),
  rejectedAt: z.string().datetime().nullable(),
  onTheWayAt: z.string().datetime().nullable(),
  arrivedAt: z.string().datetime().nullable(),
  inProgressAt: z.string().datetime().nullable(),
  completedAt: z.string().datetime().nullable(),
  cancelledAt: z.string().datetime().nullable(),
  rejectReason: DriverRejectReasonSchema.nullable(),
  booking: z.object({
    pickupAddress: z.string(),
    dropoffAddress: z.string(),
    pickupLat: z.string(),
    pickupLng: z.string(),
    eventStartAt: z.string().datetime(),
    eventEndAt: z.string().datetime(),
    totalAmount: DriverOfferMoneySchema,
  }),
  vehicle: z
    .object({
      brand: z.string(),
      model: z.string(),
      plateNumber: z.string(),
    })
    .nullable(),
  customer: z.object({
    displayName: z.string().nullable(),
    /** "+90555***4567" — driver never sees full customer phone. */
    phoneMasked: z.string(),
  }),
  driverEarnings: DriverOfferMoneySchema,
});
export type DriverOfferDetail = z.infer<typeof DriverOfferDetailSchema>;

export const DriverOfferSummarySchema = z.object({
  offerId: UuidSchema,
  bookingId: UuidSchema,
  status: DriverOfferStatusSchema,
  createdAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
  eventStartAt: z.string().datetime().nullable(),
  pickupAddress: z.string(),
  driverEarnings: DriverOfferMoneySchema,
});
export type DriverOfferSummary = z.infer<typeof DriverOfferSummarySchema>;

export const RejectOfferInputSchema = z.object({
  reason: DriverRejectReasonSchema,
  note: z.string().max(500).optional(),
});
export type RejectOfferInput = z.infer<typeof RejectOfferInputSchema>;

export const UpdateOfferStatusInputSchema = z.object({
  status: z.enum(["ON_THE_WAY", "ARRIVED", "IN_PROGRESS", "COMPLETED"]),
});
export type UpdateOfferStatusInput = z.infer<typeof UpdateOfferStatusInputSchema>;

export const ListDriverOfferHistoryQuerySchema = z.object({
  status: z
    .union([DriverOfferStatusSchema, z.array(DriverOfferStatusSchema)])
    .optional()
    .transform((v) => (v === undefined ? undefined : Array.isArray(v) ? v : [v])),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});
export type ListDriverOfferHistoryQuery = z.infer<typeof ListDriverOfferHistoryQuerySchema>;
