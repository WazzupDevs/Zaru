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

async function main(): Promise<void> {
  // eslint-disable-next-line no-console
  console.log("Seeding wedding-car category...");
  await seedWeddingCar();
  // eslint-disable-next-line no-console
  console.log("Seeding bootstrap admin...");
  await seedBootstrapAdmin();
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
