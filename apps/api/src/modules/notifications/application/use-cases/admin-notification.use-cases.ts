import { InjectQueue } from "@nestjs/bullmq";
import { Inject, Injectable } from "@nestjs/common";
import { Queue } from "bullmq";

import { CLOCK_PORT, type ClockPort } from "../../../../common/clock/clock.port";
import { TX_RUNNER_PORT, type TxRunnerPort } from "../../../../common/persistence/tx-runner.port";
import { NotificationNotFoundError } from "../../domain/errors/notification-errors";
import { NOTIFICATION_QUEUE_NAME, SEND_NOTIFICATION_JOB } from "../notification-queue.constants";
import {
  NOTIFICATION_DEAD_LETTER_REPOSITORY_PORT,
  NOTIFICATION_REPOSITORY_PORT,
  type DeadLetterListFilter,
  type NotificationDeadLetterRepositoryPort,
  type NotificationListFilter,
  type NotificationRepositoryPort,
} from "../ports/notification.repository.port";

import type {
  NotificationDeadLetterEntity,
  NotificationEntity,
  NotificationStatus,
} from "../../domain/notification-types";

/** Admin list — filter by status / kind / phone / date range. */
@Injectable()
export class ListNotificationsUseCase {
  constructor(
    @Inject(NOTIFICATION_REPOSITORY_PORT)
    private readonly repo: NotificationRepositoryPort,
    @Inject(TX_RUNNER_PORT) private readonly tx: TxRunnerPort,
  ) {}
  async execute(filter: NotificationListFilter): Promise<NotificationEntity[]> {
    return this.tx.run((tx) => this.repo.list(tx, filter));
  }
}

/** Admin retry — re-queue a FAILED or DEAD_LETTERED notification. */
@Injectable()
export class RetryNotificationUseCase {
  constructor(
    @Inject(NOTIFICATION_REPOSITORY_PORT)
    private readonly repo: NotificationRepositoryPort,
    @Inject(TX_RUNNER_PORT) private readonly tx: TxRunnerPort,
    @InjectQueue(NOTIFICATION_QUEUE_NAME) private readonly queue: Queue,
  ) {}
  async execute(id: string): Promise<NotificationEntity> {
    const updated = await this.tx.run((tx) => this.repo.resetForRetry(tx, id));
    if (!updated) throw new NotificationNotFoundError();
    // Use a different jobId on retry so BullMQ does not collide with
    // the original job (which may still be in failed/completed buffers).
    await this.queue.add(
      SEND_NOTIFICATION_JOB,
      { notificationId: updated.id },
      {
        jobId: `notification-retry-${updated.id}-${Date.now().toString()}`,
        removeOnComplete: { count: 100 },
        removeOnFail: false,
        // No extra retry budget on manual retry — admin sees a single
        // attempt, decides whether to retry again from the UI.
        attempts: 1,
      },
    );
    return updated;
  }
}

/** Admin DLQ list. */
@Injectable()
export class ListDeadLettersUseCase {
  constructor(
    @Inject(NOTIFICATION_DEAD_LETTER_REPOSITORY_PORT)
    private readonly dlqRepo: NotificationDeadLetterRepositoryPort,
    @Inject(TX_RUNNER_PORT) private readonly tx: TxRunnerPort,
  ) {}
  async execute(filter: DeadLetterListFilter): Promise<NotificationDeadLetterEntity[]> {
    return this.tx.run((tx) => this.dlqRepo.list(tx, filter));
  }
}

/** Admin investigation — mark a DLQ row as triaged + record resolution. */
@Injectable()
export class MarkDeadLetterInvestigatedUseCase {
  constructor(
    @Inject(NOTIFICATION_DEAD_LETTER_REPOSITORY_PORT)
    private readonly dlqRepo: NotificationDeadLetterRepositoryPort,
    @Inject(TX_RUNNER_PORT) private readonly tx: TxRunnerPort,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
  ) {}
  async execute(input: {
    id: string;
    investigatedByUserId: string;
    resolution: string;
  }): Promise<NotificationDeadLetterEntity> {
    const updated = await this.tx.run((tx) =>
      this.dlqRepo.markInvestigated(tx, input.id, {
        investigatedByUserId: input.investigatedByUserId,
        investigatedAt: this.clock.now(),
        resolution: input.resolution,
      }),
    );
    if (!updated) throw new NotificationNotFoundError();
    return updated;
  }
}

export type ListNotificationStatusFilter = NotificationStatus | undefined;
