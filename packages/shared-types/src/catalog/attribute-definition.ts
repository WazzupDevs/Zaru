import { z } from "zod";

import { UuidSchema } from "../common/uuid.js";

export const AttributeDataTypeSchema = z.enum(["STRING", "NUMBER", "BOOLEAN", "ENUM", "DATE"]);
export type AttributeDataType = z.infer<typeof AttributeDataTypeSchema>;

export const AttributeScopeSchema = z.enum(["VEHICLE", "BOOKING"]);
export type AttributeScope = z.infer<typeof AttributeScopeSchema>;

export const CategoryAttributeDefinitionSchema = z.object({
  id: UuidSchema,
  categoryId: UuidSchema,
  key: z.string().min(1),
  label: z.string().min(1),
  dataType: AttributeDataTypeSchema,
  scope: AttributeScopeSchema,
  isRequired: z.boolean(),
  enumOptions: z.array(z.string()).nullable(),
  validationRules: z.record(z.string(), z.unknown()).nullable(),
  sortOrder: z.number().int(),
});
export type CategoryAttributeDefinition = z.infer<typeof CategoryAttributeDefinitionSchema>;

/**
 * Detail view: a category with its full vehicle types + attribute defs.
 * GET /catalog/categories/:slug returns this shape.
 */
export const ServiceCategoryDetailSchema = z.object({
  id: UuidSchema,
  slug: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  type: z.string(),
  iconUrl: z.string().nullable(),
  vehicleTypes: z.array(z.unknown()),
  attributeDefinitions: z.array(z.unknown()),
});
export type ServiceCategoryDetail = z.infer<typeof ServiceCategoryDetailSchema>;
