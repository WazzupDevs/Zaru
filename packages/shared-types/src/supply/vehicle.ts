import { z } from "zod";

import { UuidSchema } from "../common/uuid.js";

export const VehicleStatusSchema = z.enum(["DRAFT", "PENDING_APPROVAL", "ACTIVE", "SUSPENDED"]);
export type VehicleStatus = z.infer<typeof VehicleStatusSchema>;

const CURRENT_YEAR = new Date().getUTCFullYear();

export const RegisterVehicleInputSchema = z.object({
  vehicleTypeId: UuidSchema,
  // Server normalizes via PlateVO (uppercase, no spaces).
  plateNumber: z.string().min(5).max(15),
  brand: z.string().min(1).max(50),
  model: z.string().min(1).max(50),
  year: z
    .number()
    .int()
    .min(1980)
    .max(CURRENT_YEAR + 1),
  color: z.string().min(1).max(30),
  // Polymorphic per-category attributes — validated against
  // CategoryAttributeDefinition rows on the server.
  attributes: z.record(z.unknown()),
});
export type RegisterVehicleInput = z.infer<typeof RegisterVehicleInputSchema>;

export const UpdateVehicleAttributesInputSchema = z.object({
  attributes: z.record(z.unknown()),
  /** Optimistic-lock guard. Reject if the persisted version differs. */
  expectedVersion: z.number().int().min(0),
});
export type UpdateVehicleAttributesInput = z.infer<typeof UpdateVehicleAttributesInputSchema>;

export const VehicleResponseSchema = z.object({
  id: UuidSchema,
  driverProfileId: UuidSchema,
  vehicleTypeId: UuidSchema,
  plateNumber: z.string(),
  brand: z.string(),
  model: z.string(),
  year: z.number().int(),
  color: z.string(),
  attributes: z.record(z.unknown()),
  photoKeys: z.array(z.string()),
  status: VehicleStatusSchema,
  version: z.number().int(),
  createdAt: z.string().datetime(),
});
export type VehicleResponse = z.infer<typeof VehicleResponseSchema>;
