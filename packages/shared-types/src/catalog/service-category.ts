import { z } from "zod";

import { UuidSchema } from "../common/uuid.js";

export const ServiceCategoryTypeSchema = z.enum([
  "PLANNED_EVENT",
  "ON_DEMAND_DISPATCH",
  "SCHEDULED_TRANSPORT",
]);
export type ServiceCategoryType = z.infer<typeof ServiceCategoryTypeSchema>;

export const SlugSchema = z
  .string()
  .min(2)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase kebab-case");
export type Slug = z.infer<typeof SlugSchema>;

export const ServiceCategorySchema = z.object({
  id: UuidSchema,
  slug: SlugSchema,
  name: z.string().min(1),
  description: z.string().nullable(),
  type: ServiceCategoryTypeSchema,
  iconUrl: z.string().url().nullable(),
  isActive: z.boolean(),
  sortOrder: z.number().int(),
});
export type ServiceCategory = z.infer<typeof ServiceCategorySchema>;
