import { z } from "zod";

import { UuidSchema } from "../common/uuid.js";

export const DriverOnboardingStatusSchema = z.enum([
  "DRAFT",
  "DOCUMENTS_PENDING",
  "APPROVED",
  "REJECTED",
  "SUSPENDED",
]);
export type DriverOnboardingStatus = z.infer<typeof DriverOnboardingStatusSchema>;

/**
 * What the client sends when applying as a driver. PII (nationalId, iban) is
 * only on the wire — the server hashes both and never echoes plaintext back.
 */
export const CreateDriverProfileInputSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  // 11 digits — VO does the strict checksum check on the server.
  nationalId: z.string().regex(/^\d{11}$/, "TCKN must be 11 digits"),
  // ISO date (YYYY-MM-DD).
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "birthDate must be YYYY-MM-DD"),
  // TR IBAN — server VO validates mod-97.
  iban: z.string().regex(/^TR\d{24}$/, "IBAN must be Turkish format (TR + 24 digits)"),
});
export type CreateDriverProfileInput = z.infer<typeof CreateDriverProfileInputSchema>;

/** Update is only allowed on DRAFT profiles. Hashed fields are immutable. */
export const UpdateDriverProfileInputSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
});
export type UpdateDriverProfileInput = z.infer<typeof UpdateDriverProfileInputSchema>;

/**
 * Response shape — note the absence of nationalId / nationalIdHash / iban /
 * ibanHash. Only ibanLast4 is safe for display.
 */
export const DriverProfileResponseSchema = z.object({
  id: UuidSchema,
  userId: UuidSchema,
  firstName: z.string(),
  lastName: z.string(),
  ibanLast4: z.string().length(4),
  status: DriverOnboardingStatusSchema,
  rejectionReason: z.string().nullable(),
  approvedAt: z.string().datetime().nullable(),
  commissionRate: z.string(), // Decimal serialized
  createdAt: z.string().datetime(),
});
export type DriverProfileResponse = z.infer<typeof DriverProfileResponseSchema>;

export const RejectDriverInputSchema = z.object({
  rejectionReason: z.string().min(5).max(500),
});
export type RejectDriverInput = z.infer<typeof RejectDriverInputSchema>;
