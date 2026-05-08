import { BullModule } from "@nestjs/bullmq";
import { forwardRef, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { getLoggerToken, PinoLogger } from "nestjs-pino";

import { BookingModule } from "../booking/booking.module";
import { IdentityModule } from "../identity/identity.module";
import { SupplyModule } from "../supply/supply.module";
import { OutboxNotificationListener } from "./application/listeners/outbox-notification.listener";
import { NOTIFICATION_QUEUE_NAME } from "./application/notification-queue.constants";
import {
  NOTIFICATION_DEAD_LETTER_REPOSITORY_PORT,
  NOTIFICATION_REPOSITORY_PORT,
} from "./application/ports/notification.repository.port";
import { PUSH_SENDER_PORT, type PushSenderPort } from "./application/ports/push-sender.port";
import { SMS_SENDER_PORT, type SmsSenderPort } from "./application/ports/sms-sender.port";
import { TEMPLATE_RENDERER_PORT } from "./application/ports/template-renderer.port";
import { NotificationContextProvider } from "./application/services/notification-context.provider";
import {
  ListDeadLettersUseCase,
  ListNotificationsUseCase,
  MarkDeadLetterInvestigatedUseCase,
  RetryNotificationUseCase,
} from "./application/use-cases/admin-notification.use-cases";
import { DeadLetterNotificationUseCase } from "./application/use-cases/dead-letter-notification.use-case";
import { QueueNotificationUseCase } from "./application/use-cases/queue-notification.use-case";
import { SendNotificationUseCase } from "./application/use-cases/send-notification.use-case";
import { PrismaNotificationDeadLetterRepository } from "./infrastructure/persistence/prisma-notification-dead-letter.repository";
import { PrismaNotificationRepository } from "./infrastructure/persistence/prisma-notification.repository";
import { ExpoPushSender } from "./infrastructure/senders/expo-push-sender";
import { MockPushSender } from "./infrastructure/senders/mock-push-sender";
import { MockSmsSender } from "./infrastructure/senders/mock-sms-sender";
import { NetgsmSmsSender } from "./infrastructure/senders/netgsm-sms-sender";
import { TemplateRenderer } from "./infrastructure/templates/template-renderer";
import { NotificationWorker } from "./infrastructure/workers/notification.worker";
import { AdminNotificationsController } from "./interface/controllers/admin-notifications.controller";
import { NotificationsTestController } from "./interface/controllers/notifications-test.controller";

const isProduction = process.env.NODE_ENV === "production";

import type { Env } from "../../config/env";

const NETGSM_LOGGER_TOKEN = getLoggerToken(NetgsmSmsSender.name);
const MOCK_LOGGER_TOKEN = getLoggerToken(MockSmsSender.name);
const MOCK_PUSH_LOGGER_TOKEN = getLoggerToken(MockPushSender.name);
const EXPO_PUSH_LOGGER_TOKEN = getLoggerToken(ExpoPushSender.name);

/**
 * Notifications module — A4e-1 / A4e-2 / A4e-3.
 *
 * Wires the SMS + push provider abstractions and the outbox listener
 * that bridges in-process events to the BullMQ queue.
 *
 * Factories:
 *   SMS — NETGSM_USERCODE starts with `DUMMY_` → MockSmsSender,
 *         otherwise NetgsmSmsSender (ADR 0021).
 *   PUSH — EXPO_PUSH_PROJECT_ID is empty OR starts with `DUMMY_` →
 *          MockPushSender, otherwise ExpoPushSender. The empty default
 *          in env.ts means dev + test work with no Expo account; A4g
 *          flips a real UUID into the env to light up the gateway.
 *
 * IdentityModule is imported because the OutboxNotificationListener
 * resolves recipient phone + push token via UserRepositoryPort (kept
 * PII-free in outbox payloads, A4b discipline).
 */
@Module({
  imports: [
    forwardRef(() => IdentityModule),
    BookingModule,
    SupplyModule,
    BullModule.registerQueue({ name: NOTIFICATION_QUEUE_NAME }),
  ],
  controllers: [
    AdminNotificationsController,
    ...(isProduction ? [] : [NotificationsTestController]),
  ],
  providers: [
    TemplateRenderer,
    { provide: TEMPLATE_RENDERER_PORT, useExisting: TemplateRenderer },
    { provide: NOTIFICATION_REPOSITORY_PORT, useClass: PrismaNotificationRepository },
    {
      provide: NOTIFICATION_DEAD_LETTER_REPOSITORY_PORT,
      useClass: PrismaNotificationDeadLetterRepository,
    },
    NotificationContextProvider,
    DeadLetterNotificationUseCase,
    MockSmsSender,
    NetgsmSmsSender,
    MockPushSender,
    ExpoPushSender,
    {
      provide: SMS_SENDER_PORT,
      useFactory: (
        config: ConfigService<Env, true>,
        mockLogger: PinoLogger,
        netgsmLogger: PinoLogger,
      ): SmsSenderPort => {
        const userCode = config.get("NETGSM_USERCODE", { infer: true });
        if (userCode.startsWith("DUMMY_")) {
          return new MockSmsSender(mockLogger);
        }
        return new NetgsmSmsSender(config, netgsmLogger);
      },
      inject: [ConfigService, MOCK_LOGGER_TOKEN, NETGSM_LOGGER_TOKEN],
    },
    {
      provide: PUSH_SENDER_PORT,
      useFactory: (
        config: ConfigService<Env, true>,
        mockLogger: PinoLogger,
        expoLogger: PinoLogger,
      ): PushSenderPort => {
        const projectId = config.get("EXPO_PUSH_PROJECT_ID", { infer: true });
        if (projectId === "" || projectId.startsWith("DUMMY_")) {
          return new MockPushSender(mockLogger);
        }
        return new ExpoPushSender(expoLogger);
      },
      inject: [ConfigService, MOCK_PUSH_LOGGER_TOKEN, EXPO_PUSH_LOGGER_TOKEN],
    },
    QueueNotificationUseCase,
    SendNotificationUseCase,
    ListNotificationsUseCase,
    RetryNotificationUseCase,
    ListDeadLettersUseCase,
    MarkDeadLetterInvestigatedUseCase,
    OutboxNotificationListener,
    NotificationWorker,
  ],
  exports: [
    SMS_SENDER_PORT,
    PUSH_SENDER_PORT,
    TEMPLATE_RENDERER_PORT,
    MockSmsSender,
    MockPushSender,
  ],
})
export class NotificationsModule {}
