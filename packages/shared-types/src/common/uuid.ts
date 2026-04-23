import { z } from "zod";

/**
 * Accepts any RFC-compliant UUID string. The platform writes v7 going forward
 * (ADR 0006) but legacy v4 ids from initial tables remain valid.
 */
export const UuidSchema = z.string().uuid();
export type Uuid = z.infer<typeof UuidSchema>;
