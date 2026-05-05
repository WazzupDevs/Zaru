-- A4e-2 — notifications dead-letter queue + per-attempt journal.
-- Generator note: the spurious `DROP COLUMN last_known_location` from
-- `prisma migrate diff` is the PostGIS generated column added in
-- 20260507; we omit it for the same reason as the A4e-1 migration.

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "attempt_history" JSONB NOT NULL DEFAULT '[]';

-- CreateTable
CREATE TABLE "notification_dead_letters" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "notification_id" UUID NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "kind" "NotificationKind" NOT NULL,
    "recipient_phone" TEXT NOT NULL,
    "rendered_body" TEXT NOT NULL,
    "final_error" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL,
    "first_attempt_at" TIMESTAMP(3) NOT NULL,
    "last_attempt_at" TIMESTAMP(3) NOT NULL,
    "dead_lettered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempt_history" JSONB NOT NULL,
    "investigated_at" TIMESTAMP(3),
    "investigated_by_user_id" UUID,
    "resolution" TEXT,

    CONSTRAINT "notification_dead_letters_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "notification_dead_letters_notification_id_key" ON "notification_dead_letters"("notification_id");

-- CreateIndex
CREATE INDEX "notification_dead_letters_dead_lettered_at_idx" ON "notification_dead_letters"("dead_lettered_at");

-- CreateIndex
CREATE INDEX "notification_dead_letters_investigated_at_idx" ON "notification_dead_letters"("investigated_at");

-- AddForeignKey
ALTER TABLE "notification_dead_letters" ADD CONSTRAINT "notification_dead_letters_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "notifications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
