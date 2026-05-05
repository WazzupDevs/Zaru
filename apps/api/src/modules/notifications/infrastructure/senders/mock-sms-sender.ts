import { randomUUID } from "node:crypto";

import { Injectable } from "@nestjs/common";
import { InjectPinoLogger, PinoLogger } from "nestjs-pino";

import {
  type SmsSenderPort,
  type SmsSendInput,
  type SmsSendResult,
} from "../../application/ports/sms-sender.port";

export interface MockSmsRecord {
  phone: string;
  message: string;
  sentAt: Date;
  providerMessageId: string;
  sourceId: string | null;
}

/**
 * Dev/test SMS adapter. Records every send into an in-memory inbox
 * so smoke scripts and integration tests can assert delivery without
 * an external provider. Logs at DEBUG with the phone masked
 * (last-4 only) — pino's `*.recipientPhone` redact still applies.
 *
 * Replaces the legacy `identity.MockSmsSender`. Identity's
 * `_testOnlyGetLast` helper continues to live there as a separate
 * `TestOtpCachePort` (A4b) so OTP plaintext smoke flow keeps its own
 * audit-clean abstraction.
 */
@Injectable()
export class MockSmsSender implements SmsSenderPort {
  private readonly inbox: MockSmsRecord[] = [];

  constructor(
    @InjectPinoLogger(MockSmsSender.name)
    private readonly logger: PinoLogger,
  ) {}

  send(input: SmsSendInput): Promise<SmsSendResult> {
    const providerMessageId = `mock-${randomUUID()}`;
    const sentAt = new Date();
    this.inbox.push({
      phone: input.phone,
      message: input.message,
      sentAt,
      providerMessageId,
      sourceId: input.sourceId ?? null,
    });
    this.logger.debug(
      {
        event: "mock_sms_sent",
        recipientPhone: input.phone,
        messageLength: input.message.length,
        providerMessageId,
        sourceId: input.sourceId,
      },
      "[MOCK SMS] sent",
    );
    return Promise.resolve({ providerMessageId, sentAt });
  }

  /** Test/smoke helper. */
  getInbox(): readonly MockSmsRecord[] {
    return this.inbox;
  }

  /** Returns the most recent record for a phone, or undefined. */
  getLastFor(phone: string): MockSmsRecord | undefined {
    for (let i = this.inbox.length - 1; i >= 0; i--) {
      const record = this.inbox[i];
      if (record?.phone === phone) return record;
    }
    return undefined;
  }

  clear(): void {
    this.inbox.length = 0;
  }
}
