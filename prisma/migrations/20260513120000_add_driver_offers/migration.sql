-- A4f-2 — driver offer lifecycle. Replaces the auto-assign dispatch
-- model (matcher → booking DRIVER_ASSIGNED) with a 5-minute offer
-- window: the matcher creates a PENDING offer, the driver accepts or
-- rejects, and only on accept does the booking transition.
--
-- Status enum mirrors the domain state machine:
--   PENDING → ACCEPTED → ON_THE_WAY → ARRIVED → IN_PROGRESS → COMPLETED
--          ↘ REJECTED / EXPIRED
--   (any non-COMPLETED) → CANCELLED (booking cancel cascade)

CREATE TYPE "DriverOfferStatus" AS ENUM (
    'PENDING',
    'ACCEPTED',
    'ON_THE_WAY',
    'ARRIVED',
    'IN_PROGRESS',
    'COMPLETED',
    'REJECTED',
    'EXPIRED',
    'CANCELLED'
);

CREATE TYPE "DriverRejectReason" AS ENUM (
    'TOO_FAR',
    'TIME_CONFLICT',
    'VEHICLE_UNAVAILABLE',
    'OTHER'
);

CREATE TABLE "driver_offers" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "booking_id" UUID NOT NULL,
    "driver_profile_id" UUID NOT NULL,
    -- Frozen at offer creation (matcher picked this driver-vehicle
    -- pair); accept reads it directly instead of re-resolving.
    "vehicle_id" UUID NOT NULL,

    "status" "DriverOfferStatus" NOT NULL DEFAULT 'PENDING',
    "expires_at" TIMESTAMP(3) NOT NULL,

    "accepted_at" TIMESTAMP(3),
    "rejected_at" TIMESTAMP(3),
    "expired_at" TIMESTAMP(3),
    "on_the_way_at" TIMESTAMP(3),
    "arrived_at" TIMESTAMP(3),
    "in_progress_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),

    "reject_reason" "DriverRejectReason",
    "reject_note" TEXT,

    "matched_distance_km" DECIMAL(8, 3),
    "matched_score" DECIMAL(5, 4),

    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "driver_offers_pkey" PRIMARY KEY ("id")
);

-- Same driver can't receive two offers for the same booking even on
-- worker retry — the dispatch sweep explicitly excludes prior drivers
-- via the candidate query.
CREATE UNIQUE INDEX "driver_offers_booking_id_driver_profile_id_key"
    ON "driver_offers"("booking_id", "driver_profile_id");

-- Driver-side hot path: "give me my current offer" (status filter
-- pruned by application layer; index covers all statuses).
CREATE INDEX "driver_offers_driver_profile_id_status_idx"
    ON "driver_offers"("driver_profile_id", "status");

-- Worker auto-expire sweep: WHERE status='PENDING' AND expires_at < now().
CREATE INDEX "driver_offers_status_expires_at_idx"
    ON "driver_offers"("status", "expires_at");

-- Customer booking detail enrichment + worker active-offer check:
-- "is there an active offer for this booking?".
CREATE INDEX "driver_offers_booking_id_status_idx"
    ON "driver_offers"("booking_id", "status");

ALTER TABLE "driver_offers"
    ADD CONSTRAINT "driver_offers_booking_id_fkey"
    FOREIGN KEY ("booking_id") REFERENCES "bookings"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "driver_offers"
    ADD CONSTRAINT "driver_offers_driver_profile_id_fkey"
    FOREIGN KEY ("driver_profile_id") REFERENCES "driver_profiles"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "driver_offers"
    ADD CONSTRAINT "driver_offers_vehicle_id_fkey"
    FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
