import { z } from "zod";

import { PhoneE164Schema } from "../common/phone.js";
import { UuidSchema } from "../common/uuid.js";

/**
 * A4f-1 — driver invitation whitelist API contracts.
 *
 * Admin endpoints under /admin/driver-invites use these for create + list +
 * revoke. The driver auth flow itself doesn't expose the invite id — it
 * just gates on the phone via /auth/driver/otp/request.
 */

export const DriverInviteStatusSchema = z.enum(["PENDING", "ACCEPTED", "REVOKED"]);
export type DriverInviteStatusValue = z.infer<typeof DriverInviteStatusSchema>;

export const CreateDriverInviteInputSchema = z.object({
  phone: PhoneE164Schema,
  notes: z.string().trim().max(500).nullable().optional(),
});
export type CreateDriverInviteInput = z.infer<typeof CreateDriverInviteInputSchema>;

export const ListDriverInvitesQuerySchema = z.object({
  status: DriverInviteStatusSchema.optional(),
  cursor: UuidSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});
export type ListDriverInvitesQuery = z.infer<typeof ListDriverInvitesQuerySchema>;

export const DriverInviteResponseSchema = z.object({
  id: UuidSchema,
  phoneE164: PhoneE164Schema,
  status: DriverInviteStatusSchema,
  invitedAt: z.string().datetime(),
  acceptedAt: z.string().datetime().nullable(),
  acceptedUserId: UuidSchema.nullable(),
  invitedByAdminId: UuidSchema,
  notes: z.string().nullable(),
});
export type DriverInviteResponse = z.infer<typeof DriverInviteResponseSchema>;

/**
 * Driver OTP endpoints reuse the customer OTP DTO shapes — same body, the
 * difference is the route + the whitelist gate. We re-export aliases so the
 * controller's pipe wires cleanly without grabbing the customer-named type.
 */
export const DriverOtpRequestInputSchema = z.object({
  phone: PhoneE164Schema,
});
export type DriverOtpRequestInput = z.infer<typeof DriverOtpRequestInputSchema>;
