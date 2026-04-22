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
  "*.phoneE164",
  "*.tokenHash",
  "*.password",
  "*.otp",
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

  it("does not redact non-sensitive fields", () => {
    const out = captureLog("ok", {
      user: { displayName: "Ahmet" },
    });
    expect(out).toContain("Ahmet");
  });
});
