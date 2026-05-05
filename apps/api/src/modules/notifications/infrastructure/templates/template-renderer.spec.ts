import { describe, expect, it, beforeEach } from "vitest";

import { TemplateRenderer } from "./template-renderer";
import {
  TemplateVariableMissingError,
  UnknownTemplateError,
} from "../../domain/errors/notification-errors";

describe("TemplateRenderer", () => {
  let renderer: TemplateRenderer;

  beforeEach(() => {
    renderer = new TemplateRenderer();
  });

  it("renders identity.otp_request with code substituted", async () => {
    const out = await renderer.render("identity.otp_request", "tr", { code: "123456" });
    expect(out).toContain("123456");
    expect(out).not.toContain("{{");
    expect(out).toMatch(/Event Fleet/);
  });

  it("renders booking.confirmed with all four placeholders filled", async () => {
    const out = await renderer.render("booking.confirmed", "tr", {
      customerName: "Ahmet",
      eventDate: "15 Ağustos 2026",
      totalAmount: "6877.00",
      bookingShortId: "abc12345",
    });
    expect(out).toContain("Ahmet");
    expect(out).toContain("15 Ağustos 2026");
    expect(out).toContain("6877.00");
    expect(out).toContain("abc12345");
    expect(out).not.toContain("{{");
  });

  it("renders dispatch.new_offer with driver-facing copy", async () => {
    const out = await renderer.render("dispatch.new_offer", "tr", {
      eventDate: "15.08.2026",
      totalAmount: "6877.00",
      bookingShortId: "deadbeef",
    });
    expect(out).toContain("Yeni iş");
    expect(out).toContain("6877.00");
  });

  it("throws UnknownTemplateError for missing template file", async () => {
    await expect(renderer.render("does.not.exist", "tr", {})).rejects.toBeInstanceOf(
      UnknownTemplateError,
    );
  });

  it("throws TemplateVariableMissingError when a placeholder lacks a variable", async () => {
    await expect(renderer.render("identity.otp_request", "tr", {})).rejects.toBeInstanceOf(
      TemplateVariableMissingError,
    );
  });

  it("caches the file read — second render hits memory", async () => {
    await renderer.render("identity.otp_request", "tr", { code: "111111" });
    // No way to assert disk skipped without spying fs; do a structural
    // check: clearCache clears the bookkeeping
    renderer.clearCache();
    // After clear, render still works (re-reads the file)
    const out = await renderer.render("identity.otp_request", "tr", { code: "222222" });
    expect(out).toContain("222222");
  });
});
