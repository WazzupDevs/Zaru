-- CreateEnum
CREATE TYPE "AvailabilityType" AS ENUM ('BLOCKED', 'BOOKED');

-- CreateTable
CREATE TABLE "vehicle_availabilities" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "vehicle_id" UUID NOT NULL,
    "driver_profile_id" UUID NOT NULL,
    "start_at" TIMESTAMP(3) NOT NULL,
    "end_at" TIMESTAMP(3) NOT NULL,
    "type" "AvailabilityType" NOT NULL DEFAULT 'BLOCKED',
    "booking_id" UUID,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "vehicle_availabilities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vehicle_availabilities_vehicle_id_start_at_end_at_idx"
  ON "vehicle_availabilities"("vehicle_id", "start_at", "end_at");

-- CreateIndex
CREATE INDEX "vehicle_availabilities_start_at_end_at_idx"
  ON "vehicle_availabilities"("start_at", "end_at");

-- AddForeignKey
ALTER TABLE "vehicle_availabilities"
  ADD CONSTRAINT "vehicle_availabilities_vehicle_id_fkey"
  FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_availabilities"
  ADD CONSTRAINT "vehicle_availabilities_driver_profile_id_fkey"
  FOREIGN KEY ("driver_profile_id") REFERENCES "driver_profiles"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- The composite B-tree index above is enough for the per-vehicle overlap
-- query at our scale ("WHERE vehicle_id = ? AND start_at < $end AND end_at > $start").
-- A GiST index over `tstzrange(start_at, end_at, '[)')` would let us use the
-- `&&` operator directly but requires the btree_gist extension to combine
-- vehicle_id + range. Revisit if calendar query latency becomes an issue.
