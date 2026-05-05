import { Inject, Injectable } from "@nestjs/common";
import { InjectPinoLogger, PinoLogger } from "nestjs-pino";

import { CLOCK_PORT, type ClockPort } from "../../../../common/clock/clock.port";
import { TX_RUNNER_PORT, type TxRunnerPort } from "../../../../common/persistence/tx-runner.port";
import { NotificationNotFoundError } from "../../domain/errors/notification-errors";
import {
  NOTIFICATION_REPOSITORY_PORT,
  type NotificationRepositoryPort,
} from "../ports/notification.repository.port";
import { SMS_SENDER_PORT, type SmsSenderPort } from "../ports/sms-sender.port";

export interface SendNotificationInput {
  notificationId: string;
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
    @Inject(TX_RUNNER_PORT) private readonly tx: TxRunnerPort,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
    @InjectPinoLogger(SendNotificationUseCase.name)
    private readonly logger: PinoLogger,
  ) {}

  async execute(input: SendNotificationInput): Promise<void> {
    const notification = await this.tx.run((tx) => this.repo.findById(tx, input.notificationId));
    if (!notification) throw new NotificationNotFoundError();

    if (notification.status !== "PENDING") {
      this.logger.debug(
        { notificationId: notification.id, status: notification.status },
        "skipping non-PENDING notification",
      );
      return;
    }

    const claimed = await this.tx.run((tx) => this.repo.markSending(tx, notification.id));
    if (!claimed) {
      this.logger.debug(
        { notificationId: notification.id },
        "another worker took this notification first",
      );
      return;
    }

    try {
      if (notification.channel !== "SMS") {
        throw new Error(`Channel ${notification.channel} is not wired in A4e-1`);
      }
      const result = await this.smsSender.send({
        phone: notification.recipientPhone,
        message: notification.renderedBody,
        sourceId: notification.id,
      });
      await this.tx.run((tx) =>
        this.repo.markSent(tx, notification.id, {
          providerMessageId: result.providerMessageId,
          sentAt: result.sentAt,
        }),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.tx.run((tx) =>
        this.repo.markFailed(tx, notification.id, {
          providerError: message,
          failedAt: this.clock.now(),
        }),
      );
      throw err; // BullMQ retry hook (A4e-2 will increase attempts)
    }
  }
}
