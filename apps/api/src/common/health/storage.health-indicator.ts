import { Inject, Injectable } from "@nestjs/common";
import { HealthCheckError, HealthIndicator, type HealthIndicatorResult } from "@nestjs/terminus";

import { STORAGE_PORT, type StoragePort } from "../storage/storage.port";

const PING_TIMEOUT_MS = 2000;

@Injectable()
export class StorageHealthIndicator extends HealthIndicator {
  constructor(@Inject(STORAGE_PORT) private readonly storage: StoragePort) {
    super();
  }

  async pingCheck(key: string): Promise<HealthIndicatorResult> {
    try {
      const probe = this.storage.healthCheck();
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => {
          reject(new Error("storage health timeout"));
        }, PING_TIMEOUT_MS),
      );
      const ok = await Promise.race([probe, timeout]);
      if (!ok) {
        throw new Error("storage bucket unreachable");
      }
      return this.getStatus(key, true);
    } catch (err) {
      const result = this.getStatus(key, false, {
        message: err instanceof Error ? err.message : "storage check failed",
      });
      throw new HealthCheckError("Storage check failed", result);
    }
  }
}
