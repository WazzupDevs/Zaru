import { OutboxDrainService } from "../../src/common/outbox/outbox-drain.service";
import { PrismaService } from "../../src/common/prisma/prisma.service";
import { SendNotificationUseCase } from "../../src/modules/notifications/application/use-cases/send-notification.use-case";

import type { INestApplication } from "@nestjs/common";

export interface DrainAndProcessOptions {
  /** Hard ceiling for the polling loop. Default 10s. */
  timeoutMs?: number;
  /** Tick interval between status checks. Default 100ms. */
  intervalMs?: number;
  /**
   * If true, swallow individual notification send errors so the drain
   * loop can keep going (retry / DLQ scenarios call this; happy-path
   * scenarios pass false to surface unexpected failures). Default true.
   */
  swallowNotificationErrors?: boolean;
}

/**
 * Drives the outbox → listener → notification queue chain to a fixed
 * point. Each tick:
 *   1. drainOnce() — emits any pending outbox event into EventEmitter2
 *      (listeners run async on the same tick)
 *   2. processes every notification still in PENDING / SENDING via
 *      SendNotificationUseCase
 *   3. checks if anything else is still pending; if not, returns
 *
 * Loops with intervalMs back-off so async listeners that haven't
 * resolved yet get a turn. Throws on timeout — failing fast beats
 * the silent test-flake we'd otherwise get if a worker stayed stuck.
 */
export async function drainAndProcess(
  app: INestApplication,
  options: DrainAndProcessOptions = {},
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? 10_000;
  const intervalMs = options.intervalMs ?? 100;
  const swallow = options.swallowNotificationErrors ?? true;

  const drain = app.get(OutboxDrainService);
  const prisma = app.get(PrismaService);
  const sendUseCase = app.get(SendNotificationUseCase);

  const deadline = Date.now() + timeoutMs;
  let lastDrainCount = 0;
  let lastProcessedCount = 0;

  while (Date.now() < deadline) {
    lastDrainCount = await drain.drainOnce();

    const pending = await prisma.client.notification.findMany({
      where: { status: { in: ["PENDING", "SENDING"] } },
      select: { id: true },
    });
    lastProcessedCount = pending.length;

    for (const n of pending) {
      try {
        await sendUseCase.execute({ notificationId: n.id, attemptNumber: 1 });
      } catch (err) {
        if (!swallow) throw err;
      }
    }

    // Re-check after work done. If there is nothing left in the outbox
    // AND no notification is still PENDING/SENDING, we are done.
    const stillPending = await prisma.client.notification.count({
      where: { status: { in: ["PENDING", "SENDING"] } },
    });
    const unprocessedOutbox = await prisma.client.outboxEvent.count({
      where: { processedAt: null },
    });
    if (stillPending === 0 && unprocessedOutbox === 0 && lastDrainCount === 0) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(
    `drainAndProcess timeout after ${timeoutMs.toString()}ms ` +
      `(lastDrain=${lastDrainCount.toString()}, lastPending=${lastProcessedCount.toString()})`,
  );
}
