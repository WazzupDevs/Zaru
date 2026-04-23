import { Injectable } from "@nestjs/common";
import { InjectPinoLogger, PinoLogger } from "nestjs-pino";

import type { SmsMessage, SmsSenderPort } from "../../application/ports/sms-sender.port";

/**
 * Development / test SMS sender — logs the message body (which contains
 * the OTP code) at DEBUG level only. Production must wire NetgsmSmsSender
 * via SMS_DRIVER=netgsm.
 *
 * Also exposes the last few OTP messages keyed by phone number so e2e
 * tests can read the plaintext code without scraping logs. The accessor
 * THROWS in production — this state is dev/test only.
 */
@Injectable()
export class MockSmsSender implements SmsSenderPort {
  private static readonly lastByPhone = new Map<string, { body: string; sentAt: Date }>();

  constructor(
    @InjectPinoLogger(MockSmsSender.name)
    private readonly logger: PinoLogger,
  ) {}

  send(message: SmsMessage): Promise<void> {
    this.logger.debug({ to: message.to }, "[MOCK SMS] would send");
    MockSmsSender.lastByPhone.set(message.to, { body: message.body, sentAt: new Date() });
    return Promise.resolve();
  }

  /**
   * E2E helper. Returns the last SMS body sent to `phone`, or undefined.
   * Forbidden in production — throws so a misuse fails fast.
   */
  static _testOnlyGetLast(phone: string): { body: string; sentAt: Date } | undefined {
    if (process.env.NODE_ENV === "production") {
      throw new Error("MockSmsSender._testOnlyGetLast is not available in production");
    }
    return MockSmsSender.lastByPhone.get(phone);
  }

  /** Test cleanup. */
  static _testOnlyReset(): void {
    MockSmsSender.lastByPhone.clear();
  }
}
