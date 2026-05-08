import { Injectable } from "@nestjs/common";
import { InjectPinoLogger, PinoLogger } from "nestjs-pino";

import {
  type PushSenderPort,
  type PushSendInput,
  type PushSendResult,
} from "../../application/ports/push-sender.port";

/**
 * Production push adapter — placeholder for the real Expo gateway call.
 *
 * The real wiring lands in A4g (production deploy + EAS Build) when
 * the project finally has an Expo account + projectId. For now this
 * adapter throws — the factory in notifications.module.ts only selects
 * it when EXPO_PUSH_PROJECT_ID is a real UUID, so dev and test never
 * reach this code path. Throwing (rather than no-op succeeding) means
 * a misconfigured prod env fails fast rather than silently dropping
 * push notifications.
 *
 * When A4g activates this:
 *   1. `pnpm add expo-server-sdk` in apps/api
 *   2. `new Expo()` in the constructor
 *   3. `expo.sendPushNotificationsAsync([{ to, title, body, data }])`
 *      → ExpoPushTicket → providerMessageId from `ticket.id`
 *   4. handle DeviceNotRegistered errors by clearing the user's token
 *      via UpdatePushTokenUseCase (cleanup loop)
 *
 * Until then: explicit "not wired" error.
 */
@Injectable()
export class ExpoPushSender implements PushSenderPort {
  constructor(
    @InjectPinoLogger(ExpoPushSender.name)
    private readonly logger: PinoLogger,
  ) {}

  send(input: PushSendInput): Promise<PushSendResult> {
    this.logger.error(
      { event: "expo_push_not_wired", expoPushToken: input.expoPushToken },
      "ExpoPushSender invoked but the real gateway is wired in A4g",
    );
    return Promise.reject(
      new Error(
        "ExpoPushSender not yet wired — set EXPO_PUSH_PROJECT_ID to a DUMMY_ value to use MockPushSender",
      ),
    );
  }
}
