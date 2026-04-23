import { Injectable } from "@nestjs/common";
import { InjectPinoLogger, PinoLogger } from "nestjs-pino";

import type { SmsMessage, SmsSenderPort } from "../../application/ports/sms-sender.port";

/**
 * Development / test SMS sender — logs the message body (which contains
 * the OTP code) at DEBUG level only. Production must wire NetgsmSmsSender.
 *
 * This sender is intentionally noisy in dev so the founder can read the OTP
 * straight from the API logs without an SMS provider account.
 */
@Injectable()
export class MockSmsSender implements SmsSenderPort {
  constructor(
    @InjectPinoLogger(MockSmsSender.name)
    private readonly logger: PinoLogger,
  ) {}

  send(message: SmsMessage): Promise<void> {
    this.logger.debug({ to: message.to, body: message.body }, "[MOCK SMS] would send");
    return Promise.resolve();
  }
}
