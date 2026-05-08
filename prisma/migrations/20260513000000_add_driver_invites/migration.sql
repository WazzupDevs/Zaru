-- A4f-1 — closed-beta whitelist for the driver app.
-- Admin invites a TR mobile by phone; the driver app's auth flow only
-- proceeds for phones with a PENDING invite. On successful OTP verify
-- the row goes ACCEPTED, the User flips role=DRIVER, and a
-- DriverProfile auto-provisions in APPROVED status.

CREATE TYPE "DriverInviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED');

CREATE TABLE "driver_invites" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "phone_e164" TEXT NOT NULL,
    "phone_e164_hash" TEXT NOT NULL,
    "status" "DriverInviteStatus" NOT NULL DEFAULT 'PENDING',
    "invited_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accepted_at" TIMESTAMP(3),
    "accepted_user_id" UUID,
    "invited_by_admin_id" UUID NOT NULL,
    "notes" TEXT,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "driver_invites_pkey" PRIMARY KEY ("id")
);

-- One DriverInvite per accepted user.
CREATE UNIQUE INDEX "driver_invites_accepted_user_id_key"
    ON "driver_invites"("accepted_user_id");

-- Whitelist lookup hot path — hash + status filter.
CREATE INDEX "driver_invites_phone_e164_hash_status_idx"
    ON "driver_invites"("phone_e164_hash", "status");

-- Admin list sort.
CREATE INDEX "driver_invites_status_invited_at_idx"
    ON "driver_invites"("status", "invited_at");

ALTER TABLE "driver_invites"
    ADD CONSTRAINT "driver_invites_accepted_user_id_fkey"
    FOREIGN KEY ("accepted_user_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "driver_invites"
    ADD CONSTRAINT "driver_invites_invited_by_admin_id_fkey"
    FOREIGN KEY ("invited_by_admin_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
