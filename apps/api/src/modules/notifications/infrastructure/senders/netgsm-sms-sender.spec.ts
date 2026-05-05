import { type ConfigService } from "@nestjs/config";
import axios from "axios";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { NetgsmSmsSender } from "./netgsm-sms-sender";
import { NotificationSendFailedError } from "../../domain/errors/notification-errors";

import type { Env } from "../../../../config/env";

vi.mock("axios", async (importOriginal) => {
  const mod = await importOriginal<typeof import("axios")>();
  return {
    ...mod,
    default: {
      ...mod.default,
      create: vi.fn(),
    },
  };
});

const config = {
  get: (key: string) => {
    const m: Record<string, string> = {
      NETGSM_USERCODE: "REAL_USER",
      NETGSM_PASSWORD: "REAL_PASS",
      NETGSM_SENDER: "EVENTFLEET",
    };
    return m[key];
  },
} as unknown as ConfigService<Env, true>;

const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };

function build(postImpl: (...args: unknown[]) => unknown) {
  const fakeClient = { post: vi.fn(postImpl) };
  vi.mocked(axios.create).mockReturnValue(fakeClient as never);
  return { sender: new NetgsmSmsSender(config, logger as never), fakeClient };
}

describe("NetgsmSmsSender", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns providerMessageId on '00 <id>' success response", async () => {
    const { sender, fakeClient } = build(() => Promise.resolve({ data: "00 abcdef12345" }));
    const r = await sender.send({ phone: "+905551112233", message: "hi" });
    expect(r.providerMessageId).toBe("abcdef12345");
    expect(r.sentAt).toBeInstanceOf(Date);
    expect(fakeClient.post).toHaveBeenCalledOnce();
    const [path, body] = fakeClient.post.mock.calls[0]!;
    expect(path).toBe("/sms/send/xml");
    // Phone goes in without the leading +
    expect(body).toContain("<no>905551112233</no>");
    expect(body).toContain("<usercode>REAL_USER</usercode>");
    expect(body).toContain("<msgheader>EVENTFLEET</msgheader>");
    expect(body).toContain("<![CDATA[hi]]>");
  });

  it("throws NotificationSendFailedError on Netgsm rejection code (e.g. 20)", async () => {
    const { sender } = build(() => Promise.resolve({ data: "20" }));
    await expect(sender.send({ phone: "+905551112233", message: "hi" })).rejects.toBeInstanceOf(
      NotificationSendFailedError,
    );
  });

  it("throws NotificationSendFailedError on transport error", async () => {
    const { sender } = build(() => Promise.reject(new Error("ECONNREFUSED")));
    await expect(sender.send({ phone: "+905551112233", message: "hi" })).rejects.toBeInstanceOf(
      NotificationSendFailedError,
    );
  });

  it("accepts '01' and '02' as success codes too (Netgsm docs)", async () => {
    const { sender: s1 } = build(() => Promise.resolve({ data: "01 id-01" }));
    expect((await s1.send({ phone: "+905551112233", message: "x" })).providerMessageId).toBe(
      "id-01",
    );
    const { sender: s2 } = build(() => Promise.resolve({ data: "02 id-02" }));
    expect((await s2.send({ phone: "+905551112233", message: "x" })).providerMessageId).toBe(
      "id-02",
    );
  });
});
