import type { TxClient } from "../../../../common/persistence/tx-client";
import type {
  NotificationAttemptEntry,
  NotificationChannel,
  NotificationDeadLetterEntity,
  NotificationEntity,
  NotificationKind,
  NotificationStatus,
} from "../../domain/notification-types";

export const NOTIFICATION_REPOSITORY_PORT = Symbol("NOTIFICATION_REPOSITORY_PORT");

export interface NotificationListFilter {
  status?: NotificationStatus;
  kind?: NotificationKind;
  recipientPhone?: string;
  fromDate?: Date;
  toDate?: Date;
  limit?: number;
  cursor?: string;
}

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
  /** Append one entry to attemptHistory + bump retryCount atomically. */
  appendAttempt(tx: TxClient, id: string, entry: NotificationAttemptEntry): Promise<void>;
  /** FAILED → DEAD_LETTERED. Worker calls this after the final retry. */
  markDeadLettered(tx: TxClient, id: string): Promise<void>;
  /** Reset DEAD_LETTERED/FAILED → PENDING. Used by admin retry. */
  resetForRetry(tx: TxClient, id: string): Promise<NotificationEntity | null>;
  list(tx: TxClient, filter: NotificationListFilter): Promise<NotificationEntity[]>;
  countByStatus(tx: TxClient, fromDate: Date): Promise<Record<NotificationStatus, number>>;
}

export const NOTIFICATION_DEAD_LETTER_REPOSITORY_PORT = Symbol(
  "NOTIFICATION_DEAD_LETTER_REPOSITORY_PORT",
);

export interface CreateDeadLetterInput {
  notificationId: string;
  channel: NotificationChannel;
  kind: NotificationKind;
  recipientPhone: string;
  renderedBody: string;
  finalError: string;
  attempts: number;
  firstAttemptAt: Date;
  lastAttemptAt: Date;
  attemptHistory: NotificationAttemptEntry[];
}

export interface DeadLetterListFilter {
  investigated?: boolean;
  limit?: number;
  cursor?: string;
}

export interface NotificationDeadLetterRepositoryPort {
  create(tx: TxClient, input: CreateDeadLetterInput): Promise<NotificationDeadLetterEntity>;
  findById(tx: TxClient, id: string): Promise<NotificationDeadLetterEntity | null>;
  findByNotificationId(
    tx: TxClient,
    notificationId: string,
  ): Promise<NotificationDeadLetterEntity | null>;
  list(tx: TxClient, filter: DeadLetterListFilter): Promise<NotificationDeadLetterEntity[]>;
  markInvestigated(
    tx: TxClient,
    id: string,
    input: { investigatedByUserId: string; investigatedAt: Date; resolution: string },
  ): Promise<NotificationDeadLetterEntity | null>;
}
