import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";

import type { TxClient } from "../../../../common/persistence/tx-client";
import type {
  CreateDeadLetterInput,
  DeadLetterListFilter,
  NotificationDeadLetterRepositoryPort,
} from "../../application/ports/notification.repository.port";
import type {
  NotificationAttemptEntry,
  NotificationDeadLetterEntity,
} from "../../domain/notification-types";

@Injectable()
export class PrismaNotificationDeadLetterRepository implements NotificationDeadLetterRepositoryPort {
  async create(tx: TxClient, input: CreateDeadLetterInput): Promise<NotificationDeadLetterEntity> {
    const row = await tx.notificationDeadLetter.create({
      data: {
        notificationId: input.notificationId,
        channel: input.channel,
        kind: input.kind,
        recipientPhone: input.recipientPhone,
        renderedBody: input.renderedBody,
        finalError: input.finalError,
        attempts: input.attempts,
        firstAttemptAt: input.firstAttemptAt,
        lastAttemptAt: input.lastAttemptAt,
        attemptHistory: input.attemptHistory as unknown as Prisma.InputJsonValue,
      },
    });
    return toEntity(row);
  }

  async findById(tx: TxClient, id: string): Promise<NotificationDeadLetterEntity | null> {
    const row = await tx.notificationDeadLetter.findUnique({ where: { id } });
    return row ? toEntity(row) : null;
  }

  async findByNotificationId(
    tx: TxClient,
    notificationId: string,
  ): Promise<NotificationDeadLetterEntity | null> {
    const row = await tx.notificationDeadLetter.findUnique({ where: { notificationId } });
    return row ? toEntity(row) : null;
  }

  async list(tx: TxClient, filter: DeadLetterListFilter): Promise<NotificationDeadLetterEntity[]> {
    const limit = Math.min(Math.max(filter.limit ?? 20, 1), 100);
    const rows = await tx.notificationDeadLetter.findMany({
      where: {
        ...(filter.investigated === true ? { investigatedAt: { not: null } } : {}),
        ...(filter.investigated === false ? { investigatedAt: null } : {}),
        ...(filter.cursor ? { id: { lt: filter.cursor } } : {}),
      },
      orderBy: { id: "desc" },
      take: limit,
    });
    return rows.map(toEntity);
  }

  async markInvestigated(
    tx: TxClient,
    id: string,
    input: { investigatedByUserId: string; investigatedAt: Date; resolution: string },
  ): Promise<NotificationDeadLetterEntity | null> {
    const result = await tx.notificationDeadLetter.updateMany({
      where: { id, investigatedAt: null },
      data: {
        investigatedAt: input.investigatedAt,
        investigatedByUserId: input.investigatedByUserId,
        resolution: input.resolution,
      },
    });
    if (result.count === 0) return null;
    const row = await tx.notificationDeadLetter.findUnique({ where: { id } });
    return row ? toEntity(row) : null;
  }
}

function toEntity(
  row: Awaited<ReturnType<TxClient["notificationDeadLetter"]["findFirstOrThrow"]>>,
): NotificationDeadLetterEntity {
  const history = Array.isArray(row.attemptHistory)
    ? (row.attemptHistory as unknown as NotificationAttemptEntry[])
    : [];
  return {
    id: row.id,
    notificationId: row.notificationId,
    channel: row.channel,
    kind: row.kind,
    recipientPhone: row.recipientPhone,
    renderedBody: row.renderedBody,
    finalError: row.finalError,
    attempts: row.attempts,
    firstAttemptAt: row.firstAttemptAt,
    lastAttemptAt: row.lastAttemptAt,
    deadLetteredAt: row.deadLetteredAt,
    attemptHistory: history,
    investigatedAt: row.investigatedAt,
    investigatedByUserId: row.investigatedByUserId,
    resolution: row.resolution,
  };
}
