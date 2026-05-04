import { z } from "zod";

import { UuidSchema } from "../common/uuid.js";

export const BookingStatusSchema = z.enum([
  "DRAFT",
  "CONFIRMED",
  "DRIVER_ASSIGNED",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED_BY_CUSTOMER",
  "CANCELLED_BY_DRIVER",
  "EXPIRED",
  "DISPUTED",
]);
export type BookingStatus = z.infer<typeof BookingStatusSchema>;

export const ConfirmBookingInputSchema = z.object({
  quoteId: UuidSchema,
});
export type ConfirmBookingInput = z.infer<typeof ConfirmBookingInputSchema>;

export const CancelBookingInputSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});
export type CancelBookingInput = z.infer<typeof CancelBookingInputSchema>;

export const ListMyBookingsQuerySchema = z.object({
  status: BookingStatusSchema.optional(),
  cursor: UuidSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});
export type ListMyBookingsQuery = z.infer<typeof ListMyBookingsQuerySchema>;

export const BookingResponseSchema = z.object({
  id: UuidSchema,
  customerId: UuidSchema,
  priceQuoteId: UuidSchema,
  status: BookingStatusSchema,
  vehicleTypeId: UuidSchema,
  categoryId: UuidSchema,
  pickupAddress: z.string(),
  dropoffAddress: z.string(),
  eventStartAt: z.string().datetime(),
  eventEndAt: z.string().datetime(),
  totalAmount: z.string(),
  currency: z.string(),
  confirmedAt: z.string().datetime().nullable(),
  driverAssignedAt: z.string().datetime().nullable(),
  startedAt: z.string().datetime().nullable(),
  completedAt: z.string().datetime().nullable(),
  cancelledAt: z.string().datetime().nullable(),
  expiredAt: z.string().datetime().nullable(),
  cancellationReason: z.string().nullable(),
  driverId: UuidSchema.nullable(),
  vehicleId: UuidSchema.nullable(),
  version: z.number().int(),
  createdAt: z.string().datetime(),
});
export type BookingResponse = z.infer<typeof BookingResponseSchema>;
