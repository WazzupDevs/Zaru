import { z } from "zod";

import { SlugSchema } from "./service-category.js";
import { UuidSchema } from "../common/uuid.js";

export const VehicleTypeSchema = z.object({
  id: UuidSchema,
  categoryId: UuidSchema,
  slug: SlugSchema,
  name: z.string().min(1),
  description: z.string().nullable(),
  capacityMin: z.number().int().min(1),
  capacityMax: z.number().int().min(1),
  isActive: z.boolean(),
  sortOrder: z.number().int(),
});
export type VehicleType = z.infer<typeof VehicleTypeSchema>;
