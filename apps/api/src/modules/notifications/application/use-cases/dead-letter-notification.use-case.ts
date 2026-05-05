import { Inject, Injectable } from "@nestjs/common";
import { InjectPinoLogger, PinoLogger } from "nestjs-pino";

import { CLOCK_PORT, type ClockPort } from "../../../../common/clock/clock.port";
import {
  OUTBOX_WRITER_PORT,
  type OutboxWriterPort,
} from "../../../../common/persistence/outbox-writer.port";
import { TX_RUNNER_PORT, type TxRunnerPort } from "../../../../common/persistence/tx-runner.port";
import {
  NOTIFICATION_DEAD_LETTER_REPOSITORY_PORT,
  NOTIFICATION_REPOSITORY_PORT,
  type NotificationDeadLetterRepositoryPort,
  type NotificationRepositoryPort,
} from "../ports/notification.repository.port";

export interface DeadLetterNotificationInput {
  notificationId: string;
  finalError: string;
  attempts: number;
}

export const NOTIFICATION_DEAD_LETTERED_EVENT = "notifications.NotificationDeadLettered";

/**
 * Final-attempt failure handler. Worker calls this from `process()`
 * when BullMQ has exhausted the retry budget. Snapshots the
 * notification into NotificationDeadLetter, transitions status to
 * DEAD_LETTERED, emits an outbox event for downstream alerting
 * (Slack/email integration is A5+).
 *
 * Idempotent — if the notification is already DEAD_LETTERED we skip,
 * matching the pattern used in SendNotificationUseCase.
 */
@Injectable()
export class DeadLetterNotificationUseCase {
  constructor(
    @Inject(NOTIFICATION_REPOSITORY_PORT)
    private readonly repo: NotificationRepositoryPort,
    @Inject(NOTIFICATION_DEAD_LETTER_REPOSITORY_PORT)
    private readonly dlqRepo: NotificationDeadLetterRepositoryPort,
    @Inject(TX_RUNNER_PORT) private readonly tx: TxRunnerPort,
    @Inject(OUTBOX_WRITER_PORT) private readonly outbox: OutboxWriterPort,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
    @InjectPinoLogger(DeadLetterNotificationUseCase.name)
    private readonly logger: PinoLogger,
  ) {}

  async execute(input: DeadLetterNotificationInput): Promise<void> {
    const now = this.clock.now();

    await this.tx.run(async (tx) => {
      const notification = await this.repo.findById(tx, input.notificationId);
      if (!notification) return;
      if (notification.status === "DEAD_LETTERED") return; // idempotent

      // Snapshot first so the DLQ row exists even if a later worker tick
      // overwrites the source notification.
      const existingDlq = await this.dlqRepo.findByNotificationId(tx, notification.id);
      if (!existingDlq) {
        await this.dlqRepo.create(tx, {
          notificationId: notification.id,
          channel: notification.channel,
          kind: notification.kind,
          recipientPhone: notification.recipientPhone,
          renderedBody: notification.renderedBody,
          finalError: input.finalError,
          attempts: input.attempts,
          firstAttemptAt: notification.attemptHistory[0]
            ? new Date(notification.attemptHistory[0].attemptedAt)
            : notification.createdAt,
          lastAttemptAt: now,
          attemptHistory: notification.attemptHistory,
        });
      }

      await this.repo.markDeadLettered(tx, notification.id);

      // Outbox event (admin alert pipeline downstream — A5+ Slack/email).
      // PII-free payload: kind + attempts + error reason, no phone/body.
      await this.outbox.write(tx, {
        aggregateType: "Notification",
        aggregateId: notification.id,
        eventType: NOTIFICATION_DEAD_LETTERED_EVENT,
        payload: {
          notificationId: notification.id,
          kind: notification.kind,
          channel: notification.channel,
          attempts: input.attempts,
          // finalError is short error class — full message has stack trace
          // that may carry implementation detail (Netgsm code etc).
          finalErrorClass: input.finalError.split(":")[0] ?? "unknown",
        },
      });
    });

    this.logger.error(
      {
        notificationId: input.notificationId,
        attempts: input.attempts,
      },
      "notification dead-lettered after retry exhaustion",
    );
  }
}
