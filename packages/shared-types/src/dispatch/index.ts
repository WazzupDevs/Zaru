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
