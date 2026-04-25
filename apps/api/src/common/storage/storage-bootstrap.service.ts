import { Inject, Injectable, type OnApplicationBootstrap } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectPinoLogger, type PinoLogger } from "nestjs-pino";

import { STORAGE_PORT, type StoragePort } from "./storage.port";

import type { Env } from "../../config/env";

/**
 * Idempotent bucket bootstrap on app startup. Production skips — buckets
 * are pre-provisioned by DevOps (Terraform / dashboard). Dev + test create
 * the bucket on demand so a fresh `pnpm db:nuke && pnpm db:up` doesn't
 * leave the API booting against a missing bucket.
 */
@Injectable()
export class StorageBootstrapService implements OnApplicationBootstrap {
  constructor(
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
    private readonly config: ConfigService<Env, true>,
    @InjectPinoLogger(StorageBootstrapService.name)
    private readonly logger: PinoLogger,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const env = this.config.get("NODE_ENV", { infer: true });
    if (env === "production") {
      this.logger.info("Skipping storage bucket bootstrap in production");
      return;
    }
    await this.storage.ensureBucket();
    this.logger.info(
      { bucket: this.config.get("STORAGE_BUCKET", { infer: true }) },
      "Storage bucket ensured",
    );
  }
}
