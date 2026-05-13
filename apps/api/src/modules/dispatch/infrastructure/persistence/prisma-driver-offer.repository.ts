import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";

import { ACTIVE_OFFER_STATUSES } from "../../domain/driver-offer-types";

import type { TxClient } from "../../../../common/persistence/tx-client";
import type {
  CreateDriverOfferInput,
  DriverOfferRepositoryPort,
  ListOffersForDriverInput,
  TransitionOfferStatusInput,
} from "../../application/ports/driver-offer.repository.port";
import type { DriverOfferEntity } from "../../domain/driver-offer-types";

@Injectable()
export class PrismaDriverOfferRepository implements DriverOfferRepositoryPort {
  async create(tx: TxClient, input: CreateDriverOfferInput): Promise<DriverOfferEntity> {
    const row = await tx.driverOffer.create({
      data: {
        bookingId: input.bookingId,
        driverProfileId: input.driverProfileId,
        vehicleId: input.vehicleId,
        expiresAt: input.expiresAt,
        matchedDistanceKm: new Prisma.Decimal(input.matchedDistanceKm),
        matchedScore: new Prisma.Decimal(input.matchedScore),
      },
    });
    return row;
  }

  async findById(tx: TxClient, id: string): Promise<DriverOfferEntity | null> {
    return tx.driverOffer.findUnique({ where: { id } });
  }

  async transitionStatus(
    tx: TxClient,
    input: TransitionOfferStatusInput,
  ): Promise<DriverOfferEntity | null> {
    const result = await tx.driverOffer.updateMany({
      where: { id: input.offerId, version: input.fromVersion },
      data: {
        status: input.toStatus,
        version: { increment: 1 },
        ...(input.fields ?? {}),
      },
    });
    if (result.count === 0) return null;
    return tx.driverOffer.findUnique({ where: { id: input.offerId } });
  }

  async findActiveByDriverId(tx: TxClient, driverProfileId: string): Promise<DriverOfferEntity[]> {
    return tx.driverOffer.findMany({
      where: {
        driverProfileId,
        status: { in: [...ACTIVE_OFFER_STATUSES] },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async findActiveByBookingId(tx: TxClient, bookingId: string): Promise<DriverOfferEntity | null> {
    return tx.driverOffer.findFirst({
      where: {
        bookingId,
        status: { in: [...ACTIVE_OFFER_STATUSES] },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async findPriorDriverIdsForBooking(tx: TxClient, bookingId: string): Promise<string[]> {
    const rows = await tx.driverOffer.findMany({
      where: { bookingId },
      select: { driverProfileId: true },
    });
    return rows.map((r) => r.driverProfileId);
  }

  async findExpiredPending(tx: TxClient, now: Date, limit: number): Promise<DriverOfferEntity[]> {
    return tx.driverOffer.findMany({
      where: { status: "PENDING", expiresAt: { lt: now } },
      orderBy: { expiresAt: "asc" },
      take: limit,
    });
  }

  async list(tx: TxClient, input: ListOffersForDriverInput): Promise<DriverOfferEntity[]> {
    return tx.driverOffer.findMany({
      where: {
        driverProfileId: input.driverProfileId,
        ...(input.status && input.status.length > 0 ? { status: { in: [...input.status] } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: input.limit,
    });
  }
}
