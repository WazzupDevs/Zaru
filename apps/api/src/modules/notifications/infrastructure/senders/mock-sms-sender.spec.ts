import { describe, expect, it, vi } from "vitest";

import { MockSmsSender } from "./mock-sms-sender";

function build(): MockSmsSender {
  const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  return new MockSmsSender(logger as never);
}

describe("MockSmsSender", () => {
  it("records a send and returns providerMessageId + sentAt", async () => {
    const s = build();
    const r = await s.send({ phone: "+905551112233", message: "hi", sourceId: "n-1" });
    expect(r.providerMessageId).toMatch(/^mock-/);
    expect(r.sentAt).toBeInstanceOf(Date);
    expect(s.getInbox()).toHaveLength(1);
  });

  it("getLastFor returns the most recent record for the matching phone", async () => {
    const s = build();
    await s.send({ phone: "+905551112233", message: "first" });
    await s.send({ phone: "+905554443322", message: "other" });
    await s.send({ phone: "+905551112233", message: "second" });
    expect(s.getLastFor("+905551112233")?.message).toBe("second");
    expect(s.getLastFor("+905559999999")).toBeUndefined();
  });

  it("clear() empties the inbox", async () => {
    const s = build();
    await s.send({ phone: "+905551112233", message: "hi" });
    s.clear();
    expect(s.getInbox()).toHaveLength(0);
  });
});
