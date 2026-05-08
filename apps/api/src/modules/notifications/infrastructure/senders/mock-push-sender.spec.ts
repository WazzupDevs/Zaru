import { beforeEach, describe, expect, it } from "vitest";

import { MockPushSender } from "./mock-push-sender";

import type { PinoLogger } from "nestjs-pino";

const VALID_TOKEN = "ExponentPushToken[abc123]";

function silentLogger(): PinoLogger {
  const noop = (): void => undefined;
  return { debug: noop, info: noop, warn: noop, error: noop } as never;
}

describe("MockPushSender", () => {
  let sender: MockPushSender;

  beforeEach(() => {
    sender = new MockPushSender(silentLogger());
    MockPushSender._testOnlyReset();
  });

  it("happy path — send records into the inbox + returns providerMessageId + sentAt", async () => {
    const result = await sender.send({
      expoPushToken: VALID_TOKEN,
      title: "Rezervasyon Onaylandı",
      body: "15 Ağustos 2026",
    });

    expect(result.providerMessageId).toMatch(/^mock-push-/);
    expect(result.sentAt).toBeInstanceOf(Date);
    expect(sender.getInbox()).toHaveLength(1);
    const record = sender.getInbox()[0]!;
    expect(record.expoPushToken).toBe(VALID_TOKEN);
    expect(record.title).toBe("Rezervasyon Onaylandı");
    expect(record.body).toBe("15 Ağustos 2026");
    expect(record.data).toBeNull();
  });

  it("preserves the data payload when provided", async () => {
    await sender.send({
      expoPushToken: VALID_TOKEN,
      title: "t",
      body: "b",
      data: { bookingId: "abc-123", screen: "BookingDetail" },
    });
    expect(sender.getInbox()[0]?.data).toEqual({
      bookingId: "abc-123",
      screen: "BookingDetail",
    });
  });

  it("getLastFor returns the most recent record for a token", async () => {
    await sender.send({ expoPushToken: VALID_TOKEN, title: "first", body: "b1" });
    await sender.send({ expoPushToken: VALID_TOKEN, title: "second", body: "b2" });
    const last = sender.getLastFor(VALID_TOKEN);
    expect(last?.title).toBe("second");
  });

  it("getLastFor returns undefined for an unknown token", () => {
    expect(sender.getLastFor("ExponentPushToken[never-used]")).toBeUndefined();
  });

  it("failNext throws once then succeeds (retry happy path)", async () => {
    sender.failNext(1);

    await expect(
      sender.send({ expoPushToken: VALID_TOKEN, title: "t", body: "b" }),
    ).rejects.toThrow(/mock push failure/);

    const second = await sender.send({
      expoPushToken: VALID_TOKEN,
      title: "t",
      body: "b",
    });
    expect(second.providerMessageId).toMatch(/^mock-push-/);
    expect(sender.getInbox()).toHaveLength(1);
  });

  it("failAll throws every time until clearFailure", async () => {
    sender.failAll();
    await expect(
      sender.send({ expoPushToken: VALID_TOKEN, title: "t", body: "b" }),
    ).rejects.toThrow();
    await expect(
      sender.send({ expoPushToken: VALID_TOKEN, title: "t", body: "b" }),
    ).rejects.toThrow();

    sender.clearFailure();
    await sender.send({ expoPushToken: VALID_TOKEN, title: "t", body: "b" });
    expect(sender.getInbox()).toHaveLength(1);
  });

  it("clear() empties the inbox without resetting failure state", async () => {
    await sender.send({ expoPushToken: VALID_TOKEN, title: "t", body: "b" });
    expect(sender.getInbox()).toHaveLength(1);
    sender.clear();
    expect(sender.getInbox()).toHaveLength(0);
  });
});
