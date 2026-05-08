import pino from "pino";
import { describe, it, expect } from "vitest";

/**
 * Verifies that the redaction paths used by buildLoggerConfig actually
 * scrub sensitive fields. We instantiate a bare pino logger with the same
 * redact paths and assert the output contains "[Redacted]" instead of the
 * sensitive value.
 */
const REDACT_PATHS = [
  "req.headers.authorization",
  "req.headers.cookie",
  "req.body.otp",
  "req.body.password",
  "req.body.phoneE164",
  "req.body.tokenHash",
  "req.body.expoPushToken",
  "*.phoneE164",
  "*.tokenHash",
  "*.password",
  "*.otp",
  "*.expoPushToken",
  "*.recipientPushToken",
];

function captureLog(message: string, payload: unknown): string {
  let captured = "";
  const stream = {
    write(chunk: string): void {
      captured += chunk;
    },
  };
  const log = pino({ redact: { paths: REDACT_PATHS, censor: "[Redacted]" } }, stream);
  log.info(payload, message);
  return captured;
}

describe("logger redaction", () => {
  it("redacts Authorization header", () => {
    const out = captureLog("auth header", {
      req: { headers: { authorization: "Bearer supersecret-token-123" } },
    });
    expect(out).not.toContain("supersecret-token-123");
    expect(out).toContain("[Redacted]");
  });

  it("redacts cookie header", () => {
    const out = captureLog("cookie header", {
      req: { headers: { cookie: "session=abcdef-secret" } },
    });
    expect(out).not.toContain("abcdef-secret");
    expect(out).toContain("[Redacted]");
  });

  it("redacts request body OTP and password", () => {
    const out = captureLog("body", {
      req: { body: { otp: "123456", password: "hunter2" } },
    });
    expect(out).not.toContain("123456");
    expect(out).not.toContain("hunter2");
  });

  it("redacts phoneE164 and tokenHash anywhere via wildcard", () => {
    const out = captureLog("nested", {
      user: { phoneE164: "+905551234567", tokenHash: "abc123hash" },
    });
    expect(out).not.toContain("+905551234567");
    expect(out).not.toContain("abc123hash");
  });

  it("redacts expoPushToken anywhere via wildcard (A4e-3)", () => {
    const out = captureLog("user_loaded", {
      user: { id: "u1", expoPushToken: "ExponentPushToken[abc123]" },
    });
    expect(out).not.toContain("ExponentPushToken[abc123]");
    expect(out).toContain("[Redacted]");
  });

  it("redacts recipientPushToken on notification rows (A4e-3)", () => {
    const out = captureLog("notification_sent", {
      notification: { id: "n1", recipientPushToken: "ExponentPushToken[xyz]" },
    });
    expect(out).not.toContain("ExponentPushToken[xyz]");
    expect(out).toContain("[Redacted]");
  });

  it("redacts expoPushToken in controller request body (A4e-3)", () => {
    const out = captureLog("patch_push_token", {
      req: { body: { expoPushToken: "ExponentPushToken[push]" } },
    });
    expect(out).not.toContain("ExponentPushToken[push]");
    expect(out).toContain("[Redacted]");
  });

  it("does not redact non-sensitive fields", () => {
    const out = captureLog("ok", {
      user: { displayName: "Ahmet" },
    });
    expect(out).toContain("Ahmet");
  });
});
