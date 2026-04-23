import { describe, it, expect } from "vitest";

import { OtpRequestSchema } from "./otp.js";

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
