-- A4c dispatch metadata.
--
-- Adds driver location/online/rating columns, the booking dispatch counters,
-- and the PostGIS bits Prisma DSL cannot express:
--   * generated geography column (last_known_location) keyed off lat/lng
--   * GIST index on the geography column for ST_DWithin radius queries
--
-- PostGIS extension is already enabled (Postgres image is postgis/postgis:16);
-- we re-issue CREATE EXTENSION IF NOT EXISTS as defensive housekeeping.

CREATE EXTENSION IF NOT EXISTS postgis;

-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "dispatch_attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "dispatch_failed_reason" TEXT,
ADD COLUMN     "last_dispatch_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "driver_profiles" ADD COLUMN     "is_online" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "last_known_lat" DECIMAL(10,7),
ADD COLUMN     "last_known_lng" DECIMAL(10,7),
ADD COLUMN     "last_location_update" TIMESTAMP(3),
ADD COLUMN     "rating_average" DECIMAL(3,2) NOT NULL DEFAULT 5.0,
ADD COLUMN     "rating_count" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "driver_profiles_is_online_last_location_update_idx" ON "driver_profiles"("is_online", "last_location_update");

-- Generated geography column. STORED so it occupies physical space and
-- Postgres recomputes only when the source columns change. WGS84 (4326).
ALTER TABLE "driver_profiles"
  ADD COLUMN "last_known_location" geography(Point, 4326)
  GENERATED ALWAYS AS (
    CASE
      WHEN "last_known_lat" IS NOT NULL AND "last_known_lng" IS NOT NULL
      THEN ST_SetSRID(ST_MakePoint("last_known_lng"::float, "last_known_lat"::float), 4326)::geography
      ELSE NULL
    END
  ) STORED;

-- GIST spatial index. Partial: skip rows without location and soft-deleted
-- profiles. ST_DWithin uses this index as long as the geography matches.
CREATE INDEX "driver_profiles_location_gist_idx"
  ON "driver_profiles" USING GIST("last_known_location")
  WHERE "last_known_location" IS NOT NULL AND "deleted_at" IS NULL;
