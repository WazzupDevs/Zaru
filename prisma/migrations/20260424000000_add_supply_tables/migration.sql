-- CreateExtension (defensive — these are already created in earlier migrations)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- CreateEnum
CREATE TYPE "DriverOnboardingStatus" AS ENUM ('DRAFT', 'DOCUMENTS_PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "VehicleStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('DRIVER_LICENSE', 'VEHICLE_REGISTRATION', 'INSURANCE', 'KASKO', 'AUTHORITY_CERTIFICATE', 'IDENTITY_CARD');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('UPLOADED', 'APPROVED', 'REJECTED', 'EXPIRED');

-- CreateTable
CREATE TABLE "driver_profiles" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "user_id" UUID NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "national_id_hash" TEXT NOT NULL,
    "birth_date" DATE NOT NULL,
    "iban_hash" TEXT NOT NULL,
    "iban_last4" TEXT NOT NULL,
    "status" "DriverOnboardingStatus" NOT NULL DEFAULT 'DRAFT',
    "rejection_reason" TEXT,
    "approved_at" TIMESTAMP(3),
    "approved_by_user_id" UUID,
    "commission_rate" DECIMAL(5,4) NOT NULL DEFAULT 0.15,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "driver_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicles" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "driver_profile_id" UUID NOT NULL,
    "vehicle_type_id" UUID NOT NULL,
    "plate_number" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "color" TEXT NOT NULL,
    "attributes" JSONB NOT NULL DEFAULT '{}',
    "photo_keys" TEXT[],
    "status" "VehicleStatus" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "driver_profile_id" UUID NOT NULL,
    "vehicle_id" UUID,
    "type" "DocumentType" NOT NULL,
    "storage_key" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "mime_type" TEXT NOT NULL,
    "issued_at" DATE,
    "expires_at" DATE,
    "status" "DocumentStatus" NOT NULL DEFAULT 'UPLOADED',
    "reviewed_by_user_id" UUID,
    "reviewed_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "driver_profiles_user_id_key" ON "driver_profiles"("user_id");

-- CreateIndex
CREATE INDEX "driver_profiles_status_idx" ON "driver_profiles"("status");

-- CreateIndex
CREATE INDEX "driver_profiles_national_id_hash_idx" ON "driver_profiles"("national_id_hash");

-- CreateIndex
CREATE INDEX "vehicles_driver_profile_id_idx" ON "vehicles"("driver_profile_id");

-- CreateIndex
CREATE INDEX "vehicles_status_idx" ON "vehicles"("status");

-- CreateIndex
CREATE INDEX "documents_driver_profile_id_idx" ON "documents"("driver_profile_id");

-- CreateIndex
CREATE INDEX "documents_vehicle_id_idx" ON "documents"("vehicle_id");

-- CreateIndex
CREATE INDEX "documents_expires_at_idx" ON "documents"("expires_at");

-- AddForeignKey
ALTER TABLE "driver_profiles" ADD CONSTRAINT "driver_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_driver_profile_id_fkey" FOREIGN KEY ("driver_profile_id") REFERENCES "driver_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_vehicle_type_id_fkey" FOREIGN KEY ("vehicle_type_id") REFERENCES "vehicle_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_driver_profile_id_fkey" FOREIGN KEY ("driver_profile_id") REFERENCES "driver_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Manual additions: partial unique indexes that Prisma DSL cannot express.
-- A driver profile rows is uniquely active per user (revived deletes are a
-- separate row); a plate number is uniquely active across the whole fleet
-- so soft-deleted rows don't block re-registration of the same plate.
CREATE UNIQUE INDEX "driver_profiles_user_id_active_unique"
  ON "driver_profiles"("user_id") WHERE "deleted_at" IS NULL;

CREATE UNIQUE INDEX "vehicles_plate_number_active_unique"
  ON "vehicles"("plate_number") WHERE "deleted_at" IS NULL;
