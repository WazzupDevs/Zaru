import type { PrismaClient } from "@prisma/client";

/**
 * Truncates all per-test mutable tables — leaves catalog/pricing
 * fixtures (handled by setupCatalogFixtures + setupPricingFixtures)
 * intact. Specs call this in beforeEach to start from a clean slate
 * without re-running migrations or container teardown.
 *
 * `RESTART IDENTITY CASCADE` resets sequences and drops dependent rows,
 * so order across foreign keys does not matter. The list mirrors
 * everything Booking/Dispatch/Notifications/Pricing actually writes
 * during a test, plus outbox + idempotency for hygiene.
 */
export async function truncateTransactionalTables(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "notification_dead_letters",
      "notifications",
      "vehicle_availabilities",
      "bookings",
      "price_quotes",
      "vehicles",
      "documents",
      "driver_profiles",
      "refresh_tokens",
      "otp_requests",
      "users",
      "outbox_events",
      "idempotency_records"
    RESTART IDENTITY CASCADE
  `);
}
