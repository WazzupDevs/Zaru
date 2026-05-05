import { InjectQueue } from "@nestjs/bullmq";
import { Inject, Injectable } from "@nestjs/common";
import { Queue } from "bullmq";

import { CLOCK_PORT, type ClockPort } from "../../../../common/clock/clock.port";
import { TX_RUNNER_PORT, type TxRunnerPort } from "../../../../common/persistence/tx-runner.port";
import { NOTIFICATION_QUEUE_NAME, SEND_NOTIFICATION_JOB } from "../notification-queue.constants";
import {
  NOTIFICATION_REPOSITORY_PORT,
  type NotificationRepositoryPort,
} from "../ports/notification.repository.port";
import { TEMPLATE_RENDERER_PORT, type TemplateRendererPort } from "../ports/template-renderer.port";

import type {
  NotificationEntity,
  NotificationChannel,
  NotificationKind,
} from "../../domain/notification-types";

const DUPLICATE_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface QueueNotificationInput {
  channel: NotificationChannel;
  kind: NotificationKind;
  recipientUserId: string | null;
  recipientPhone: string;
  templateKey: string;
  locale: string;
  variables: Record<string, string | number>;
  sourceEventType?: string;
  sourceAggregateId?: string;
}

/**
 * Renders the body, persists a PENDING notification row, and enqueues a
 * BullMQ job for the worker. Idempotent within a 24h window keyed by
 * (sourceAggregateId, kind, recipientPhone) — the same outbox event
 * replayed by the OutboxScheduler does not produce duplicate SMS.
 */
@Injectable()
export class QueueNotificationUseCase {
  constructor(
    @Inject(NOTIFICATION_REPOSITORY_PORT)
    private readonly repo: NotificationRepositoryPort,
    @Inject(TEMPLATE_RENDERER_PORT)
    private readonly renderer: TemplateRendererPort,
    @Inject(TX_RUNNER_PORT) private readonly tx: TxRunnerPort,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
    @InjectQueue(NOTIFICATION_QUEUE_NAME) private readonly queue: Queue,
  ) {}

  async execute(input: QueueNotificationInput): Promise<NotificationEntity> {
    const renderedBody = await this.renderer.render(
      input.templateKey,
      input.locale,
      input.variables,
    );
    const now = this.clock.now();

    const notification = await this.tx.run(async (tx) => {
      if (input.sourceAggregateId !== undefined) {
        const existing = await this.repo.findRecentDuplicate(tx, {
          sourceAggregateId: input.sourceAggregateId,
          kind: input.kind,
          recipientPhone: input.recipientPhone,
          withinMs: DUPLICATE_WINDOW_MS,
          now,
        });
        if (existing) return existing;
      }
      return this.repo.create(tx, {
        channel: input.channel,
        kind: input.kind,
        recipientUserId: input.recipientUserId,
        recipientPhone: input.recipientPhone,
        templateKey: input.templateKey,
        locale: input.locale,
        renderedBody,
        status: "PENDING",
        ...(input.sourceEventType !== undefined ? { sourceEventType: input.sourceEventType } : {}),
        ...(input.sourceAggregateId !== undefined
          ? { sourceAggregateId: input.sourceAggregateId }
          : {}),
      });
    });

    // Only enqueue when a fresh row was created. Duplicates already had
    // a job dispatched on their initial run.
    if (
      notification.status === "PENDING" &&
      notification.createdAt.getTime() >= now.getTime() - 1000
    ) {
      await this.queue.add(
        SEND_NOTIFICATION_JOB,
        { notificationId: notification.id },
        {
          jobId: `notification-${notification.id}`,
          removeOnComplete: { count: 100 },
          removeOnFail: { count: 100 },
          attempts: 1, // A4e-2: bump to 5 with exponential backoff + DLQ
        },
      );
    }

    return notification;
  }
}
