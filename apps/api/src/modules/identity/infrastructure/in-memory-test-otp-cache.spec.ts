import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { InMemoryTestOtpCache, NoopTestOtpCache } from "./in-memory-test-otp-cache";

describe("InMemoryTestOtpCache", () => {
  let cache: InMemoryTestOtpCache;
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    cache = new InMemoryTestOtpCache();
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    vi.useRealTimers();
  });

  it("records and retrieves the latest code per phone", () => {
    cache.record("+905551112233", "123456");
    const entry = cache.getLast("+905551112233");
    expect(entry).not.toBeNull();
    expect(entry?.code).toBe("123456");
    expect(entry?.issuedAt).toBeInstanceOf(Date);
  });

  it("overwrites previous code on second record", () => {
    cache.record("+905551112233", "111111");
    cache.record("+905551112233", "222222");
    expect(cache.getLast("+905551112233")?.code).toBe("222222");
  });

  it("returns null after TTL (60s) expires", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-05T12:00:00Z"));
    cache.record("+905551112233", "123456");
    vi.setSystemTime(new Date("2026-05-05T12:01:01Z"));
    expect(cache.getLast("+905551112233")).toBeNull();
  });

  it("returns null for unknown phone", () => {
    expect(cache.getLast("+905559998877")).toBeNull();
  });

  it("record is no-op when NODE_ENV=production", () => {
    process.env.NODE_ENV = "production";
    cache.record("+905551112233", "123456");
    process.env.NODE_ENV = originalEnv;
    expect(cache.getLast("+905551112233")).toBeNull();
  });

  it("getLast returns null when NODE_ENV=production even if cache populated", () => {
    cache.record("+905551112233", "123456");
    process.env.NODE_ENV = "production";
    expect(cache.getLast("+905551112233")).toBeNull();
  });

  it("reset clears all entries", () => {
    cache.record("+905551112233", "123456");
    cache.record("+905554443322", "654321");
    cache.reset();
    expect(cache.getLast("+905551112233")).toBeNull();
    expect(cache.getLast("+905554443322")).toBeNull();
  });
});

describe("NoopTestOtpCache", () => {
  it("getLast always returns null", () => {
    const cache = new NoopTestOtpCache();
    cache.record("+905551112233", "123456");
    expect(cache.getLast("+905551112233")).toBeNull();
  });
});
