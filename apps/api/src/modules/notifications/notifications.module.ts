import { BullModule } from "@nestjs/bullmq";
import { forwardRef, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { getLoggerToken, PinoLogger } from "nestjs-pino";

import { BookingModule } from "../booking/booking.module";
import { IdentityModule } from "../identity/identity.module";
import { SupplyModule } from "../supply/supply.module";
import { OutboxNotificationListener } from "./application/listeners/outbox-notification.listener";
import { NOTIFICATION_QUEUE_NAME } from "./application/notification-queue.constants";
import { NOTIFICATION_REPOSITORY_PORT } from "./application/ports/notification.repository.port";
import { SMS_SENDER_PORT, type SmsSenderPort } from "./application/ports/sms-sender.port";
import { TEMPLATE_RENDERER_PORT } from "./application/ports/template-renderer.port";
import { NotificationContextProvider } from "./application/services/notification-context.provider";
import { QueueNotificationUseCase } from "./application/use-cases/queue-notification.use-case";
import { SendNotificationUseCase } from "./application/use-cases/send-notification.use-case";
import { PrismaNotificationRepository } from "./infrastructure/persistence/prisma-notification.repository";
import { MockSmsSender } from "./infrastructure/senders/mock-sms-sender";
import { NetgsmSmsSender } from "./infrastructure/senders/netgsm-sms-sender";
import { TemplateRenderer } from "./infrastructure/templates/template-renderer";
import { NotificationWorker } from "./infrastructure/workers/notification.worker";

import type { Env } from "../../config/env";

const NETGSM_LOGGER_TOKEN = getLoggerToken(NetgsmSmsSender.name);
const MOCK_LOGGER_TOKEN = getLoggerToken(MockSmsSender.name);

/**
 * Notifications module — A4e-1.
 *
 * Wires the SMS provider abstraction (factory: dummy NETGSM_USERCODE
 * → MockSmsSender, otherwise NetgsmSmsSender) and the outbox listener
 * that bridges in-process events to the BullMQ queue. Exports the
 * SmsSenderPort + TemplateRenderer so IdentityModule can render and
 * send the OTP SMS without keeping its own copy of the adapters.
 *
 * IdentityModule is imported because the OutboxNotificationListener
 * resolves recipient phones via UserRepositoryPort (kept PII-free in
 * outbox payloads, A4b discipline).
 */
@Module({
  imports: [
    forwardRef(() => IdentityModule),
    // BookingModule + SupplyModule have no back-import to Notifications,
    // so plain imports are safe (no forwardRef needed). The listener's
    // NotificationContextProvider injects BOOKING_REPOSITORY_PORT,
    // DRIVER_PROFILE_REPOSITORY_PORT, VEHICLE_REPOSITORY_PORT.
    BookingModule,
    SupplyModule,
    BullModule.registerQueue({ name: NOTIFICATION_QUEUE_NAME }),
  ],
  providers: [
    TemplateRenderer,
    { provide: TEMPLATE_RENDERER_PORT, useExisting: TemplateRenderer },
    { provide: NOTIFICATION_REPOSITORY_PORT, useClass: PrismaNotificationRepository },
    NotificationContextProvider,
    MockSmsSender,
    NetgsmSmsSender,
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
    QueueNotificationUseCase,
    SendNotificationUseCase,
    OutboxNotificationListener,
    NotificationWorker,
  ],
  // SmsSenderPort + TemplateRenderer for IdentityModule (OTP).
  // MockSmsSender exported by name so smoke + integration tests can
  // peek into the inbox in dev/test.
  exports: [SMS_SENDER_PORT, TEMPLATE_RENDERER_PORT, MockSmsSender],
})
export class NotificationsModule {}
