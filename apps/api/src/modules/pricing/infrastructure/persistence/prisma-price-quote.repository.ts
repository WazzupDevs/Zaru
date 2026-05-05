import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";

import {
  QuoteAlreadyConsumedError,
  QuoteExpiredError,
  QuoteNotFoundError,
} from "../../domain/errors/pricing-errors";

import type { TxClient } from "../../../../common/persistence/tx-client";
import type {
  CreatePriceQuoteInput,
  PriceQuoteEntity,
  PriceQuoteRepositoryPort,
} from "../../application/ports/price-quote.repository.port";
import type { PriceBreakdownJson } from "../../domain/value-objects/price-breakdown.vo";

@Injectable()
export class PrismaPriceQuoteRepository implements PriceQuoteRepositoryPort {
  async create(tx: TxClient, input: CreatePriceQuoteInput): Promise<PriceQuoteEntity> {
    const row = await tx.priceQuote.create({
      data: {
        requestedByUserId: input.requestedByUserId,
        vehicleTypeId: input.vehicleTypeId,
        categoryId: input.categoryId,
        pickupLat: new Prisma.Decimal(input.pickupLat),
        pickupLng: new Prisma.Decimal(input.pickupLng),
        pickupAddress: input.pickupAddress,
        dropoffLat: new Prisma.Decimal(input.dropoffLat),
        dropoffLng: new Prisma.Decimal(input.dropoffLng),
        dropoffAddress: input.dropoffAddress,
        distanceKm: new Prisma.Decimal(input.distanceKm),
        durationMinutes: input.durationMinutes,
        eventStartAt: input.eventStartAt,
        eventEndAt: input.eventEndAt,
        durationHours: new Prisma.Decimal(input.durationHours),
        breakdown: input.breakdown as unknown as Prisma.InputJsonValue,
        totalAmount: new Prisma.Decimal(input.totalAmount),
        currency: input.currency,
        selectedAddons: input.selectedAddons,
        expiresAt: input.expiresAt,
      },
    });
    return toEntity(row);
  }

  async findById(tx: TxClient, id: string): Promise<PriceQuoteEntity | null> {
    const row = await tx.priceQuote.findUnique({ where: { id } });
    return row ? toEntity(row) : null;
  }

  /**
   * Atomic ACTIVE → CONSUMED. updateMany returns count=0 when status was
   * already CONSUMED/EXPIRED or expiresAt has passed; we then fetch the
   * row to throw the precise domain error.
   */
  async consumeQuote(
    tx: TxClient,
    id: string,
    bookingId: string,
    now: Date,
  ): Promise<PriceQuoteEntity> {
    const result = await tx.priceQuote.updateMany({
      where: { id, status: "ACTIVE", expiresAt: { gt: now } },
      data: {
        status: "CONSUMED",
        consumedAt: now,
        consumedByBookingId: bookingId,
      },
    });

    if (result.count === 0) {
      const existing = await tx.priceQuote.findUnique({ where: { id } });
      if (!existing) throw new QuoteNotFoundError();
      // Order matters: explicit EXPIRED status comes before the
      // CONSUMED check, otherwise a row the cleanup worker has
      // already moved to EXPIRED would surface as "already consumed".
      if (existing.status === "EXPIRED") throw new QuoteExpiredError();
      if (existing.status === "CONSUMED") throw new QuoteAlreadyConsumedError();
      if (existing.expiresAt.getTime() <= now.getTime()) throw new QuoteExpiredError();
      // If we reach here something else mutated the row concurrently.
      throw new QuoteAlreadyConsumedError();
    }

    const updated = await tx.priceQuote.findUnique({ where: { id } });
    if (!updated) throw new QuoteNotFoundError();
    return toEntity(updated);
  }

  async expireOlderThan(tx: TxClient, now: Date): Promise<PriceQuoteEntity[]> {
    const candidates = await tx.priceQuote.findMany({
      where: { status: "ACTIVE", expiresAt: { lte: now } },
      select: { id: true },
      take: 500,
    });
    if (candidates.length === 0) return [];

    const expired: PriceQuoteEntity[] = [];
    for (const c of candidates) {
      const result = await tx.priceQuote.updateMany({
        where: { id: c.id, status: "ACTIVE" },
        data: { status: "EXPIRED" },
      });
      if (result.count === 1) {
        const row = await tx.priceQuote.findUnique({ where: { id: c.id } });
        if (row) expired.push(toEntity(row));
      }
    }
    return expired;
  }
}

function toEntity(
  row: Awaited<ReturnType<TxClient["priceQuote"]["findFirstOrThrow"]>>,
): PriceQuoteEntity {
  return {
    id: row.id,
    requestedByUserId: row.requestedByUserId,
    vehicleTypeId: row.vehicleTypeId,
    categoryId: row.categoryId,
    pickupLat: row.pickupLat.toString(),
    pickupLng: row.pickupLng.toString(),
    pickupAddress: row.pickupAddress,
    dropoffLat: row.dropoffLat.toString(),
    dropoffLng: row.dropoffLng.toString(),
    dropoffAddress: row.dropoffAddress,
    distanceKm: row.distanceKm.toFixed(2),
    durationMinutes: row.durationMinutes,
    eventStartAt: row.eventStartAt,
    eventEndAt: row.eventEndAt,
    durationHours: row.durationHours.toFixed(2),
    breakdown: row.breakdown as unknown as PriceBreakdownJson,
    totalAmount: row.totalAmount.toFixed(2),
    currency: row.currency,
    selectedAddons: row.selectedAddons,
    status: row.status,
    expiresAt: row.expiresAt,
    consumedAt: row.consumedAt,
    consumedByBookingId: row.consumedByBookingId,
    createdAt: row.createdAt,
  };
}
