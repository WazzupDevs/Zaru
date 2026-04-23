import { Controller, Get } from "@nestjs/common";
import { HealthCheck, HealthCheckService } from "@nestjs/terminus";

import { PrismaHealthIndicator } from "./prisma.health-indicator";
import { RedisHealthIndicator } from "./redis.health-indicator";
import { Public } from "../auth/public.decorator";

const SERVICE_NAME = "event-fleet-api";
const SERVICE_VERSION = "0.0.0";

@Public()
@Controller()
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prisma: PrismaHealthIndicator,
    private readonly redis: RedisHealthIndicator,
  ) {}

  /**
   * Liveness probe — process is up. Must NOT depend on DB/Redis to avoid
   * restart loops when an upstream dependency is briefly unavailable.
   */
  @Get("healthz")
  liveness(): { status: "ok" } {
    return { status: "ok" };
  }

  /**
   * Readiness probe — process can serve traffic (DB and Redis reachable).
   * Returns 503 if any dependency check fails.
   */
  @Get("readyz")
  @HealthCheck()
  readiness() {
    return this.health.check([
      () => this.prisma.pingCheck("postgres"),
      () => this.redis.pingCheck("redis"),
    ]);
  }

  @Get("version")
  version(): {
    service: string;
    version: string;
    commit: string;
    buildTime: string;
  } {
    return {
      service: SERVICE_NAME,
      version: SERVICE_VERSION,
      commit: process.env.GIT_COMMIT ?? "unknown",
      buildTime: process.env.BUILD_TIME ?? "unknown",
    };
  }
}
