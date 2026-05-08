import type {
  NotificationChannel as PrismaChannel,
  NotificationKind as PrismaKind,
  NotificationStatus as PrismaStatus,
} from "@prisma/client";

export type NotificationChannel = PrismaChannel;
export type NotificationKind = PrismaKind;
export type NotificationStatus = PrismaStatus;

export interface NotificationAttemptEntry {
  attempt: number;
  error: string;
  attemptedAt: string; // ISO
}

export interface NotificationEntity {
  id: string;
  channel: NotificationChannel;
  kind: NotificationKind;
  recipientUserId: string | null;
  recipientPhone: string;
  /** A4e-3 — populated for PUSH rows. Null on SMS rows + on PUSH rows
   * created before the column existed (pre-A4e-3 backfill). */
  recipientPushToken: string | null;
  templateKey: string;
  locale: string;
  renderedBody: string;
  status: NotificationStatus;
  providerMessageId: string | null;
  providerError: string | null;
  retryCount: number;
  attemptHistory: NotificationAttemptEntry[];
  sourceEventType: string | null;
  sourceAggregateId: string | null;
  createdAt: Date;
  sentAt: Date | null;
  deliveredAt: Date | null;
  failedAt: Date | null;
}

export interface NotificationDeadLetterEntity {
  id: string;
  notificationId: string;
  channel: NotificationChannel;
  kind: NotificationKind;
  recipientPhone: string;
  renderedBody: string;
  finalError: string;
  attempts: number;
  firstAttemptAt: Date;
  lastAttemptAt: Date;
  deadLetteredAt: Date;
  attemptHistory: NotificationAttemptEntry[];
  investigatedAt: Date | null;
  investigatedByUserId: string | null;
  resolution: string | null;
}
