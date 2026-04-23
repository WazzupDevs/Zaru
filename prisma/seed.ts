/**
 * Idempotent dev/test seed. Safe to re-run — uses upsert by slug.
 *
 * Run with `pnpm db:seed`. Production: this script is allowed to run but
 * the wedding-car category is also production data (we ship with one
 * vertical), so re-runs are no-ops there too.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function seedWeddingCar(): Promise<void> {
  const category = await prisma.serviceCategory.upsert({
    where: { slug: "wedding-car" },
    update: {},
    create: {
      slug: "wedding-car",
      name: "Düğün Arabası",
      description:
        "Düğün, nişan ve kına organizasyonları için süslü araç kiralama. Sabit fiyat, otomatik ödeme.",
      type: "PLANNED_EVENT",
      sortOrder: 1,
      isActive: true,
    },
  });

  const vehicleTypes = [
    {
      slug: "classic-sedan",
      name: "Klasik Sedan",
      description: "Standart sedan — Renault Symbol, Fiat Linea sınıfı",
      capacityMin: 1,
      capacityMax: 4,
      sortOrder: 10,
    },
    {
      slug: "vip-sedan",
      name: "VIP Sedan",
      description: "Üst segment — BMW 5, Mercedes E sınıfı",
      capacityMin: 1,
      capacityMax: 4,
      sortOrder: 20,
    },
    {
      slug: "classic-car",
      name: "Klasik Otomobil",
      description: "Antika / klasik araç (Cadillac, Mustang vs)",
      capacityMin: 1,
      capacityMax: 4,
      sortOrder: 30,
    },
    {
      slug: "minibus",
      name: "Minibüs",
      description: "Geniş aile / yakın akraba taşıması için minibüs",
      capacityMin: 6,
      capacityMax: 16,
      sortOrder: 40,
    },
  ];
  for (const vt of vehicleTypes) {
    await prisma.vehicleType.upsert({
      where: { categoryId_slug: { categoryId: category.id, slug: vt.slug } },
      update: {},
      create: { categoryId: category.id, ...vt, isActive: true },
    });
  }

  // Polymorphic attribute definitions: vehicle-scoped (configures the car)
  // + booking-scoped (configures the rental).
  const attrDefs = [
    {
      key: "trim_color",
      label: "Süsleme Rengi",
      dataType: "ENUM" as const,
      scope: "VEHICLE" as const,
      isRequired: true,
      enumOptions: ["white", "red", "ivory", "champagne"],
      sortOrder: 10,
    },
    {
      key: "has_air_conditioning",
      label: "Klima Var Mı",
      dataType: "BOOLEAN" as const,
      scope: "VEHICLE" as const,
      isRequired: true,
      sortOrder: 20,
    },
    {
      key: "has_chauffeur",
      label: "Şoförlü Mü",
      dataType: "BOOLEAN" as const,
      scope: "VEHICLE" as const,
      isRequired: true,
      sortOrder: 30,
    },
    {
      key: "ceremony_venue",
      label: "Tören / Salon Adresi",
      dataType: "STRING" as const,
      scope: "BOOKING" as const,
      isRequired: true,
      sortOrder: 10,
    },
    {
      key: "rental_hours",
      label: "Kiralama Saati",
      dataType: "NUMBER" as const,
      scope: "BOOKING" as const,
      isRequired: true,
      validationRules: { min: 1, max: 24 },
      sortOrder: 20,
    },
  ];
  for (const def of attrDefs) {
    const { enumOptions, validationRules, ...rest } = def;
    await prisma.categoryAttributeDefinition.upsert({
      where: {
        categoryId_key_scope: {
          categoryId: category.id,
          key: def.key,
          scope: def.scope,
        },
      },
      update: {},
      create: {
        categoryId: category.id,
        ...rest,
        ...(enumOptions !== undefined ? { enumOptions } : {}),
        ...(validationRules !== undefined ? { validationRules } : {}),
      },
    });
  }
}

async function main(): Promise<void> {
  // eslint-disable-next-line no-console
  console.log("Seeding wedding-car category...");
  await seedWeddingCar();
  // eslint-disable-next-line no-console
  console.log("Seed complete.");
}

main()
  .catch((err: unknown) => {
    // eslint-disable-next-line no-console
    console.error("Seed failed:", err);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
