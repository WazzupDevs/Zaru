import { Global, Module } from "@nestjs/common";

import { S3Storage } from "./s3-storage";
import { STORAGE_PORT } from "./storage.port";

/**
 * Global object-storage module. Production binds to S3-compatible R2;
 * dev to MinIO via docker compose. Tests can override STORAGE_PORT
 * with an in-memory fake if they don't want to spin up a container.
 */
@Global()
@Module({
  providers: [S3Storage, { provide: STORAGE_PORT, useExisting: S3Storage }],
  exports: [STORAGE_PORT],
})
export class StorageModule {}
