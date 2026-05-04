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

/**
 * Bootstrap admin user — ONLY in dev/test. Production runs of `pnpm db:seed`
 * skip this and emit a warning so anyone running it on prod knows to use the
 * `pnpm api:promote-admin <phone>` CLI instead. ADR 0015.
 */
async function seedBootstrapAdmin(): Promise<void> {
  const env = process.env.NODE_ENV;
  if (env === "production") {
    // eslint-disable-next-line no-console
    console.log(
      "⚠️  NODE_ENV=production — admin bootstrap skipped. Use `pnpm api:promote-admin` CLI.",
    );
    return;
  }
  const phone = process.env.BOOTSTRAP_ADMIN_PHONE;
  if (phone === undefined || phone === "") {
    // eslint-disable-next-line no-console
    console.log("ℹ️  BOOTSTRAP_ADMIN_PHONE not set — skipping admin seed.");
    return;
  }
  if (!/^\+90(5)\d{9}$/.test(phone)) {
    // eslint-disable-next-line no-console
    console.log(`✗ BOOTSTRAP_ADMIN_PHONE invalid (${phone}) — must be TR E.164 mobile.`);
    return;
  }

  // The user.phoneE164 partial unique index covers active rows only, so we
  // findFirst+upsert by hand instead of relying on Prisma's where-by-unique.
  const existing = await prisma.user.findFirst({
    where: { phoneE164: phone, deletedAt: null },
  });
  if (existing) {
    if (existing.role !== "ADMIN") {
      await prisma.user.update({ where: { id: existing.id }, data: { role: "ADMIN" } });
      // eslint-disable-next-line no-console
      console.log(`✓ Existing user ${phone} promoted to ADMIN.`);
    } else {
      // eslint-disable-next-line no-console
      console.log(`✓ Admin user ${phone} already in place.`);
    }
    return;
  }

  await prisma.user.create({
    data: {
      phoneE164: phone,
      role: "ADMIN",
      phoneVerifiedAt: new Date(),
      displayName: "Admin (Bootstrap)",
    },
  });
  // eslint-disable-next-line no-console
  console.log(`✓ Admin user bootstrapped: ${phone}`);
}

/**
 * Pricing data for wedding-car: one PricingProfile per vehicle type +
 * seasonal/weekend multipliers + 2 wedding addons. Idempotent — uses fixed
 * UUIDs for the rules so re-runs are no-ops.
 *
 * Schema: ADR 0017 (pricing). Money columns are Decimal(10, 2).
 */
async function seedWeddingCarPricing(): Promise<void> {
  const category = await prisma.serviceCategory.findUnique({
    where: { slug: "wedding-car" },
  });
  if (!category) {
    // eslint-disable-next-line no-console
    console.log("ℹ️  wedding-car category not found, skipping pricing seed.");
    return;
  }

  const profiles = [
    {
      slug: "classic-sedan",
      baseFee: "3000.00",
      perKmFee: "15.00",
      perHourFee: "200.00",
      minimumHours: 4,
      includedKm: 50,
    },
    {
      slug: "vip-sedan",
      baseFee: "6000.00",
      perKmFee: "25.00",
      perHourFee: "400.00",
      minimumHours: 4,
      includedKm: 50,
    },
    {
      slug: "classic-car",
      baseFee: "8000.00",
      perKmFee: "30.00",
      perHourFee: "500.00",
      minimumHours: 5,
      includedKm: 30,
    },
    {
      slug: "minibus",
      baseFee: "4000.00",
      perKmFee: "20.00",
      perHourFee: "250.00",
      minimumHours: 3,
      includedKm: 50,
    },
  ];
  for (const p of profiles) {
    const vt = await prisma.vehicleType.findUnique({
      where: { categoryId_slug: { categoryId: category.id, slug: p.slug } },
    });
    if (!vt) continue;
    await prisma.pricingProfile.upsert({
      where: { vehicleTypeId: vt.id },
      update: {
        baseFee: p.baseFee,
        perKmFee: p.perKmFee,
        perHourFee: p.perHourFee,
        minimumHours: p.minimumHours,
        includedKm: p.includedKm,
        isActive: true,
      },
      create: {
        vehicleTypeId: vt.id,
        baseFee: p.baseFee,
        perKmFee: p.perKmFee,
        perHourFee: p.perHourFee,
        minimumHours: p.minimumHours,
        includedKm: p.includedKm,
      },
    });
  }

  // Fixed UUIDv4-shaped ids so re-running the seed is a true no-op (Prisma
  // upsert by primary key).
  const RULES = [
    {
      id: "11111111-1111-4111-8111-111111111111",
      type: "SEASONAL_MULTIPLIER" as const,
      categoryId: null,
      vehicleTypeId: null,
      name: "Yaz Sezonu",
      description: "Mayıs–Eylül düğün sezonu zamı (%30)",
      validFrom: new Date("2026-05-01"),
      validTo: new Date("2026-09-30"),
      daysOfWeek: null,
      multiplier: "1.30",
      fixedAmount: null,
      isOptional: false,
      sortOrder: 10,
    },
    {
      id: "22222222-2222-4222-8222-222222222222",
      type: "DAY_OF_WEEK_MULTIPLIER" as const,
      categoryId: null,
      vehicleTypeId: null,
      name: "Hafta Sonu",
      description: "Cumartesi + Pazar zammı (%15). Bitmask: 32 (Cmt) | 64 (Paz) = 96.",
      validFrom: null,
      validTo: null,
      daysOfWeek: 96,
      multiplier: "1.15",
      fixedAmount: null,
      isOptional: false,
      sortOrder: 20,
    },
    {
      id: "33333333-3333-4333-8333-333333333333",
      type: "ADDON" as const,
      categoryId: category.id,
      vehicleTypeId: null,
      name: "Düğün Süslemesi",
      description: "Çelenk, gelin tülü ve dış süsleme",
      validFrom: null,
      validTo: null,
      daysOfWeek: null,
      multiplier: null,
      fixedAmount: "500.00",
      isOptional: true,
      sortOrder: 30,
    },
    {
      id: "44444444-4444-4444-8444-444444444444",
      type: "ADDON" as const,
      categoryId: category.id,
      vehicleTypeId: null,
      name: "Üniformalı Şoför",
      description: "Özel kıyafetli, eğitimli düğün şoförü",
      validFrom: null,
      validTo: null,
      daysOfWeek: null,
      multiplier: null,
      fixedAmount: "800.00",
      isOptional: true,
      sortOrder: 40,
    },
  ];
  for (const r of RULES) {
    await prisma.pricingRule.upsert({
      where: { id: r.id },
      update: { isActive: true },
      create: r,
    });
  }
  // eslint-disable-next-line no-console
  console.log(
    `✓ Pricing seeded: ${String(profiles.length)} profiles + ${String(RULES.length)} rules.`,
  );
}

async function main(): Promise<void> {
  // eslint-disable-next-line no-console
  console.log("Seeding wedding-car category...");
  await seedWeddingCar();
  // eslint-disable-next-line no-console
  console.log("Seeding bootstrap admin...");
  await seedBootstrapAdmin();
  // eslint-disable-next-line no-console
  console.log("Seeding wedding-car pricing...");
  await seedWeddingCarPricing();
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
