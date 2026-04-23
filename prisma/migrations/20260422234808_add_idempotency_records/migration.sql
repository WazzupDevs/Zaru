-- CreateTable
CREATE TABLE "idempotency_records" (
    "key" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "response_code" INTEGER NOT NULL,
    "response_body" JSONB NOT NULL,
    "user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "idempotency_records_expires_at_idx" ON "idempotency_records"("expires_at");
