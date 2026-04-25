import { z } from "zod";

import { UuidSchema } from "../common/uuid.js";

export const AvailabilityTypeSchema = z.enum(["BLOCKED", "BOOKED"]);
export type AvailabilityType = z.infer<typeof AvailabilityTypeSchema>;

export const BlockAvailabilityInputSchema = z
  .object({
    startAt: z.string().datetime({ offset: true }),
    endAt: z.string().datetime({ offset: true }),
    reason: z.string().min(1).max(200).optional(),
  })
  .refine((v) => new Date(v.endAt).getTime() > new Date(v.startAt).getTime(), {
    message: "endAt must be strictly after startAt",
    path: ["endAt"],
  });
export type BlockAvailabilityInput = z.infer<typeof BlockAvailabilityInputSchema>;

export const AvailabilityResponseSchema = z.object({
  id: UuidSchema,
  vehicleId: UuidSchema,
  driverProfileId: UuidSchema,
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  type: AvailabilityTypeSchema,
  bookingId: UuidSchema.nullable(),
  reason: z.string().nullable(),
  createdAt: z.string().datetime(),
});
export type AvailabilityResponse = z.infer<typeof AvailabilityResponseSchema>;

export const ListAvailabilityQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});
export type ListAvailabilityQuery = z.infer<typeof ListAvailabilityQuerySchema>;

export const CheckVehicleFreeQuerySchema = z
  .object({
    startAt: z.string().datetime({ offset: true }),
    endAt: z.string().datetime({ offset: true }),
  })
  .refine((v) => new Date(v.endAt).getTime() > new Date(v.startAt).getTime(), {
    message: "endAt must be strictly after startAt",
    path: ["endAt"],
  });
export type CheckVehicleFreeQuery = z.infer<typeof CheckVehicleFreeQuerySchema>;

export const ConflictItemSchema = z.object({
  id: UuidSchema,
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  type: AvailabilityTypeSchema,
});
export type ConflictItem = z.infer<typeof ConflictItemSchema>;

export const CheckVehicleFreeResponseSchema = z.object({
  free: z.boolean(),
  conflicts: z.array(ConflictItemSchema),
});
export type CheckVehicleFreeResponse = z.infer<typeof CheckVehicleFreeResponseSchema>;
