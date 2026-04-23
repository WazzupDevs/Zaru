import { z } from "zod";

/**
 * TR-only mobile (5XX prefix) in E.164 format.
 * Decision rationale: see ADR 0003 §7 — limits SMS-pumping fraud surface.
 * If B2B / international users land, ADR 0003 §7 lays out the relaxation
 * path (generic E.164 + rate-limit + CAPTCHA + country whitelist).
 */
export const PhoneE164Schema = z
  .string()
  .regex(/^\+90(5)\d{9}$/, "Must be a valid Turkish mobile in E.164 format (e.g. +905551234567)");

export type PhoneE164 = z.infer<typeof PhoneE164Schema>;
