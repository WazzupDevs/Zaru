-- CreateEnum
CREATE TYPE "OtpChannel" AS ENUM ('SMS');

-- CreateEnum
CREATE TYPE "OtpPurpose" AS ENUM ('LOGIN');

-- CreateTable
CREATE TABLE "otp_requests" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "phone_e164" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "channel" "OtpChannel" NOT NULL DEFAULT 'SMS',
    "purpose" "OtpPurpose" NOT NULL DEFAULT 'LOGIN',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "otp_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "otp_requests_phone_e164_created_at_idx" ON "otp_requests"("phone_e164", "created_at");

-- CreateIndex
CREATE INDEX "otp_requests_expires_at_idx" ON "otp_requests"("expires_at");
