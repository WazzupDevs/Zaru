import type { PrismaClient } from "@prisma/client";

/**
 * Minimal catalog data for tests that need a vehicle type. Idempotent — safe
 * to call from `beforeAll` even when an earlier suite already inserted these
 * rows. Uses upsert by the unique slug (or `categoryId_slug`) keys so
 * cross-suite ordering doesn't matter.
 *
 * The full `prisma/seed.ts` is overkill for tests — it bootstraps an admin
 * user the lifecycle e2e creates by hand. We mirror just the wedding-car
 * shape (1 category + 1 vehicle type + 3 VEHICLE-scope attribute defs)
 * so RegisterVehicleUseCase's strict attribute validator accepts the
 * sample payload `{ trim_color, has_air_conditioning, has_chauffeur }`.
 */
export async function setupCatalogFixtures(prisma: PrismaClient): Promise<{
  categoryId: string;
  vehicleTypeId: string;
}> {
  const category = await prisma.serviceCategory.upsert({
    where: { slug: "wedding-car" },
    create: {
      slug: "wedding-car",
      name: "Düğün Arabası",
      type: "PLANNED_EVENT",
      sortOrder: 1,
    },
    update: {},
  });

  const vehicleType = await prisma.vehicleType.upsert({
    where: {
      categoryId_slug: { categoryId: category.id, slug: "classic-sedan" },
    },
    create: {
      categoryId: category.id,
      slug: "classic-sedan",
      name: "Klasik Sedan",
      capacityMin: 1,
      capacityMax: 4,
      sortOrder: 1,
    },
    update: {},
  });

  const attributeDefs = [
    {
      key: "trim_color",
      label: "Süsleme Rengi",
      dataType: "ENUM" as const,
      isRequired: true,
      enumOptions: ["white", "red", "ivory", "champagne"],
      sortOrder: 10,
    },
    {
      key: "has_air_conditioning",
      label: "Klima Var Mı",
      dataType: "BOOLEAN" as const,
      isRequired: true,
      sortOrder: 20,
    },
    {
      key: "has_chauffeur",
      label: "Şoförlü Mü",
      dataType: "BOOLEAN" as const,
      isRequired: true,
      sortOrder: 30,
    },
  ];
  for (const def of attributeDefs) {
    const { enumOptions, ...rest } = def;
    await prisma.categoryAttributeDefinition.upsert({
      where: {
        categoryId_key_scope: {
          categoryId: category.id,
          key: def.key,
          scope: "VEHICLE",
        },
      },
      create: {
        categoryId: category.id,
        scope: "VEHICLE",
        ...rest,
        ...(enumOptions !== undefined ? { enumOptions } : {}),
      },
      update: {},
    });
  }

  return { categoryId: category.id, vehicleTypeId: vehicleType.id };
}
