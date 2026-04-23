-- A2c: extend User and RefreshToken for OTP verify and rotation chain.
-- See ADR 0008 (refresh token rotation strategy).

-- AlterTable: User
ALTER TABLE "users"
  ADD COLUMN "phone_verified_at" TIMESTAMP(3),
  ADD COLUMN "last_login_at" TIMESTAMP(3);

-- AlterTable: RefreshToken
-- family_id is NOT NULL, but we add it with a transient DEFAULT so any
-- pre-existing rows (left over from manual dev tinkering) get a unique
-- family of their own, then we drop the default. New rows always supply
-- family_id explicitly from the application layer.
ALTER TABLE "refresh_tokens"
  ADD COLUMN "family_id" UUID NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN "ip_address" TEXT,
  ADD COLUMN "user_agent" TEXT;

ALTER TABLE "refresh_tokens"
  ALTER COLUMN "family_id" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "refresh_tokens_family_id_idx" ON "refresh_tokens"("family_id");
CREATE INDEX "refresh_tokens_user_id_revoked_at_idx" ON "refresh_tokens"("user_id", "revoked_at");
