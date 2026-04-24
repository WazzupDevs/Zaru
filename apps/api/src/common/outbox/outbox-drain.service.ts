import { Inject, Injectable } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { Prisma } from "@prisma/client";
import { InjectPinoLogger, PinoLogger } from "nestjs-pino";

import { OUTBOX_BATCH_SIZE, OUTBOX_MAX_RETRIES } from "./outbox.constants";
import { CLOCK_PORT, type ClockPort } from "../clock/clock.port";
import { PrismaService } from "../prisma/prisma.service";

/**
 * One drain pass over the outbox table:
 * 1. Pick up to BATCH_SIZE unprocessed events whose next_attempt_at has
 *    passed, locking them with FOR UPDATE SKIP LOCKED so concurrent
 *    drain passes never grab the same row.
 * 2. For each: emitAsync to the in-process bus, mark processed_at on
 *    success or schedule an exponential-backoff retry on failure.
 * 3. After MAX_RETRIES, "abandon" the event: processed_at is set with
 *    last_error preserved, and a warn log is emitted. The DLQ table
 *    lands in a later session (A4+).
 *
 * Extracted as a service (not a BullMQ Processor) so unit tests can
 * call drainOnce() directly without spinning a BullMQ worker. The
 * Processor in outbox.worker.ts is a thin shell that delegates here.
 */
@Injectable()
export class OutboxDrainService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
    @InjectPinoLogger(OutboxDrainService.name)
    private readonly logger: PinoLogger,
  ) {}

  /**
   * Returns the number of events looked at in this pass. The optional
   * `now` arg is here so tests can pass a fixed instant; in production
   * the clock port supplies it.
   */
  async drainOnce(now: Date = this.clock.now()): Promise<number> {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<OutboxRow[]>(Prisma.sql`
        SELECT id, aggregate_type, aggregate_id, event_type, payload, retry_count
        FROM outbox_events
        WHERE processed_at IS NULL
          AND (next_attempt_at IS NULL OR next_attempt_at <= ${now})
        ORDER BY created_at ASC
        LIMIT ${OUTBOX_BATCH_SIZE}
        FOR UPDATE SKIP LOCKED
      `);

      for (const row of rows) {
        try {
          await this.events.emitAsync(row.event_type, row.payload);
          await tx.outboxEvent.update({
            where: { id: row.id },
            data: { processedAt: now, lastError: null, nextAttemptAt: null },
          });
          this.logger.debug({ id: row.id, type: row.event_type }, "outbox event processed");
        } catch (err) {
          await this.handleFailure(tx, row, now, err);
        }
      }

      return rows.length;
    });
  }

  private async handleFailure(
    tx: Prisma.TransactionClient,
    row: OutboxRow,
    now: Date,
    err: unknown,
  ): Promise<void> {
    const message = err instanceof Error ? err.message : String(err);
    const newRetryCount = row.retry_count + 1;

    if (newRetryCount >= OUTBOX_MAX_RETRIES) {
      await tx.outboxEvent.update({
        where: { id: row.id },
        data: {
          processedAt: now,
          retryCount: newRetryCount,
          lastError: `[ABANDONED after ${String(OUTBOX_MAX_RETRIES)}] ${message}`,
          nextAttemptAt: null,
        },
      });
      this.logger.warn(
        { id: row.id, type: row.event_type, retries: newRetryCount },
        "outbox event abandoned after max retries",
      );
      return;
    }

    // 2^retry seconds, capped at 1 hour to keep the schedule sane.
    const backoffSec = Math.min(2 ** newRetryCount, 3600);
    const nextAttemptAt = new Date(now.getTime() + backoffSec * 1000);
    await tx.outboxEvent.update({
      where: { id: row.id },
      data: {
        retryCount: newRetryCount,
        nextAttemptAt,
        lastError: message,
      },
    });
    this.logger.warn(
      {
        id: row.id,
        type: row.event_type,
        retries: newRetryCount,
        nextAttemptAt: nextAttemptAt.toISOString(),
        err: message,
      },
      "outbox event handler failed; scheduled retry",
    );
  }
}

interface OutboxRow {
  id: string;
  aggregate_type: string;
  aggregate_id: string;
  event_type: string;
  payload: unknown;
  retry_count: number;
}
