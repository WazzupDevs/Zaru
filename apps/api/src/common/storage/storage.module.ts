import { Global, Module } from "@nestjs/common";

import { S3Storage } from "./s3-storage";
import { StorageBootstrapService } from "./storage-bootstrap.service";
import { STORAGE_PORT } from "./storage.port";

/**
 * Global object-storage module. Production binds to S3-compatible R2;
 * dev to MinIO via docker compose. Tests can override STORAGE_PORT
 * with an in-memory fake if they don't want to spin up a container.
 *
 * StorageBootstrapService runs on app start to ensure the bucket exists
 * (no-op in production).
 */
@Global()
@Module({
  providers: [
    S3Storage,
    { provide: STORAGE_PORT, useExisting: S3Storage },
    StorageBootstrapService,
  ],
  exports: [STORAGE_PORT],
})
export class StorageModule {}
