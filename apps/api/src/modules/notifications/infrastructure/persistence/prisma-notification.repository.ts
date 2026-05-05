import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";

import type { TxClient } from "../../../../common/persistence/tx-client";
import type {
  CreateNotificationInput,
  FindRecentDuplicateInput,
  NotificationListFilter,
  NotificationRepositoryPort,
} from "../../application/ports/notification.repository.port";
import type {
  NotificationAttemptEntry,
  NotificationEntity,
  NotificationStatus,
} from "../../domain/notification-types";

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
      },
    });
  }

  async appendAttempt(tx: TxClient, id: string, entry: NotificationAttemptEntry): Promise<void> {
    // Two-step: read current history, append, write back. Optimistic — at
    // BullMQ concurrency=5 collisions are rare; if we lose, the worse case
    // is one missing journal entry. Production: switch to a JSON ARRAY_APPEND
    // raw SQL if this becomes contentious.
    const existing = await tx.notification.findUnique({
      where: { id },
      select: { attemptHistory: true, retryCount: true },
    });
    if (!existing) return;
    const history = Array.isArray(existing.attemptHistory)
      ? (existing.attemptHistory as unknown as NotificationAttemptEntry[])
      : [];
    await tx.notification.update({
      where: { id },
      data: {
        attemptHistory: [...history, entry] as unknown as Prisma.InputJsonValue,
        retryCount: existing.retryCount + 1,
      },
    });
  }

  async markDeadLettered(tx: TxClient, id: string): Promise<void> {
    await tx.notification.update({
      where: { id },
      data: { status: "DEAD_LETTERED" },
    });
  }

  async resetForRetry(tx: TxClient, id: string): Promise<NotificationEntity | null> {
    const result = await tx.notification.updateMany({
      where: { id, status: { in: ["FAILED", "DEAD_LETTERED"] } },
      data: {
        status: "PENDING",
        providerError: null,
        failedAt: null,
        // Don't reset retryCount or attemptHistory — admin needs that audit.
      },
    });
    if (result.count === 0) return null;
    const row = await tx.notification.findUnique({ where: { id } });
    return row ? toEntity(row) : null;
  }

  async list(tx: TxClient, filter: NotificationListFilter): Promise<NotificationEntity[]> {
    const limit = Math.min(Math.max(filter.limit ?? 20, 1), 100);
    const rows = await tx.notification.findMany({
      where: {
        ...(filter.status ? { status: filter.status } : {}),
        ...(filter.kind ? { kind: filter.kind } : {}),
        ...(filter.recipientPhone ? { recipientPhone: filter.recipientPhone } : {}),
        ...(filter.fromDate || filter.toDate
          ? {
              createdAt: {
                ...(filter.fromDate ? { gte: filter.fromDate } : {}),
                ...(filter.toDate ? { lte: filter.toDate } : {}),
              },
            }
          : {}),
        ...(filter.cursor ? { id: { lt: filter.cursor } } : {}),
      },
      orderBy: { id: "desc" },
      take: limit,
    });
    return rows.map(toEntity);
  }

  async countByStatus(tx: TxClient, fromDate: Date): Promise<Record<NotificationStatus, number>> {
    const rows = await tx.notification.groupBy({
      by: ["status"],
      where: { createdAt: { gte: fromDate } },
      _count: { _all: true },
    });
    const result: Record<string, number> = {
      PENDING: 0,
      SENDING: 0,
      SENT: 0,
      DELIVERED: 0,
      FAILED: 0,
      DEAD_LETTERED: 0,
    };
    for (const r of rows) result[r.status] = r._count._all;
    return result;
  }
}

function toEntity(
  row: Awaited<ReturnType<TxClient["notification"]["findFirstOrThrow"]>>,
): NotificationEntity {
  const history = Array.isArray(row.attemptHistory)
    ? (row.attemptHistory as unknown as NotificationAttemptEntry[])
    : [];
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
    attemptHistory: history,
    sourceEventType: row.sourceEventType,
    sourceAggregateId: row.sourceAggregateId,
    createdAt: row.createdAt,
    sentAt: row.sentAt,
    deliveredAt: row.deliveredAt,
    failedAt: row.failedAt,
  };
}
