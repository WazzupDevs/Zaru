import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";

import type { TxClient } from "../../../../common/persistence/tx-client";
import type { BookingEntity } from "../../domain/booking-types";
import type {
  BookingListFilter,
  BookingRepositoryPort,
  CreateBookingInput,
  TransitionBookingStatusInput,
} from "../../domain/ports/booking.repository.port";

@Injectable()
export class PrismaBookingRepository implements BookingRepositoryPort {
  async create(tx: TxClient, input: CreateBookingInput): Promise<BookingEntity> {
    const row = await tx.booking.create({
      data: {
        ...(input.id ? { id: input.id } : {}),
        customerId: input.customerId,
        priceQuoteId: input.priceQuoteId,
        status: input.status,
        vehicleTypeId: input.vehicleTypeId,
        categoryId: input.categoryId,
        pickupLat: new Prisma.Decimal(input.pickupLat),
        pickupLng: new Prisma.Decimal(input.pickupLng),
        pickupAddress: input.pickupAddress,
        dropoffLat: new Prisma.Decimal(input.dropoffLat),
        dropoffLng: new Prisma.Decimal(input.dropoffLng),
        dropoffAddress: input.dropoffAddress,
        eventStartAt: input.eventStartAt,
        eventEndAt: input.eventEndAt,
        totalAmount: new Prisma.Decimal(input.totalAmount),
        currency: input.currency,
        ...(input.confirmedAt ? { confirmedAt: input.confirmedAt } : {}),
      },
    });
    return toEntity(row);
  }

  async findById(tx: TxClient, id: string): Promise<BookingEntity | null> {
    const row = await tx.booking.findFirst({ where: { id, deletedAt: null } });
    return row ? toEntity(row) : null;
  }

  async transitionStatus(
    tx: TxClient,
    input: TransitionBookingStatusInput,
  ): Promise<BookingEntity | null> {
    const result = await tx.booking.updateMany({
      where: { id: input.id, version: input.fromVersion, deletedAt: null },
      data: {
        status: input.toStatus,
        version: { increment: 1 },
        ...(input.fields ?? {}),
      },
    });
    if (result.count === 0) return null;
    const updated = await tx.booking.findFirst({
      where: { id: input.id, deletedAt: null },
    });
    return updated ? toEntity(updated) : null;
  }

  async expireDraftsOlderThan(tx: TxClient, cutoff: Date, now: Date): Promise<BookingEntity[]> {
    // Two-step: SELECT ids first (so we can return the entities), then
    // UPDATE only those ids. Avoids the worker losing a row to a
    // concurrent write between fetch and update.
    const candidates = await tx.booking.findMany({
      where: {
        status: "DRAFT",
        createdAt: { lt: cutoff },
        deletedAt: null,
      },
      select: { id: true, version: true },
      take: 100,
    });
    if (candidates.length === 0) return [];

    const updated: BookingEntity[] = [];
    for (const c of candidates) {
      const result = await tx.booking.updateMany({
        where: { id: c.id, version: c.version, status: "DRAFT" },
        data: {
          status: "EXPIRED",
          expiredAt: now,
          version: { increment: 1 },
        },
      });
      if (result.count === 1) {
        const row = await tx.booking.findFirst({ where: { id: c.id } });
        if (row) updated.push(toEntity(row));
      }
    }
    return updated;
  }

  async listForCustomer(tx: TxClient, filter: BookingListFilter): Promise<BookingEntity[]> {
    const limit = Math.min(Math.max(filter.limit ?? 20, 1), 100);
    const rows = await tx.booking.findMany({
      where: {
        deletedAt: null,
        ...(filter.customerId ? { customerId: filter.customerId } : {}),
        ...(filter.status ? { status: filter.status } : {}),
        ...(filter.cursor ? { id: { lt: filter.cursor } } : {}),
      },
      orderBy: { id: "desc" },
      take: limit,
    });
    return rows.map(toEntity);
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
    vehicleTypeId: row.vehicleTypeId,
    categoryId: row.categoryId,
    pickupLat: row.pickupLat,
    pickupLng: row.pickupLng,
    pickupAddress: row.pickupAddress,
    dropoffLat: row.dropoffLat,
    dropoffLng: row.dropoffLng,
    dropoffAddress: row.dropoffAddress,
    eventStartAt: row.eventStartAt,
    eventEndAt: row.eventEndAt,
    totalAmount: row.totalAmount,
    currency: row.currency,
    confirmedAt: row.confirmedAt,
    driverAssignedAt: row.driverAssignedAt,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    cancelledAt: row.cancelledAt,
    expiredAt: row.expiredAt,
    cancellationReason: row.cancellationReason,
    cancelledByUserId: row.cancelledByUserId,
    driverId: row.driverId,
    vehicleId: row.vehicleId,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
