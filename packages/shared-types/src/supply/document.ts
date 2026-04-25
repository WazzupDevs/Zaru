import { z } from "zod";

import { UuidSchema } from "../common/uuid.js";

export const DocumentTypeSchema = z.enum([
  "DRIVER_LICENSE",
  "VEHICLE_REGISTRATION",
  "INSURANCE",
  "KASKO",
  "AUTHORITY_CERTIFICATE",
  "IDENTITY_CARD",
]);
export type DocumentType = z.infer<typeof DocumentTypeSchema>;

export const DocumentStatusSchema = z.enum(["UPLOADED", "APPROVED", "REJECTED", "EXPIRED"]);
export type DocumentStatus = z.infer<typeof DocumentStatusSchema>;

/** Whitelist mirrors apps/api/src/common/storage/storage-key-builder.ts. */
export const UploadMimeTypeSchema = z.enum(["application/pdf", "image/jpeg", "image/png"]);
export type UploadMimeType = z.infer<typeof UploadMimeTypeSchema>;

export const RequestDocumentUploadInputSchema = z.object({
  type: DocumentTypeSchema,
  fileName: z.string().min(1).max(255),
  fileSize: z.number().int().positive(),
  mimeType: UploadMimeTypeSchema,
  /** Optional — for vehicle-specific documents (registration, insurance, kasko). */
  vehicleId: UuidSchema.optional(),
  /** ISO date strings; server stores as DATE. */
  issuedAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "issuedAt must be YYYY-MM-DD")
    .optional(),
  expiresAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "expiresAt must be YYYY-MM-DD")
    .optional(),
});
export type RequestDocumentUploadInput = z.infer<typeof RequestDocumentUploadInputSchema>;

export const RequestDocumentUploadResponseSchema = z.object({
  documentId: UuidSchema,
  uploadUrl: z.string().url(),
  publicUrl: z.string().url(),
  expiresAt: z.string().datetime(),
  maxSizeBytes: z.number().int(),
});
export type RequestDocumentUploadResponse = z.infer<typeof RequestDocumentUploadResponseSchema>;

export const ReviewDocumentInputSchema = z
  .object({
    decision: z.enum(["APPROVE", "REJECT"]),
    rejectionReason: z.string().min(5).max(500).optional(),
  })
  .refine(
    (v) =>
      v.decision === "APPROVE" || (v.rejectionReason !== undefined && v.rejectionReason.length > 0),
    { message: "rejectionReason is required when decision is REJECT", path: ["rejectionReason"] },
  );
export type ReviewDocumentInput = z.infer<typeof ReviewDocumentInputSchema>;

export const DocumentResponseSchema = z.object({
  id: UuidSchema,
  driverProfileId: UuidSchema,
  vehicleId: UuidSchema.nullable(),
  type: DocumentTypeSchema,
  fileName: z.string(),
  fileSize: z.number().int(),
  mimeType: z.string(),
  status: DocumentStatusSchema,
  rejectionReason: z.string().nullable(),
  issuedAt: z.string().nullable(),
  expiresAt: z.string().nullable(),
  reviewedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});
export type DocumentResponse = z.infer<typeof DocumentResponseSchema>;
