import { Injectable } from "@nestjs/common";

import type { TestOtpCachePort } from "../application/ports/test-otp-cache.port";

/**
 * In-memory implementation. Wired only when NODE_ENV !== production
 * (see IdentityModule). 60-second TTL — long enough for a smoke script,
 * short enough that a forgotten code never lingers across test runs.
 */
@Injectable()
export class InMemoryTestOtpCache implements TestOtpCachePort {
  private readonly cache = new Map<string, { code: string; issuedAt: Date }>();
  private readonly ttlMs = 60_000;

  record(phone: string, code: string): void {
    if (process.env.NODE_ENV === "production") return;
    this.cache.set(phone, { code, issuedAt: new Date() });
  }

  getLast(phone: string): { code: string; issuedAt: Date } | null {
    if (process.env.NODE_ENV === "production") return null;
    const entry = this.cache.get(phone);
    if (!entry) return null;
    if (Date.now() - entry.issuedAt.getTime() > this.ttlMs) {
      this.cache.delete(phone);
      return null;
    }
    return entry;
  }

  reset(): void {
    this.cache.clear();
  }
}

/**
 * No-op stub bound in production. record() drops on the floor, getLast()
 * always returns null. Defense in depth — the controller is also unbound
 * in production.
 */
@Injectable()
export class NoopTestOtpCache implements TestOtpCachePort {
  record(phone: string, code: string): void {
    void phone;
    void code;
  }
  getLast(phone: string): { code: string; issuedAt: Date } | null {
    void phone;
    return null;
  }
  reset(): void {
    // no-op
  }
}
