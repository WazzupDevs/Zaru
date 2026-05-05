import { Injectable } from "@nestjs/common";

import type { TxClient } from "../../../../common/persistence/tx-client";
import type {
  CreateNotificationInput,
  FindRecentDuplicateInput,
  NotificationRepositoryPort,
} from "../../application/ports/notification.repository.port";
import type { NotificationEntity } from "../../domain/notification-types";

@Injectable()
export class PrismaNotificationRepository implements NotificationRepositoryPort {
  async create(tx: TxClient, input: CreateNotificationInput): Promise<NotificationEntity> {
    const row = await tx.notification.create({
      data: {
        channel: input.channel,
        kind: input.kind,
        recipientUserId: input.recipientUserId,
        recipientPhone: input.recipientPhone,
        templateKey: input.templateKey,
        locale: input.locale,
        renderedBody: input.renderedBody,
        status: input.status,
        ...(input.sourceEventType !== undefined ? { sourceEventType: input.sourceEventType } : {}),
        ...(input.sourceAggregateId !== undefined
          ? { sourceAggregateId: input.sourceAggregateId }
          : {}),
      },
    });
    return toEntity(row);
  }

  async findById(tx: TxClient, id: string): Promise<NotificationEntity | null> {
    const row = await tx.notification.findUnique({ where: { id } });
    return row ? toEntity(row) : null;
  }

  async findRecentDuplicate(
    tx: TxClient,
    input: FindRecentDuplicateInput,
  ): Promise<NotificationEntity | null> {
    const cutoff = new Date(input.now.getTime() - input.withinMs);
    const row = await tx.notification.findFirst({
      where: {
        sourceAggregateId: input.sourceAggregateId,
        kind: input.kind,
        recipientPhone: input.recipientPhone,
        createdAt: { gte: cutoff },
      },
      orderBy: { createdAt: "desc" },
    });
    return row ? toEntity(row) : null;
  }

  /**
   * Atomic PENDING → SENDING. Worker calls this before talking to the
   * provider; if the row was already taken (e.g. retried by another
   * instance) we return false and the worker bails.
   */
  async markSending(tx: TxClient, id: string): Promise<boolean> {
    const result = await tx.notification.updateMany({
      where: { id, status: "PENDING" },
      data: { status: "SENDING" },
    });
    return result.count > 0;
  }

  async markSent(
    tx: TxClient,
    id: string,
    input: { providerMessageId: string; sentAt: Date },
  ): Promise<void> {
    await tx.notification.update({
      where: { id },
      data: {
        status: "SENT",
        providerMessageId: input.providerMessageId,
        sentAt: input.sentAt,
      },
    });
  }

  async markFailed(
    tx: TxClient,
    id: string,
    input: { providerError: string; failedAt: Date },
  ): Promise<void> {
    await tx.notification.update({
      where: { id },
      data: {
        status: "FAILED",
        providerError: input.providerError,
        failedAt: input.failedAt,
        retryCount: { increment: 1 },
      },
    });
  }
}

function toEntity(
  row: Awaited<ReturnType<TxClient["notification"]["findFirstOrThrow"]>>,
): NotificationEntity {
  return {
    id: row.id,
    channel: row.channel,
    kind: row.kind,
    recipientUserId: row.recipientUserId,
    recipientPhone: row.recipientPhone,
    templateKey: row.templateKey,
    locale: row.locale,
    renderedBody: row.renderedBody,
    status: row.status,
    providerMessageId: row.providerMessageId,
    providerError: row.providerError,
    retryCount: row.retryCount,
    sourceEventType: row.sourceEventType,
    sourceAggregateId: row.sourceAggregateId,
    createdAt: row.createdAt,
    sentAt: row.sentAt,
    deliveredAt: row.deliveredAt,
    failedAt: row.failedAt,
  };
}
