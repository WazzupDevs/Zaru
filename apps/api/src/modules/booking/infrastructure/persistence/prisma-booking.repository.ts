import { Injectable } from "@nestjs/common";

import type { TxClient } from "../../../../common/persistence/tx-client";
import type { BookingEntity } from "../../domain/booking-types";
import type {
  BookingRepositoryPort,
  CreateBookingInput,
} from "../../domain/ports/booking.repository.port";

@Injectable()
export class PrismaBookingRepository implements BookingRepositoryPort {
  async create(tx: TxClient, input: CreateBookingInput): Promise<BookingEntity> {
    const row = await tx.booking.create({
      data: { customerId: input.customerId, priceQuoteId: input.priceQuoteId },
    });
    return toEntity(row);
  }

  async findById(tx: TxClient, id: string): Promise<BookingEntity | null> {
    const row = await tx.booking.findUnique({ where: { id } });
    return row ? toEntity(row) : null;
  }
}

function toEntity(
  row: Awaited<ReturnType<TxClient["booking"]["findFirstOrThrow"]>>,
): BookingEntity {
  return {
    id: row.id,
    customerId: row.customerId,
    priceQuoteId: row.priceQuoteId,
    status: row.status,
    version: row.version,
    createdAt: row.createdAt,
  };
}
