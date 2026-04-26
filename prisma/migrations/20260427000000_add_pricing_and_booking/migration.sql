-- CreateEnum
CREATE TYPE "PricingRuleType" AS ENUM ('SEASONAL_MULTIPLIER', 'DAY_OF_WEEK_MULTIPLIER', 'ADDON');

-- CreateEnum
CREATE TYPE "PriceQuoteStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'CONSUMED');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('DRAFT');

-- CreateTable
CREATE TABLE "pricing_profiles" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "vehicle_type_id" UUID NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'TRY',
    "base_fee" DECIMAL(10,2) NOT NULL,
    "per_km_fee" DECIMAL(10,2) NOT NULL,
    "per_hour_fee" DECIMAL(10,2) NOT NULL,
    "minimum_hours" INTEGER NOT NULL DEFAULT 2,
    "included_km" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "pricing_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pricing_rules" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "type" "PricingRuleType" NOT NULL,
    "category_id" UUID,
    "vehicle_type_id" UUID,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "valid_from" DATE,
    "valid_to" DATE,
    "days_of_week" INTEGER,
    "multiplier" DECIMAL(4,2),
    "fixed_amount" DECIMAL(10,2),
    "is_optional" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "pricing_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_quotes" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "requested_by_user_id" UUID NOT NULL,
    "vehicle_type_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "pickup_lat" DECIMAL(10,7) NOT NULL,
    "pickup_lng" DECIMAL(10,7) NOT NULL,
    "pickup_address" TEXT NOT NULL,
    "dropoff_lat" DECIMAL(10,7) NOT NULL,
    "dropoff_lng" DECIMAL(10,7) NOT NULL,
    "dropoff_address" TEXT NOT NULL,
    "distance_km" DECIMAL(8,2) NOT NULL,
    "duration_minutes" INTEGER NOT NULL,
    "event_start_at" TIMESTAMP(3) NOT NULL,
    "event_end_at" TIMESTAMP(3) NOT NULL,
    "duration_hours" DECIMAL(5,2) NOT NULL,
    "breakdown" JSONB NOT NULL,
    "total_amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'TRY',
    "selected_addons" UUID[] DEFAULT ARRAY[]::UUID[],
    "status" "PriceQuoteStatus" NOT NULL DEFAULT 'ACTIVE',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "consumed_by_booking_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "price_quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookings" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "customer_id" UUID NOT NULL,
    "price_quote_id" UUID NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pricing_profiles_vehicle_type_id_key" ON "pricing_profiles"("vehicle_type_id");

-- CreateIndex
CREATE INDEX "pricing_rules_type_is_active_idx" ON "pricing_rules"("type", "is_active");

-- CreateIndex
CREATE INDEX "pricing_rules_valid_from_valid_to_idx" ON "pricing_rules"("valid_from", "valid_to");

-- CreateIndex
CREATE INDEX "price_quotes_requested_by_user_id_status_idx" ON "price_quotes"("requested_by_user_id", "status");

-- CreateIndex
CREATE INDEX "price_quotes_expires_at_idx" ON "price_quotes"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_price_quote_id_key" ON "bookings"("price_quote_id");

-- CreateIndex
CREATE INDEX "bookings_customer_id_status_idx" ON "bookings"("customer_id", "status");

-- AddForeignKey
ALTER TABLE "pricing_profiles" ADD CONSTRAINT "pricing_profiles_vehicle_type_id_fkey" FOREIGN KEY ("vehicle_type_id") REFERENCES "vehicle_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pricing_rules" ADD CONSTRAINT "pricing_rules_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "service_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pricing_rules" ADD CONSTRAINT "pricing_rules_vehicle_type_id_fkey" FOREIGN KEY ("vehicle_type_id") REFERENCES "vehicle_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_quotes" ADD CONSTRAINT "price_quotes_vehicle_type_id_fkey" FOREIGN KEY ("vehicle_type_id") REFERENCES "vehicle_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_quotes" ADD CONSTRAINT "price_quotes_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "service_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_price_quote_id_fkey" FOREIGN KEY ("price_quote_id") REFERENCES "price_quotes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
