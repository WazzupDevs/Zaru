import { InjectQueue } from "@nestjs/bullmq";
import { Injectable } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { Queue } from "bullmq";
import { InjectPinoLogger, PinoLogger } from "nestjs-pino";

import {
  BOOKING_DISPATCH_JOB,
  BOOKING_DISPATCH_QUEUE_NAME,
} from "../../infrastructure/workers/booking-dispatch.constants";

import type {
  DriverOfferExpiredPayload,
  DriverOfferRejectedPayload,
} from "../../domain/events/dispatch-events";

/**
 * Immediate worker re-trigger after a driver rejects (or an offer
 * auto-expires). The 30s scheduler tick would eventually pick the
 * booking up anyway, but waiting that long while the customer
 * watches "looking for a driver" is poor UX.
 *
 * BullMQ idempotency: the kick job uses a derived jobId so two events
 * within the same second still queue at most one extra tick. The
 * worker concurrency is 1 anyway (single-process sweep), so even if
 * a duplicate slipped through it would no-op on the dispatchable
 * filter (the rejected offer's booking is already in the regular
 * sweep cohort).
 */
@Injectable()
export class DispatchRetriggerListener {
  constructor(
    @InjectQueue(BOOKING_DISPATCH_QUEUE_NAME) private readonly queue: Queue,
    @InjectPinoLogger(DispatchRetriggerListener.name)
    private readonly logger: PinoLogger,
  ) {}

  @OnEvent("dispatch.DriverOfferRejected", { async: true })
  async onRejected(payload: DriverOfferRejectedPayload): Promise<void> {
    await this.kick("rejected", payload.bookingId);
  }

  @OnEvent("dispatch.DriverOfferExpired", { async: true })
  async onExpired(payload: DriverOfferExpiredPayload): Promise<void> {
    await this.kick("expired", payload.bookingId);
  }

  private async kick(reason: string, bookingId: string): Promise<void> {
    try {
      await this.queue.add(
        BOOKING_DISPATCH_JOB,
        { trigger: reason, bookingId },
        {
          jobId: `retrigger-${reason}-${bookingId}-${String(Math.floor(Date.now() / 1000))}`,
          removeOnComplete: { count: 24 },
          removeOnFail: { count: 24 },
        },
      );
    } catch (err) {
      this.logger.warn(
        { reason, bookingId, err: err instanceof Error ? err.message : String(err) },
        "dispatch retrigger enqueue failed (sweep will catch on next tick)",
      );
    }
  }
}
