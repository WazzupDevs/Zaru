import type { TxClient } from "../../../../common/persistence/tx-client";
import type {
  NotificationChannel,
  NotificationEntity,
  NotificationKind,
  NotificationStatus,
} from "../../domain/notification-types";

export const NOTIFICATION_REPOSITORY_PORT = Symbol("NOTIFICATION_REPOSITORY_PORT");

export interface CreateNotificationInput {
  channel: NotificationChannel;
  kind: NotificationKind;
  recipientUserId: string | null;
  recipientPhone: string;
  templateKey: string;
  locale: string;
  renderedBody: string;
  status: NotificationStatus;
  sourceEventType?: string;
  sourceAggregateId?: string;
}

export interface FindRecentDuplicateInput {
  sourceAggregateId: string;
  kind: NotificationKind;
  recipientPhone: string;
  withinMs: number;
  now: Date;
}

export interface NotificationRepositoryPort {
  create(tx: TxClient, input: CreateNotificationInput): Promise<NotificationEntity>;
  findById(tx: TxClient, id: string): Promise<NotificationEntity | null>;
  findRecentDuplicate(
    tx: TxClient,
    input: FindRecentDuplicateInput,
  ): Promise<NotificationEntity | null>;
  /** PENDING → SENDING (returns false on optimistic miss). */
  markSending(tx: TxClient, id: string): Promise<boolean>;
  markSent(
    tx: TxClient,
    id: string,
    input: { providerMessageId: string; sentAt: Date },
  ): Promise<void>;
  markFailed(
    tx: TxClient,
    id: string,
    input: { providerError: string; failedAt: Date },
  ): Promise<void>;
}
