import { Inject, Injectable } from "@nestjs/common";
import { InjectPinoLogger, PinoLogger } from "nestjs-pino";

import { CLOCK_PORT, type ClockPort } from "../../../../common/clock/clock.port";
import { TX_RUNNER_PORT, type TxRunnerPort } from "../../../../common/persistence/tx-runner.port";
import { NotificationNotFoundError } from "../../domain/errors/notification-errors";
import {
  NOTIFICATION_REPOSITORY_PORT,
  type NotificationRepositoryPort,
} from "../ports/notification.repository.port";
import { PUSH_SENDER_PORT, type PushSenderPort } from "../ports/push-sender.port";
import { SMS_SENDER_PORT, type SmsSenderPort } from "../ports/sms-sender.port";
import { pushTitleFor } from "../services/push-titles";

export interface SendNotificationInput {
  notificationId: string;
  /** 1-indexed; supplied by the worker so attemptHistory has accurate numbering. */
  attemptNumber?: number;
}

/**
 * Worker entry point. Loads the notification, optimistically transitions
 * PENDING → SENDING, calls the channel adapter, then marks SENT or
 * FAILED. Already-SENT/SENDING rows are no-ops (idempotent — protects
 * against double delivery if BullMQ replays a job after Redis restart).
 */
@Injectable()
export class SendNotificationUseCase {
  constructor(
    @Inject(NOTIFICATION_REPOSITORY_PORT)
    private readonly repo: NotificationRepositoryPort,
    @Inject(SMS_SENDER_PORT) private readonly smsSender: SmsSenderPort,
    @Inject(PUSH_SENDER_PORT) private readonly pushSender: PushSenderPort,
    @Inject(TX_RUNNER_PORT) private readonly tx: TxRunnerPort,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
    @InjectPinoLogger(SendNotificationUseCase.name)
    private readonly logger: PinoLogger,
  ) {}

  async execute(input: SendNotificationInput): Promise<void> {
    const notification = await this.tx.run((tx) => this.repo.findById(tx, input.notificationId));
    if (!notification) throw new NotificationNotFoundError();

    // Idempotent terminal-state guard: SENT/DEAD_LETTERED rows are no-ops.
    // FAILED rows pass through — admin retry resets to PENDING (A4e-2).
    if (notification.status === "SENT" || notification.status === "DEAD_LETTERED") {
      this.logger.debug(
        { notificationId: notification.id, status: notification.status },
        "skipping terminal-status notification",
      );
      return;
    }

    // Atomic PENDING → SENDING. FAILED notifications skip this guard
    // (they flow straight through to a retry attempt).
    if (notification.status === "PENDING") {
      const claimed = await this.tx.run((tx) => this.repo.markSending(tx, notification.id));
      if (!claimed) {
        this.logger.debug(
          { notificationId: notification.id },
          "another worker took this notification first",
        );
        return;
      }
    }

    const attemptedAt = this.clock.now();
    try {
      let providerMessageId: string;
      let sentAt: Date;
      if (notification.channel === "SMS") {
        const result = await this.smsSender.send({
          phone: notification.recipientPhone,
          message: notification.renderedBody,
          sourceId: notification.id,
        });
        providerMessageId = result.providerMessageId;
        sentAt = result.sentAt;
      } else if (notification.channel === "PUSH") {
        if (!notification.recipientPushToken) {
          // Defensive: the listener guarantees PUSH rows have a token,
          // but a stale row from before A4e-3 (or an admin retry that
          // mutated the channel without setting a token) would land
          // here. Throwing fast triggers the standard retry/DLQ path
          // instead of silently swallowing the notification.
          throw new Error("PUSH channel notification missing recipientPushToken");
        }
        const result = await this.pushSender.send({
          expoPushToken: notification.recipientPushToken,
          title: pushTitleFor(notification.kind),
          body: notification.renderedBody,
          sourceId: notification.id,
          data: {
            kind: notification.kind,
            ...(notification.sourceAggregateId !== null
              ? { sourceAggregateId: notification.sourceAggregateId }
              : {}),
          },
        });
        providerMessageId = result.providerMessageId;
        sentAt = result.sentAt;
      } else {
        throw new Error(`Channel ${notification.channel} is not wired (only SMS + PUSH supported)`);
      }
      await this.tx.run((tx) =>
        this.repo.markSent(tx, notification.id, { providerMessageId, sentAt }),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const attemptNumber = input.attemptNumber ?? notification.retryCount + 1;
      await this.tx.run(async (tx) => {
        await this.repo.appendAttempt(tx, notification.id, {
          attempt: attemptNumber,
          error: message,
          attemptedAt: attemptedAt.toISOString(),
        });
        await this.repo.markFailed(tx, notification.id, {
          providerError: message,
          failedAt: attemptedAt,
        });
      });
      throw err; // BullMQ retry hook
    }
  }
}
