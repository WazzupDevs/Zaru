-- A4e-1 notifications table — outbox listener writes here, BullMQ
-- worker drains rows and calls the SMS provider. ADR 0021.
--
-- Generator note: `prisma migrate diff` emitted a spurious
-- `ALTER TABLE driver_profiles DROP COLUMN last_known_location` because
-- Prisma DSL does not know about the PostGIS generated column added in
-- 20260507. We deliberately leave that DROP out of this migration —
-- the column is generated and tied to lat/lng, dropping it would break
-- the dispatch search query.

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('SMS', 'PUSH', 'EMAIL');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'DELIVERED', 'FAILED', 'DEAD_LETTERED');

-- CreateEnum
CREATE TYPE "NotificationKind" AS ENUM ('BOOKING_CONFIRMED', 'BOOKING_CANCELLED', 'BOOKING_EXPIRED', 'DRIVER_ASSIGNED_TO_BOOKING', 'NEW_BOOKING_OFFER', 'BOOKING_CANCELLED_DRIVER', 'OTP_REQUEST');

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "channel" "NotificationChannel" NOT NULL,
    "kind" "NotificationKind" NOT NULL,
    "recipient_user_id" UUID,
    "recipient_phone" TEXT NOT NULL,
    "template_key" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'tr',
    "rendered_body" TEXT NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "provider_message_id" TEXT,
    "provider_error" TEXT,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "source_event_type" TEXT,
    "source_aggregate_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "failed_at" TIMESTAMP(3),

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notifications_recipient_user_id_created_at_idx" ON "notifications"("recipient_user_id", "created_at");

-- CreateIndex
CREATE INDEX "notifications_status_created_at_idx" ON "notifications"("status", "created_at");

-- CreateIndex
CREATE INDEX "notifications_source_aggregate_id_idx" ON "notifications"("source_aggregate_id");

-- CreateIndex
CREATE INDEX "notifications_source_aggregate_id_kind_recipient_phone_crea_idx" ON "notifications"("source_aggregate_id", "kind", "recipient_phone", "created_at");
