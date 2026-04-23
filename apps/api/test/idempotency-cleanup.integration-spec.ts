import { ConfigService } from "@nestjs/config";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { IdempotencyCleanupService } from "../src/common/idempotency/idempotency-cleanup.service";
import { PrismaService } from "../src/common/prisma/prisma.service";

import type { Env } from "../src/config/env";
import type { PinoLogger } from "nestjs-pino";

describe("IdempotencyCleanupService (Testcontainers)", () => {
  let prisma: PrismaService;
  let svc: IdempotencyCleanupService;

  beforeAll(async () => {
    const config = {
      get: (key: string) => process.env[key],
    } as unknown as ConfigService<Env, true>;
    prisma = new PrismaService(config);
    await prisma.onModuleInit();

    const noopLogger = {
      debug: () => undefined,
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined,
    } as unknown as PinoLogger;
    svc = new IdempotencyCleanupService(prisma, noopLogger);
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  beforeEach(async () => {
    await prisma.client.idempotencyRecord.deleteMany({
      where: { key: { startsWith: "cleanup-spec-" } },
    });
  });

  it("hard-deletes only rows whose expiresAt is in the past", async () => {
    const past = new Date(Date.now() - 60_000);
    const future = new Date(Date.now() + 60_000);
    const expired = Array.from({ length: 5 }, (_, i) => ({
      key: `cleanup-spec-expired-${String(i)}`,
      requestHash: "h",
      responseCode: 200,
      responseBody: { ok: true } as never,
      expiresAt: past,
    }));
    const live = Array.from({ length: 5 }, (_, i) => ({
      key: `cleanup-spec-live-${String(i)}`,
      requestHash: "h",
      responseCode: 200,
      responseBody: { ok: true } as never,
      expiresAt: future,
    }));
    await prisma.client.idempotencyRecord.createMany({
      data: [...expired, ...live],
    });

    const deleted = await svc.sweep();
    expect(deleted).toBe(5);

    const remaining = await prisma.client.idempotencyRecord.findMany({
      where: { key: { startsWith: "cleanup-spec-" } },
    });
    expect(remaining).toHaveLength(5);
    expect(remaining.every((r) => r.key.startsWith("cleanup-spec-live-"))).toBe(true);
  });

  it("returns 0 when there's nothing to delete (no log noise)", async () => {
    const deleted = await svc.sweep();
    expect(deleted).toBe(0);
  });
});
