import { randomUUID } from "node:crypto";

import { Injectable } from "@nestjs/common";
import { InjectPinoLogger, PinoLogger } from "nestjs-pino";

import {
  type PushSenderPort,
  type PushSendInput,
  type PushSendResult,
} from "../../application/ports/push-sender.port";

export interface MockPushRecord {
  expoPushToken: string;
  title: string;
  body: string;
  data: Record<string, string> | null;
  sentAt: Date;
  providerMessageId: string;
  sourceId: string | null;
}

/**
 * Dev/test push adapter. Mirror image of MockSmsSender — same failure-
 * injection surface (failNext / failAll / clearFailure) so the retry +
 * DLQ specs that already exercise SMS retry can exercise the push
 * branch with the same shape.
 *
 * Records every send into both an instance inbox (clean DI inspection)
 * and a process-global inbox (legacy e2e import path) so tests can
 * peek at delivery without a real Expo round-trip.
 *
 * Logs at DEBUG. The `*.expoPushToken` redact path (A4e-3) masks the
 * token in any structured log output.
 */
@Injectable()
export class MockPushSender implements PushSenderPort {
  private readonly inbox: MockPushRecord[] = [];
  private static globalInbox: MockPushRecord[] = [];

  private failNextN = 0;
  private failAlways = false;

  constructor(
    @InjectPinoLogger(MockPushSender.name)
    private readonly logger: PinoLogger,
  ) {}

  send(input: PushSendInput): Promise<PushSendResult> {
    if (this.failAlways || this.failNextN > 0) {
      if (this.failNextN > 0) this.failNextN -= 1;
      this.logger.debug(
        { event: "mock_push_forced_failure", expoPushToken: input.expoPushToken },
        "[MOCK PUSH] simulated failure",
      );
      return Promise.reject(new Error("mock push failure"));
    }
    const providerMessageId = `mock-push-${randomUUID()}`;
    const sentAt = new Date();
    const record: MockPushRecord = {
      expoPushToken: input.expoPushToken,
      title: input.title,
      body: input.body,
      data: input.data ?? null,
      sentAt,
      providerMessageId,
      sourceId: input.sourceId ?? null,
    };
    this.inbox.push(record);
    MockPushSender.globalInbox.push(record);
    this.logger.debug(
      {
        event: "mock_push_sent",
        expoPushToken: input.expoPushToken,
        title: input.title,
        bodyLength: input.body.length,
        providerMessageId,
        sourceId: input.sourceId,
      },
      "[MOCK PUSH] sent",
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

  clearFailure(): void {
    this.failNextN = 0;
    this.failAlways = false;
  }

  getInbox(): readonly MockPushRecord[] {
    return this.inbox;
  }

  /** Returns the most recent record for a given Expo token, or undefined. */
  getLastFor(expoPushToken: string): MockPushRecord | undefined {
    for (let i = this.inbox.length - 1; i >= 0; i--) {
      const record = this.inbox[i];
      if (record?.expoPushToken === expoPushToken) return record;
    }
    return undefined;
  }

  clear(): void {
    this.inbox.length = 0;
  }

  static _testOnlyReset(): void {
    MockPushSender.globalInbox = [];
  }
}
