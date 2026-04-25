#!/usr/bin/env tsx
/**
 * Promote an existing user to ADMIN. ADR 0015.
 *
 *   pnpm api:promote-admin +905551234567
 *
 * The user must already exist (registered via OTP). The promotion writes a
 * `identity.UserRolePromoted` event to the outbox so we have an audit trail
 * of every admin elevation, including the actor channel ("cli").
 */
import { randomUUID } from "node:crypto";

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const phone = process.argv[2];
  if (phone === undefined || phone === "") {
    // eslint-disable-next-line no-console
    console.error("Usage: pnpm api:promote-admin <phone>");
    // eslint-disable-next-line no-console
    console.error("Example: pnpm api:promote-admin +905551234567");
    process.exit(1);
  }
  if (!/^\+90(5)\d{9}$/.test(phone)) {
    // eslint-disable-next-line no-console
    console.error(`✗ Invalid Turkish mobile in E.164 format: ${phone}`);
    process.exit(1);
  }

  const user = await prisma.user.findFirst({
    where: { phoneE164: phone, deletedAt: null },
  });
  if (!user) {
    // eslint-disable-next-line no-console
    console.error(`✗ User not found: ${phone}`);
    // eslint-disable-next-line no-console
    console.error("  User must register via OTP first before promotion.");
    process.exit(1);
  }
  if (user.role === "ADMIN") {
    // eslint-disable-next-line no-console
    console.log(`✓ User ${phone} is already ADMIN — no change.`);
    return;
  }

  const previousRole = user.role;
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { role: "ADMIN" } });
    await tx.outboxEvent.create({
      data: {
        id: randomUUID(),
        aggregateType: "User",
        aggregateId: user.id,
        eventType: "identity.UserRolePromoted",
        payload: {
          userId: user.id,
          previousRole,
          newRole: "ADMIN",
          promotedAt: new Date().toISOString(),
          promotedVia: "cli",
        },
      },
    });
  });

  // eslint-disable-next-line no-console
  console.log(`✓ User ${phone} promoted from ${previousRole} to ADMIN.`);
  // eslint-disable-next-line no-console
  console.log("  Audit trail written to outbox_events as identity.UserRolePromoted.");
}

main()
  .catch((err: unknown) => {
    // eslint-disable-next-line no-console
    console.error("Error:", err);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
