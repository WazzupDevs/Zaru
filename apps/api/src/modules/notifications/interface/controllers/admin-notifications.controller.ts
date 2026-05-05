import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from "@nestjs/common";

import { CurrentUser, type AuthUser } from "../../../../common/auth/current-user.decorator";
import { Roles } from "../../../../common/auth/roles.decorator";
import {
  ListDeadLettersUseCase,
  ListNotificationsUseCase,
  MarkDeadLetterInvestigatedUseCase,
  RetryNotificationUseCase,
} from "../../application/use-cases/admin-notification.use-cases";

import type {
  NotificationDeadLetterEntity,
  NotificationEntity,
  NotificationKind,
  NotificationStatus,
} from "../../domain/notification-types";

interface NotificationListItem {
  id: string;
  channel: string;
  kind: NotificationKind;
  recipientUserId: string | null;
  status: NotificationStatus;
  retryCount: number;
  createdAt: string;
  sentAt: string | null;
  failedAt: string | null;
  providerError: string | null;
  // Body intentionally excluded from the list view (PII). Detail
  // endpoint exposes it with the right RBAC.
}

interface NotificationDetail extends NotificationListItem {
  recipientPhone: string;
  renderedBody: string;
  attemptHistory: NotificationEntity["attemptHistory"];
  sourceEventType: string | null;
  sourceAggregateId: string | null;
}

interface DeadLetterListItem {
  id: string;
  notificationId: string;
  kind: NotificationKind;
  attempts: number;
  finalError: string;
  deadLetteredAt: string;
  investigatedAt: string | null;
  resolution: string | null;
}

/**
 * Admin notification monitoring (A4e-2). All routes require ADMIN role
 * via @Roles. Body / phone exposure is opt-in: the list view drops
 * them, the detail view returns them so investigators can inspect.
 */
@Controller("admin/notifications")
@Roles("ADMIN")
export class AdminNotificationsController {
  constructor(
    private readonly listUseCase: ListNotificationsUseCase,
    private readonly retryUseCase: RetryNotificationUseCase,
    private readonly listDlqUseCase: ListDeadLettersUseCase,
    private readonly investigateUseCase: MarkDeadLetterInvestigatedUseCase,
  ) {}

  @Get()
  async list(
    @Query("status") status?: NotificationStatus,
    @Query("kind") kind?: NotificationKind,
    @Query("recipientPhone") recipientPhone?: string,
    @Query("limit") limit?: string,
    @Query("cursor") cursor?: string,
  ): Promise<NotificationListItem[]> {
    const rows = await this.listUseCase.execute({
      ...(status ? { status } : {}),
      ...(kind ? { kind } : {}),
      ...(recipientPhone ? { recipientPhone } : {}),
      ...(limit ? { limit: Number(limit) } : {}),
      ...(cursor ? { cursor } : {}),
    });
    return rows.map(toListItem);
  }

  @Post(":id/retry")
  async retry(@Param("id", new ParseUUIDPipe()) id: string): Promise<NotificationDetail> {
    const row = await this.retryUseCase.execute(id);
    return toDetail(row);
  }

  @Get("dead-letters")
  async listDeadLetters(
    @Query("investigated") investigated?: string,
    @Query("limit") limit?: string,
    @Query("cursor") cursor?: string,
  ): Promise<DeadLetterListItem[]> {
    const rows = await this.listDlqUseCase.execute({
      ...(investigated === "true" ? { investigated: true } : {}),
      ...(investigated === "false" ? { investigated: false } : {}),
      ...(limit ? { limit: Number(limit) } : {}),
      ...(cursor ? { cursor } : {}),
    });
    return rows.map(toDlqListItem);
  }

  @Post("dead-letters/:id/investigate")
  async investigate(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() body: { resolution: string },
    @CurrentUser() user: AuthUser,
  ): Promise<DeadLetterListItem> {
    const updated = await this.investigateUseCase.execute({
      id,
      investigatedByUserId: user.id,
      resolution: body.resolution,
    });
    return toDlqListItem(updated);
  }
}

function toListItem(row: NotificationEntity): NotificationListItem {
  return {
    id: row.id,
    channel: row.channel,
    kind: row.kind,
    recipientUserId: row.recipientUserId,
    status: row.status,
    retryCount: row.retryCount,
    createdAt: row.createdAt.toISOString(),
    sentAt: row.sentAt?.toISOString() ?? null,
    failedAt: row.failedAt?.toISOString() ?? null,
    providerError: row.providerError,
  };
}

function toDetail(row: NotificationEntity): NotificationDetail {
  return {
    ...toListItem(row),
    recipientPhone: row.recipientPhone,
    renderedBody: row.renderedBody,
    attemptHistory: row.attemptHistory,
    sourceEventType: row.sourceEventType,
    sourceAggregateId: row.sourceAggregateId,
  };
}

function toDlqListItem(row: NotificationDeadLetterEntity): DeadLetterListItem {
  return {
    id: row.id,
    notificationId: row.notificationId,
    kind: row.kind,
    attempts: row.attempts,
    finalError: row.finalError,
    deadLetteredAt: row.deadLetteredAt.toISOString(),
    investigatedAt: row.investigatedAt?.toISOString() ?? null,
    resolution: row.resolution,
  };
}
