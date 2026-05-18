import { Inject, Injectable } from "@nestjs/common";

import { TX_RUNNER_PORT, type TxRunnerPort } from "../../../../common/persistence/tx-runner.port";
import {
  BOOKING_REPOSITORY_PORT,
  type BookingRepositoryPort,
} from "../../../booking/domain/ports/booking.repository.port";
import {
  DRIVER_PROFILE_REPOSITORY_PORT,
  type DriverProfileRecord,
  type DriverProfileRepositoryPort,
} from "../../../supply/application/ports/driver-profile.repository.port";
import { DriverProfileNotFoundError } from "../../domain/errors/dispatch-errors";
import {
  DRIVER_OFFER_REPOSITORY_PORT,
  type DriverOfferRepositoryPort,
} from "../ports/driver-offer.repository.port";
import { calculateDriverEarnings } from "../services/driver-offer-view-helpers";

import type { DriverOfferSummaryView } from "./driver-offer-view-types";
import type { TxClient } from "../../../../common/persistence/tx-client";
import type { BookingEntity } from "../../../booking/domain/booking-types";
import type { DriverOfferEntity, DriverOfferStatus } from "../../domain/driver-offer-types";

export interface ListDriverOfferHistoryInput {
  driverUserId: string;
  status?: readonly DriverOfferStatus[];
  /** Default 20; cap upstream at the controller. */
  limit?: number;
}

const DEFAULT_LIMIT = 20;

/**
 * Driver "geçmiş işlerim" view. Light enrichment — pickup address and
 * eventStartAt from booking, driver earnings from commissionRate —
 * but no full booking detail (BookingDetail screen uses
 * GetDriverOfferUseCase for that).
 *
 * Bookings are fetched in a single batch read after we know the offer
 * set, so the call is O(1) tx round-trips regardless of `limit`.
 */
@Injectable()
export class ListDriverOfferHistoryUseCase {
  constructor(
    @Inject(DRIVER_OFFER_REPOSITORY_PORT)
    private readonly offerRepo: DriverOfferRepositoryPort,
    @Inject(DRIVER_PROFILE_REPOSITORY_PORT)
    private readonly driverRepo: DriverProfileRepositoryPort,
    @Inject(BOOKING_REPOSITORY_PORT)
    private readonly bookingRepo: BookingRepositoryPort,
    @Inject(TX_RUNNER_PORT) private readonly tx: TxRunnerPort,
  ) {}

  async execute(input: ListDriverOfferHistoryInput): Promise<DriverOfferSummaryView[]> {
    return this.tx.run(async (tx) => {
      const driver = await this.driverRepo.findActiveByUserId(tx, input.driverUserId);
      if (!driver) throw new DriverProfileNotFoundError();

      const offers = await this.offerRepo.list(tx, {
        driverProfileId: driver.id,
        ...(input.status ? { status: input.status } : {}),
        limit: input.limit ?? DEFAULT_LIMIT,
      });
      if (offers.length === 0) return [];

      const bookings = await fetchBookingsForOffers(tx, this.bookingRepo, offers);
      const bookingById = new Map(bookings.map((b) => [b.id, b]));

      return offers.map((offer) => toSummary(offer, bookingById.get(offer.bookingId), driver));
    });
  }
}

async function fetchBookingsForOffers(
  tx: TxClient,
  bookingRepo: BookingRepositoryPort,
  offers: readonly DriverOfferEntity[],
): Promise<BookingEntity[]> {
  const ids = Array.from(new Set(offers.map((o) => o.bookingId)));
  const rows = await Promise.all(ids.map((id) => bookingRepo.findById(tx, id)));
  return rows.filter((b): b is BookingEntity => b !== null);
}

function toSummary(
  offer: DriverOfferEntity,
  booking: BookingEntity | undefined,
  driver: DriverProfileRecord,
): DriverOfferSummaryView {
  const earnings = booking
    ? calculateDriverEarnings(booking.totalAmount, driver.commissionRate, booking.currency)
    : { amount: "0.00", currency: "TRY" };

  return {
    offerId: offer.id,
    bookingId: offer.bookingId,
    status: offer.status,
    createdAt: offer.createdAt,
    completedAt: offer.completedAt,
    eventStartAt: booking?.eventStartAt ?? null,
    pickupAddress: booking?.pickupAddress ?? "",
    driverEarnings: earnings,
  };
}
