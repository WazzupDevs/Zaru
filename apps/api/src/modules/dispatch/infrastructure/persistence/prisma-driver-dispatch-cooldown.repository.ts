import { Injectable } from "@nestjs/common";

import type { TxClient } from "../../../../common/persistence/tx-client";
import type {
  DriverDispatchCooldownRecord,
  DriverDispatchCooldownRepositoryPort,
  FindActiveCooldownInput,
  UpsertCooldownInput,
} from "../../application/ports/driver-dispatch-cooldown.repository.port";

@Injectable()
export class PrismaDriverDispatchCooldownRepository implements DriverDispatchCooldownRepositoryPort {
  async upsert(tx: TxClient, input: UpsertCooldownInput): Promise<DriverDispatchCooldownRecord> {
    const row = await tx.driverDispatchCooldown.upsert({
      where: {
        driverProfileId_bookingId: {
          driverProfileId: input.driverProfileId,
          bookingId: input.bookingId,
        },
      },
      create: {
        driverProfileId: input.driverProfileId,
        bookingId: input.bookingId,
        expiresAt: input.expiresAt,
      },
      update: { expiresAt: input.expiresAt },
    });
    return row;
  }

  async findActive(
    tx: TxClient,
    input: FindActiveCooldownInput,
  ): Promise<DriverDispatchCooldownRecord | null> {
    const row = await tx.driverDispatchCooldown.findUnique({
      where: {
        driverProfileId_bookingId: {
          driverProfileId: input.driverProfileId,
          bookingId: input.bookingId,
        },
      },
    });
    if (!row) return null;
    return row.expiresAt > input.now ? row : null;
  }

  async deleteExpired(tx: TxClient, now: Date): Promise<number> {
    const result = await tx.driverDispatchCooldown.deleteMany({
      where: { expiresAt: { lt: now } },
    });
    return result.count;
  }
}
