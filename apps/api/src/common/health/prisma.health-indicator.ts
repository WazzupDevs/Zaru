import { Injectable } from "@nestjs/common";
import { HealthCheckError, HealthIndicator, HealthIndicatorResult } from "@nestjs/terminus";

import { PrismaService } from "../prisma/prisma.service";

const PING_TIMEOUT_MS = 500;

@Injectable()
export class PrismaHealthIndicator extends HealthIndicator {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async pingCheck(key: string): Promise<HealthIndicatorResult> {
    try {
      const ping = this.prisma.$queryRaw`SELECT 1`;
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => {
          reject(new Error("postgres ping timeout"));
        }, PING_TIMEOUT_MS),
      );
      await Promise.race([ping, timeout]);
      return this.getStatus(key, true);
    } catch (err) {
      const result = this.getStatus(key, false, {
        message: err instanceof Error ? err.message : "postgres ping failed",
      });
      throw new HealthCheckError("Postgres check failed", result);
    }
  }
}
