-- A3a: Catalog tables — polymorphic vertical model.
-- See ADR 0012 (polymorphic catalog).

-- CreateEnum
CREATE TYPE "ServiceCategoryType" AS ENUM ('PLANNED_EVENT', 'ON_DEMAND_DISPATCH', 'SCHEDULED_TRANSPORT');

-- CreateEnum
CREATE TYPE "AttributeDataType" AS ENUM ('STRING', 'NUMBER', 'BOOLEAN', 'ENUM', 'DATE');

-- CreateEnum
CREATE TYPE "AttributeScope" AS ENUM ('VEHICLE', 'BOOKING');

-- CreateTable
CREATE TABLE "service_categories" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "ServiceCategoryType" NOT NULL,
    "icon_url" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "service_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_types" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "category_id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "capacity_min" INTEGER NOT NULL DEFAULT 1,
    "capacity_max" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "vehicle_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "category_attribute_definitions" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "category_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "data_type" "AttributeDataType" NOT NULL,
    "scope" "AttributeScope" NOT NULL,
    "is_required" BOOLEAN NOT NULL DEFAULT false,
    "enum_options" JSONB,
    "validation_rules" JSONB,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "category_attribute_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "service_categories_slug_key" ON "service_categories"("slug");

-- CreateIndex
CREATE INDEX "service_categories_is_active_sort_order_idx" ON "service_categories"("is_active", "sort_order");

-- CreateIndex
CREATE INDEX "vehicle_types_category_id_is_active_sort_order_idx" ON "vehicle_types"("category_id", "is_active", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_types_category_id_slug_key" ON "vehicle_types"("category_id", "slug");

-- CreateIndex
CREATE INDEX "category_attribute_definitions_category_id_scope_sort_order_idx" ON "category_attribute_definitions"("category_id", "scope", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "category_attribute_definitions_category_id_key_scope_key" ON "category_attribute_definitions"("category_id", "key", "scope");

-- AddForeignKey
ALTER TABLE "vehicle_types" ADD CONSTRAINT "vehicle_types_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "service_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category_attribute_definitions" ADD CONSTRAINT "category_attribute_definitions_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "service_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

