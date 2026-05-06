import { z } from "zod";

import {
  CategoryAttributeDefinitionSchema,
  ServiceCategorySchema,
  VehicleTypeSchema,
  type CategoryAttributeDefinition,
  type ServiceCategory,
  type VehicleType,
} from "@event-fleet/shared-types";

import type { ApiClient } from "./client";

/**
 * Catalog API — read-only, public (anonymous), no auth required.
 *
 * Why parse with Zod here when A4d-1's auth.ts skipped it?
 * A4d-1 mirrored auth shapes as plain TS interfaces "to keep Zod out of
 * the bundle". A4d-2 already pulls @event-fleet/shared-types runtime in
 * for pricing + booking parsing (the API surface is large enough that
 * runtime drift is the bigger risk than the ~10–15 KB gzipped Zod cost).
 * Once shared-types is in the runtime tree we may as well validate
 * everywhere.
 *
 * The shared-types `ServiceCategoryDetailSchema` declares vehicleTypes
 * and attributeDefinitions as `z.array(z.unknown())` — fine for the API
 * boundary on the server, not strict enough for the consumer. We compose
 * a stricter schema here using the per-item schemas as the source of
 * truth so any drift in either shape surfaces here at first parse.
 */
const ServiceCategoryDetailStrictSchema = ServiceCategorySchema.extend({
  vehicleTypes: z.array(VehicleTypeSchema),
  attributeDefinitions: z.array(CategoryAttributeDefinitionSchema),
});

export type ServiceCategoryDetail = z.infer<typeof ServiceCategoryDetailStrictSchema>;

export type { ServiceCategory, VehicleType, CategoryAttributeDefinition };

export function createCatalogApi(client: ApiClient) {
  return {
    listCategories(): Promise<ServiceCategory[]> {
      return client
        .request<unknown>("/catalog/categories", { method: "GET", anonymous: true })
        .then((data) => z.array(ServiceCategorySchema).parse(data));
    },

    getCategoryBySlug(slug: string): Promise<ServiceCategoryDetail> {
      return client
        .request<unknown>(`/catalog/categories/${encodeURIComponent(slug)}`, {
          method: "GET",
          anonymous: true,
        })
        .then((data) => ServiceCategoryDetailStrictSchema.parse(data));
    },

    listVehicleTypes(slug: string): Promise<VehicleType[]> {
      return client
        .request<unknown>(`/catalog/categories/${encodeURIComponent(slug)}/vehicle-types`, {
          method: "GET",
          anonymous: true,
        })
        .then((data) => z.array(VehicleTypeSchema).parse(data));
    },
  };
}

export type CatalogApi = ReturnType<typeof createCatalogApi>;
