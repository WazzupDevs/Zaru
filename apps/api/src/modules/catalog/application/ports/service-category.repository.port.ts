import type {
  AttributeDataType,
  AttributeScope,
  ServiceCategoryType,
} from "@event-fleet/shared-types";

export const SERVICE_CATEGORY_REPOSITORY_PORT = Symbol("SERVICE_CATEGORY_REPOSITORY_PORT");

export interface ServiceCategoryRecord {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  type: ServiceCategoryType;
  iconUrl: string | null;
  isActive: boolean;
  sortOrder: number;
}

export interface VehicleTypeRecord {
  id: string;
  categoryId: string;
  slug: string;
  name: string;
  description: string | null;
  capacityMin: number;
  capacityMax: number;
  isActive: boolean;
  sortOrder: number;
}

export interface AttributeDefinitionRecord {
  id: string;
  categoryId: string;
  key: string;
  label: string;
  dataType: AttributeDataType;
  scope: AttributeScope;
  isRequired: boolean;
  enumOptions: string[] | null;
  validationRules: Record<string, unknown> | null;
  sortOrder: number;
}

export interface ServiceCategoryDetail extends ServiceCategoryRecord {
  vehicleTypes: VehicleTypeRecord[];
  attributeDefinitions: AttributeDefinitionRecord[];
}

export interface ServiceCategoryRepositoryPort {
  /** Active categories sorted by sortOrder ASC, then name. */
  listActive(): Promise<ServiceCategoryRecord[]>;
  /** Single active category with nested vehicle types + attribute defs. */
  findActiveBySlug(slug: string): Promise<ServiceCategoryDetail | null>;
  /** Active vehicle types for a category. */
  listVehicleTypes(categoryId: string): Promise<VehicleTypeRecord[]>;
}
