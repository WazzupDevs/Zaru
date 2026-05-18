-- A4f-2b-1 — per (driver, booking) cooldown after a driver rejects an
-- offer. The dispatch worker (refactor pending in A4f-2b-2) excludes
-- candidates with an active cooldown for the booking it's re-matching.
--
-- Cooldown rows are upserted on reject (sliding 5-minute window) and
-- swept by a periodic worker once expires_at has passed. Unique
-- (driver, booking) makes "did this driver reject this booking
-- recently?" a single-row lookup.

CREATE TABLE "driver_dispatch_cooldowns" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "driver_profile_id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "driver_dispatch_cooldowns_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "driver_dispatch_cooldowns_driver_profile_id_booking_id_key"
    ON "driver_dispatch_cooldowns"("driver_profile_id", "booking_id");

CREATE INDEX "driver_dispatch_cooldowns_expires_at_idx"
    ON "driver_dispatch_cooldowns"("expires_at");

ALTER TABLE "driver_dispatch_cooldowns"
    ADD CONSTRAINT "driver_dispatch_cooldowns_driver_profile_id_fkey"
    FOREIGN KEY ("driver_profile_id") REFERENCES "driver_profiles"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "driver_dispatch_cooldowns"
    ADD CONSTRAINT "driver_dispatch_cooldowns_booking_id_fkey"
    FOREIGN KEY ("booking_id") REFERENCES "bookings"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
