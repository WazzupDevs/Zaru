import { ConfigService } from "@nestjs/config";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { SystemClock } from "../src/common/clock/system-clock";
import { OutboxDrainService } from "../src/common/outbox/outbox-drain.service";
import { PrismaService } from "../src/common/prisma/prisma.service";

import type { Env } from "../src/config/env";
import type { PinoLogger } from "nestjs-pino";

/**
 * OutboxDrainService end-to-end against the real Testcontainers Postgres.
 * Bypasses BullMQ entirely (the Processor in outbox.worker.ts is a thin
 * delegator) so we can verify drain behavior deterministically without
 * fighting a worker loop.
 */
describe("OutboxDrainService (Testcontainers)", () => {
  let prisma: PrismaService;
  let events: EventEmitter2;
  let drain: OutboxDrainService;

  beforeAll(async () => {
    const config = {
      get: (key: string) => process.env[key],
    } as unknown as ConfigService<Env, true>;
    prisma = new PrismaService(config);
    await prisma.onModuleInit();

    events = new EventEmitter2({ wildcard: true, delimiter: "." });

    const noopLogger = {
      debug: () => undefined,
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined,
    } as unknown as PinoLogger;
    drain = new OutboxDrainService(prisma, events, new SystemClock(), noopLogger);
  });

  afterAll(async () => {
    events.removeAllListeners();
    await prisma.onModuleDestroy();
  });

  beforeEach(async () => {
    events.removeAllListeners();
    // Wipe ALL outbox rows so prior suites (auth e2e) leave no
    // pending events for our drain assertions.
    await prisma.client.outboxEvent.deleteMany({});
  });

  async function seedEvent(eventType: string, payload: object) {
    return prisma.client.outboxEvent.create({
      data: {
        aggregateType: "TestAggregate",
        aggregateId: cryptoRandomUUID(),
        eventType,
        payload: payload as never,
      },
    });
  }

  it("processes pending events and emits them on the in-process bus", async () => {
    const seen: unknown[] = [];
    events.on("test.demo", (payload) => {
      seen.push(payload);
    });

    const a = await seedEvent("test.demo", { n: 1 });
    const b = await seedEvent("test.demo", { n: 2 });

    const drained = await drain.drainOnce();
    expect(drained).toBe(2);

    const after = await prisma.client.outboxEvent.findMany({
      where: { id: { in: [a.id, b.id] } },
      orderBy: { createdAt: "asc" },
    });
    expect(after.every((row) => row.processedAt !== null)).toBe(true);
    expect(seen).toHaveLength(2);
    expect((seen as { n: number }[])[0]?.n).toBe(1);
  });

  it("schedules exponential-backoff retry on handler failure (no abandonment yet)", async () => {
    events.on("test.failing", () => {
      throw new Error("listener boom");
    });
    const row = await seedEvent("test.failing", { x: true });

    const drained = await drain.drainOnce();
    expect(drained).toBe(1);

    const after = await prisma.client.outboxEvent.findUnique({ where: { id: row.id } });
    expect(after?.processedAt).toBeNull();
    expect(after?.retryCount).toBe(1);
    expect(after?.lastError).toContain("listener boom");
    expect(after?.nextAttemptAt).not.toBeNull();
    expect(after?.nextAttemptAt?.getTime() ?? 0).toBeGreaterThan(Date.now());
  });

  it("abandons an event after MAX_RETRIES handler failures", async () => {
    events.on("test.alwaysfail", () => {
      throw new Error("permanent failure");
    });
    const row = await prisma.client.outboxEvent.create({
      data: {
        aggregateType: "TestAggregate",
        aggregateId: cryptoRandomUUID(),
        eventType: "test.alwaysfail",
        payload: {} as never,
        retryCount: 9, // bir sonraki fail 10'a çıkar → abandoned
      },
    });

    await drain.drainOnce();

    const after = await prisma.client.outboxEvent.findUnique({ where: { id: row.id } });
    expect(after?.processedAt).not.toBeNull();
    expect(after?.retryCount).toBe(10);
    expect(after?.lastError).toContain("[ABANDONED after 10]");
  });

  it("respects next_attempt_at: events scheduled in the future are skipped", async () => {
    const future = new Date(Date.now() + 60_000);
    const row = await prisma.client.outboxEvent.create({
      data: {
        aggregateType: "TestAggregate",
        aggregateId: cryptoRandomUUID(),
        eventType: "test.scheduled",
        payload: {} as never,
        retryCount: 1,
        nextAttemptAt: future,
      },
    });

    let listenerHits = 0;
    events.on("test.scheduled", () => {
      listenerHits++;
    });

    await drain.drainOnce();

    const after = await prisma.client.outboxEvent.findUnique({ where: { id: row.id } });
    expect(after?.processedAt).toBeNull();
    expect(after?.retryCount).toBe(1); // unchanged
    expect(listenerHits).toBe(0);
  });

  it("processes batches up to BATCH_SIZE per call", async () => {
    const events_ = await Promise.all(
      Array.from({ length: 60 }, (_, i) => seedEvent("test.batch", { i })),
    );

    const first = await drain.drainOnce();
    expect(first).toBe(50); // BATCH_SIZE
    const second = await drain.drainOnce();
    expect(second).toBe(10);

    const remaining = await prisma.client.outboxEvent.count({
      where: { id: { in: events_.map((e) => e.id) }, processedAt: null },
    });
    expect(remaining).toBe(0);
  });

  it("identity events from a verified OTP login flow drain end-to-end", async () => {
    // Simulate the exact event types the identity module emits.
    const types = [
      "identity.OtpRequested",
      "identity.OtpVerified",
      "identity.UserCreated",
      "identity.UserLoggedIn",
      "identity.RefreshTokensIssued",
    ];
    const seenTypes = new Set<string>();
    events.onAny((type) => {
      if (typeof type === "string" && type.startsWith("identity.")) {
        seenTypes.add(type);
      }
    });

    for (const t of types) {
      await prisma.client.outboxEvent.create({
        data: {
          aggregateType: "Identity",
          aggregateId: cryptoRandomUUID(),
          eventType: t,
          payload: { sample: true } as never,
        },
      });
    }

    await drain.drainOnce();
    expect([...seenTypes].sort()).toEqual([...types].sort());
  });
});

function cryptoRandomUUID(): string {
  // node:crypto is available globally in Node 20.
  return globalThis.crypto.randomUUID();
}
