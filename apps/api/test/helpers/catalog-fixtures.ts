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

/**
 * Pricing data on top of the catalog fixture — needed by Booking,
 * Dispatch, and Notifications integration specs that walk a real
 * customer-quote-confirm flow. Mirrors the wedding-car shape from
 * `prisma/seed.ts` (one PricingProfile + the seasonal/weekend rules)
 * so the smoke-tested 6877.00 TRY case still pins.
 */
export async function setupPricingFixtures(
  prisma: PrismaClient,
  vehicleTypeId: string,
): Promise<void> {
  await prisma.pricingProfile.upsert({
    where: { vehicleTypeId },
    create: {
      vehicleTypeId,
      baseFee: "3000.00",
      perKmFee: "15.00",
      perHourFee: "200.00",
      minimumHours: 4,
      includedKm: 50,
    },
    update: {
      baseFee: "3000.00",
      perKmFee: "15.00",
      perHourFee: "200.00",
      minimumHours: 4,
      includedKm: 50,
      isActive: true,
    },
  });

  // Fixed UUIDs so re-seeding across suites is a true no-op.
  const seasonalRuleId = "11111111-1111-4111-8111-111111111111";
  const weekendRuleId = "22222222-2222-4222-8222-222222222222";

  await prisma.pricingRule.upsert({
    where: { id: seasonalRuleId },
    create: {
      id: seasonalRuleId,
      type: "SEASONAL_MULTIPLIER",
      name: "Yaz Sezonu",
      description: "Mayıs–Eylül zammı (%30)",
      validFrom: new Date("2026-05-01"),
      validTo: new Date("2026-09-30"),
      multiplier: "1.30",
      sortOrder: 10,
    },
    update: { isActive: true },
  });

  await prisma.pricingRule.upsert({
    where: { id: weekendRuleId },
    create: {
      id: weekendRuleId,
      type: "DAY_OF_WEEK_MULTIPLIER",
      name: "Hafta Sonu",
      description: "Cmt + Pzr zammı (%15)",
      // Bitmask: 32 (Cmt) | 64 (Pzr) = 96
      daysOfWeek: 96,
      multiplier: "1.15",
      sortOrder: 20,
    },
    update: { isActive: true },
  });
}
