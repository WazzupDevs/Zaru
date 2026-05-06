import { describe, expect, it, vi } from "vitest";

import { Logger, __setLogSink, redactPii } from "./logger";

interface SinkCall {
  level: "debug" | "info" | "warn" | "error";
  args: unknown[];
}

function captureSink(): { calls: SinkCall[]; restore: () => void } {
  const calls: SinkCall[] = [];
  const restore = __setLogSink({
    debug: (...args) => calls.push({ level: "debug", args }),
    info: (...args) => calls.push({ level: "info", args }),
    warn: (...args) => calls.push({ level: "warn", args }),
    error: (...args) => calls.push({ level: "error", args }),
  });
  return { calls, restore };
}

describe("Logger", () => {
  it("info emits [INFO] event prefix to the info sink", () => {
    const { calls, restore } = captureSink();
    Logger.info("user_logged_in");
    restore();
    expect(calls).toHaveLength(1);
    expect(calls[0]?.level).toBe("info");
    expect(calls[0]?.args[0]).toBe("[INFO] user_logged_in");
  });

  it("warn emits [WARN] event prefix to the warn sink", () => {
    const { calls, restore } = captureSink();
    Logger.warn("token_refresh_failed");
    restore();
    expect(calls[0]?.level).toBe("warn");
    expect(calls[0]?.args[0]).toBe("[WARN] token_refresh_failed");
  });

  it("error emits [ERROR] event prefix to the error sink", () => {
    const { calls, restore } = captureSink();
    Logger.error("api_call_panic");
    restore();
    expect(calls[0]?.level).toBe("error");
  });

  it("attaches non-PII meta as a second argument", () => {
    const { calls, restore } = captureSink();
    Logger.info("quote_requested", { vehicleTypeId: "abc-123", addonCount: 2 });
    restore();
    expect(calls[0]?.args[1]).toEqual({ vehicleTypeId: "abc-123", addonCount: 2 });
  });

  it("masks phone-like field values to last-4 stars", () => {
    const { calls, restore } = captureSink();
    Logger.warn("push_registration_failed", { recipientPhone: "+905551112233" });
    restore();
    expect(calls[0]?.args[1]).toEqual({ recipientPhone: "+90555111****" });
  });

  it("debug is suppressed when __DEV__ is false (production bundle)", () => {
    (globalThis as { __DEV__?: boolean }).__DEV__ = false;
    const { calls, restore } = captureSink();
    Logger.debug("cache_hit", { key: "categories.wedding-car" });
    Logger.info("still_runs");
    restore();
    delete (globalThis as { __DEV__?: boolean }).__DEV__;
    expect(calls).toHaveLength(1);
    expect(calls[0]?.args[0]).toBe("[INFO] still_runs");
  });

  it("debug runs when __DEV__ is true", () => {
    (globalThis as { __DEV__?: boolean }).__DEV__ = true;
    const { calls, restore } = captureSink();
    Logger.debug("cache_hit");
    restore();
    delete (globalThis as { __DEV__?: boolean }).__DEV__;
    expect(calls).toHaveLength(1);
  });
});

describe("redactPii", () => {
  it("masks last-4 of phone, token, recipient*, secret, password fields", () => {
    expect(
      redactPii({
        phone: "+905551112233",
        accessToken: "long-jwt-string-abcdefg",
        recipientPhone: "+905559876543",
        password: "hunter2",
        secretKey: "ABCDEF",
      }),
    ).toEqual({
      phone: "+90555111****",
      accessToken: "long-jwt-string-abc****",
      recipientPhone: "+90555987****",
      password: "hun****",
      secretKey: "AB****",
    });
  });

  it("collapses short PII values (≤4 chars) to '****'", () => {
    expect(redactPii({ token: "abc" })).toEqual({ token: "****" });
    expect(redactPii({ token: "" })).toEqual({ token: "" }); // empty stays empty
  });

  it("leaves non-PII keys untouched", () => {
    expect(
      redactPii({ id: "1", phone: "+905551112233", count: 42, vehicleTypeId: "vt-1" }),
    ).toEqual({
      id: "1",
      phone: "+90555111****",
      count: 42,
      vehicleTypeId: "vt-1",
    });
  });

  it("handles non-string PII values without crashing", () => {
    expect(redactPii({ phone: null, token: 12345 })).toEqual({ phone: null, token: 12345 });
  });
});

describe("Logger meta shape", () => {
  it("does not pass an empty meta object as a second arg", () => {
    const { calls, restore } = captureSink();
    Logger.info("event_no_meta");
    restore();
    expect(calls[0]?.args).toHaveLength(1);
  });

  // Vitest uses vi.fn under the hood — sanity check the spy works as a sink.
  it("works with a vi.fn sink", () => {
    const fn = vi.fn();
    const restore = __setLogSink({ debug: fn, info: fn, warn: fn, error: fn });
    Logger.info("ok");
    restore();
    expect(fn).toHaveBeenCalledOnce();
  });
});
