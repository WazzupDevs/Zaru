import { uniquePhone } from "./phone-factory";

import type { PrismaClient, UserRole } from "@prisma/client";

export interface UserBuilderInput {
  phoneE164?: string;
  displayName?: string | null;
  role?: UserRole;
  /** Mark phone as verified (default true — most tests skip the OTP loop). */
  phoneVerified?: boolean;
  /** A4e-3 — pre-populate the Expo push token so the listener picks PUSH. */
  expoPushToken?: string | null;
}

export interface BuiltUser {
  id: string;
  phoneE164: string;
  displayName: string | null;
  role: UserRole;
  expoPushToken: string | null;
}

/**
 * Inserts a user row directly into the test DB and returns the
 * minimal shape the tests need. Bypasses the OTP/JWT flow because
 * most integration suites only care about `userId` for
 * cross-module reads (Booking customerId, Notifications recipient).
 *
 * For end-to-end auth flows that must exercise OTP, build a user via
 * the auth controller instead — see auth.controller.e2e-spec.ts.
 */
export async function buildUser(
  prisma: PrismaClient,
  input: UserBuilderInput = {},
): Promise<BuiltUser> {
  const phoneE164 = input.phoneE164 ?? uniquePhone();
  const created = await prisma.user.create({
    data: {
      phoneE164,
      displayName: input.displayName === undefined ? "Test Müşteri" : input.displayName,
      role: input.role ?? "CUSTOMER",
      phoneVerifiedAt: input.phoneVerified === false ? null : new Date(),
      ...(input.expoPushToken !== undefined
        ? { expoPushToken: input.expoPushToken, pushTokenUpdatedAt: new Date() }
        : {}),
    },
  });
  return {
    id: created.id,
    phoneE164: created.phoneE164,
    displayName: created.displayName,
    role: created.role,
    expoPushToken: created.expoPushToken,
  };
}
