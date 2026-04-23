import { describe, it, expect } from "vitest";

import { OtpRequestSchema, OtpVerifySchema, AuthTokensSchema } from "./otp.js";

describe("OtpRequestSchema", () => {
  it("defaults channel to SMS when omitted", () => {
    const parsed = OtpRequestSchema.parse({ phone: "+905551234567" });
    expect(parsed).toEqual({ phone: "+905551234567", channel: "SMS" });
  });

  it("accepts explicit SMS channel", () => {
    const parsed = OtpRequestSchema.parse({ phone: "+905551234567", channel: "SMS" });
    expect(parsed.channel).toBe("SMS");
  });

  it("rejects invalid phone format", () => {
    expect(() => OtpRequestSchema.parse({ phone: "+15551234567" })).toThrow();
  });

  it("rejects unknown channel", () => {
    expect(() => OtpRequestSchema.parse({ phone: "+905551234567", channel: "EMAIL" })).toThrow();
  });
});

describe("OtpVerifySchema", () => {
  const valid = {
    phone: "+905551234567",
    requestId: "01890d8e-3b9c-7000-8000-000000000000",
    code: "123456",
  };

  it("accepts a valid 6-digit code", () => {
    const parsed = OtpVerifySchema.parse(valid);
    expect(parsed.code).toBe("123456");
  });

  it("accepts an optional deviceId", () => {
    const parsed = OtpVerifySchema.parse({ ...valid, deviceId: "ios:abcdef" });
    expect(parsed.deviceId).toBe("ios:abcdef");
  });

  it("rejects a 5-digit code", () => {
    expect(() => OtpVerifySchema.parse({ ...valid, code: "12345" })).toThrow();
  });

  it("rejects a non-numeric code", () => {
    expect(() => OtpVerifySchema.parse({ ...valid, code: "abcdef" })).toThrow();
  });

  it("rejects an invalid requestId (not UUID)", () => {
    expect(() => OtpVerifySchema.parse({ ...valid, requestId: "not-a-uuid" })).toThrow();
  });
});

describe("AuthTokensSchema", () => {
  const valid = {
    accessToken: "eyJhbGc...",
    refreshToken: "abc123base64url",
    accessTokenExpiresAt: "2026-04-23T05:00:00.000Z",
    refreshTokenExpiresAt: "2026-05-23T05:00:00.000Z",
    user: {
      id: "01890d8e-3b9c-7000-8000-000000000000",
      phoneE164: "+905551234567",
      role: "CUSTOMER" as const,
      displayName: null,
    },
  };

  it("parses a complete tokens response", () => {
    const parsed = AuthTokensSchema.parse(valid);
    expect(parsed.user.role).toBe("CUSTOMER");
  });

  it("rejects unknown role", () => {
    expect(() =>
      AuthTokensSchema.parse({ ...valid, user: { ...valid.user, role: "ROOT" } }),
    ).toThrow();
  });
});
