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
/**
 * Advisory-lock id used to serialize concurrent TRUNCATEs. Different
 * specs share the same Postgres role, so a session-level
 * pg_advisory_lock is enough — no need for the more global xact lock.
 * The number is arbitrary; pick anything stable so reruns recognise it.
 */
const TRUNCATE_LOCK_ID = 8_842_017_001n;

const LOCK_DEADLOCK_CODES = new Set(["40P01", "55P03"]); // deadlock + lock_not_available

export async function truncateTransactionalTables(prisma: PrismaClient): Promise<void> {
  // Background workers (outbox drain, booking expiry, dispatch worker,
  // idempotency cleanup) start as soon as AppModule boots and run on
  // their own intervals. They take AccessShareLock on these tables
  // while we want AccessExclusiveLock for TRUNCATE — that is a textbook
  // deadlock recipe. Wrap with pg_advisory_lock + retry so the cleanup
  // backs off instead of crashing the whole spec.
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${TRUNCATE_LOCK_ID.toString()})`);
        await tx.$executeRawUnsafe(`
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
      });
      return;
    } catch (err: unknown) {
      const code = (err as { code?: string } | null)?.code;
      if (!code || !LOCK_DEADLOCK_CODES.has(code) || attempt === 5) {
        throw err;
      }
      // Linear backoff — workers tick every 30-60s, a few hundred ms
      // is plenty for them to release.
      await new Promise((resolve) => setTimeout(resolve, 100 * attempt));
    }
  }
}
