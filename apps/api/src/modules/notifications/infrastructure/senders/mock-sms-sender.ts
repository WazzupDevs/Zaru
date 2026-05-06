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

  // Cross-instance test buffer. The factory in NotificationsModule
  // produces fresh MockSmsSender instances per app boot, but e2e
  // tests rely on a process-global view (the legacy A2c surface).
  // Keep both: instance methods for clean DI inspection,
  // static helpers for the e2e import path.
  private static globalInbox: MockSmsRecord[] = [];

  // Failure injection for retry/DLQ tests. When >0, the next N sends
  // throw before recording. failAlways forces every send to throw
  // (overrides the counter). A4-Stab integration specs use these.
  private failNextN = 0;
  private failAlways = false;

  constructor(
    @InjectPinoLogger(MockSmsSender.name)
    private readonly logger: PinoLogger,
  ) {}

  send(input: SmsSendInput): Promise<SmsSendResult> {
    if (this.failAlways || this.failNextN > 0) {
      if (this.failNextN > 0) this.failNextN -= 1;
      this.logger.debug(
        { event: "mock_sms_forced_failure", recipientPhone: input.phone },
        "[MOCK SMS] simulated failure",
      );
      return Promise.reject(new Error("mock sms failure"));
    }
    const providerMessageId = `mock-${randomUUID()}`;
    const sentAt = new Date();
    const record: MockSmsRecord = {
      phone: input.phone,
      message: input.message,
      sentAt,
      providerMessageId,
      sourceId: input.sourceId ?? null,
    };
    this.inbox.push(record);
    MockSmsSender.globalInbox.push(record);
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

  /** Make the next `count` sends throw. Used by retry tests. */
  failNext(count: number): void {
    this.failNextN = count;
  }

  /** Force every send to throw until clearFailure(). Used by DLQ tests. */
  failAll(): void {
    this.failAlways = true;
  }

  /** Reset both failure modes. */
  clearFailure(): void {
    this.failNextN = 0;
    this.failAlways = false;
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

  // ---- Legacy A2c-compatible static surface (used by e2e tests) ----
  // The old identity MockSmsSender exposed these. We preserve them so
  // existing test fixtures keep working after the move; new tests
  // should prefer the instance methods above (cleaner DI surface).
  static _testOnlyGetLast(phone: string): { body: string; sentAt: Date } | undefined {
    if (process.env.NODE_ENV === "production") {
      throw new Error("MockSmsSender._testOnlyGetLast is not available in production");
    }
    for (let i = MockSmsSender.globalInbox.length - 1; i >= 0; i--) {
      const r = MockSmsSender.globalInbox[i];
      if (r?.phone === phone) return { body: r.message, sentAt: r.sentAt };
    }
    return undefined;
  }

  static _testOnlyReset(): void {
    MockSmsSender.globalInbox = [];
  }
}
