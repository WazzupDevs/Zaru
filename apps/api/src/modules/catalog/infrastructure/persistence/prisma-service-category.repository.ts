import { Injectable } from "@nestjs/common";

import type {
  AttributeDataType,
  AttributeScope,
  ServiceCategoryType,
} from "@event-fleet/shared-types";

import { PrismaService } from "../../../../common/prisma/prisma.service";

import type {
  AttributeDefinitionRecord,
  ServiceCategoryDetail,
  ServiceCategoryRecord,
  ServiceCategoryRepositoryPort,
  VehicleTypeRecord,
} from "../../application/ports/service-category.repository.port";
import type { Prisma } from "@prisma/client";

@Injectable()
export class PrismaServiceCategoryRepository implements ServiceCategoryRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async listActive(): Promise<ServiceCategoryRecord[]> {
    const rows = await this.prisma.client.serviceCategory.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    return rows.map(toCategoryRecord);
  }

  async findActiveBySlug(slug: string): Promise<ServiceCategoryDetail | null> {
    const row = await this.prisma.client.serviceCategory.findFirst({
      where: { slug, isActive: true },
      include: {
        vehicleTypes: {
          where: { isActive: true },
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        },
        attributeDefs: {
          orderBy: [{ scope: "asc" }, { sortOrder: "asc" }, { key: "asc" }],
        },
      },
    });
    if (!row) return null;
    return {
      ...toCategoryRecord(row),
      vehicleTypes: row.vehicleTypes.map(toVehicleTypeRecord),
      attributeDefinitions: row.attributeDefs.map(toAttributeDefRecord),
    };
  }

  async listVehicleTypes(categoryId: string): Promise<VehicleTypeRecord[]> {
    const rows = await this.prisma.client.vehicleType.findMany({
      where: { categoryId, isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    return rows.map(toVehicleTypeRecord);
  }
}

interface CategoryRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  type: string;
  iconUrl: string | null;
  isActive: boolean;
  sortOrder: number;
}

function toCategoryRecord(row: CategoryRow): ServiceCategoryRecord {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    type: row.type as ServiceCategoryType,
    iconUrl: row.iconUrl,
    isActive: row.isActive,
    sortOrder: row.sortOrder,
  };
}

interface VehicleTypeRow {
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

function toVehicleTypeRecord(row: VehicleTypeRow): VehicleTypeRecord {
  return {
    id: row.id,
    categoryId: row.categoryId,
    slug: row.slug,
    name: row.name,
    description: row.description,
    capacityMin: row.capacityMin,
    capacityMax: row.capacityMax,
    isActive: row.isActive,
    sortOrder: row.sortOrder,
  };
}

interface AttributeDefRow {
  id: string;
  categoryId: string;
  key: string;
  label: string;
  dataType: string;
  scope: string;
  isRequired: boolean;
  enumOptions: Prisma.JsonValue;
  validationRules: Prisma.JsonValue;
  sortOrder: number;
}

function toAttributeDefRecord(row: AttributeDefRow): AttributeDefinitionRecord {
  return {
    id: row.id,
    categoryId: row.categoryId,
    key: row.key,
    label: row.label,
    dataType: row.dataType as AttributeDataType,
    scope: row.scope as AttributeScope,
    isRequired: row.isRequired,
    enumOptions: row.enumOptions === null ? null : (row.enumOptions as string[]),
    validationRules:
      row.validationRules === null ? null : (row.validationRules as Record<string, unknown>),
    sortOrder: row.sortOrder,
  };
}
