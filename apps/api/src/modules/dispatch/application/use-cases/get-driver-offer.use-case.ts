import { Inject, Injectable } from "@nestjs/common";
import { Decimal } from "@prisma/client/runtime/library";

import { TX_RUNNER_PORT, type TxRunnerPort } from "../../../../common/persistence/tx-runner.port";
import {
  BOOKING_REPOSITORY_PORT,
  type BookingRepositoryPort,
} from "../../../booking/domain/ports/booking.repository.port";
import {
  USER_REPOSITORY_PORT,
  type UserRepositoryPort,
} from "../../../identity/application/ports/user.repository.port";
import {
  DRIVER_PROFILE_REPOSITORY_PORT,
  type DriverProfileRepositoryPort,
} from "../../../supply/application/ports/driver-profile.repository.port";
import {
  VEHICLE_REPOSITORY_PORT,
  type VehicleRepositoryPort,
} from "../../../supply/application/ports/vehicle.repository.port";
import {
  ConcurrentDispatchError,
  OfferForbiddenError,
  OfferNotFoundError,
} from "../../domain/errors/dispatch-errors";
import {
  DRIVER_OFFER_REPOSITORY_PORT,
  type DriverOfferRepositoryPort,
} from "../ports/driver-offer.repository.port";
import { calculateDriverEarnings, maskE164 } from "../services/driver-offer-view-helpers";

import type { DriverOfferDetailView } from "./driver-offer-view-types";

export interface GetDriverOfferInput {
  offerId: string;
  driverUserId: string;
}

/**
 * Driver-side offer detail. Bundles the offer row, the booking row,
 * the customer (masked), and the matched vehicle into a single
 * response the driver app can render without additional round-trips.
 * Driver earnings are computed from `driver.commissionRate` rather
 * than a global env so per-driver promo overrides work without code
 * changes.
 *
 * Cross-module reads are intentional here — see A4f-1b notes on
 * "cross-module read at controller / query use case": this query
 * lives in dispatch but stitches booking + identity + supply, all in
 * a single read-only tx.
 */
@Injectable()
export class GetDriverOfferUseCase {
  constructor(
    @Inject(DRIVER_OFFER_REPOSITORY_PORT)
    private readonly offerRepo: DriverOfferRepositoryPort,
    @Inject(DRIVER_PROFILE_REPOSITORY_PORT)
    private readonly driverRepo: DriverProfileRepositoryPort,
    @Inject(BOOKING_REPOSITORY_PORT)
    private readonly bookingRepo: BookingRepositoryPort,
    @Inject(USER_REPOSITORY_PORT)
    private readonly userRepo: UserRepositoryPort,
    @Inject(VEHICLE_REPOSITORY_PORT)
    private readonly vehicleRepo: VehicleRepositoryPort,
    @Inject(TX_RUNNER_PORT) private readonly tx: TxRunnerPort,
  ) {}

  async execute(input: GetDriverOfferInput): Promise<DriverOfferDetailView> {
    return this.tx.run(async (tx) => {
      const offer = await this.offerRepo.findById(tx, input.offerId);
      if (!offer) throw new OfferNotFoundError();

      const driver = await this.driverRepo.findActiveByUserId(tx, input.driverUserId);
      if (offer.driverProfileId !== driver?.id) {
        throw new OfferForbiddenError();
      }

      const booking = await this.bookingRepo.findById(tx, offer.bookingId);
      // The offer FK guarantees the booking exists at the time of write;
      // a missing row here means the booking was soft-deleted between
      // offer creation and this read. Surface as a transient conflict.
      if (!booking) throw new ConcurrentDispatchError();

      const [customer, vehicle] = await Promise.all([
        this.userRepo.findActiveById(tx, booking.customerId),
        this.vehicleRepo.findActiveById(tx, offer.vehicleId),
      ]);

      return {
        offerId: offer.id,
        bookingId: offer.bookingId,
        status: offer.status,
        expiresAt: offer.expiresAt,
        acceptedAt: offer.acceptedAt,
        rejectedAt: offer.rejectedAt,
        onTheWayAt: offer.onTheWayAt,
        arrivedAt: offer.arrivedAt,
        inProgressAt: offer.inProgressAt,
        completedAt: offer.completedAt,
        cancelledAt: offer.cancelledAt,
        rejectReason: offer.rejectReason,
        booking: {
          pickupAddress: booking.pickupAddress,
          dropoffAddress: booking.dropoffAddress,
          pickupLat: booking.pickupLat.toString(),
          pickupLng: booking.pickupLng.toString(),
          eventStartAt: booking.eventStartAt,
          eventEndAt: booking.eventEndAt,
          totalAmount: {
            amount: new Decimal(booking.totalAmount.toString()).toFixed(2),
            currency: booking.currency,
          },
        },
        vehicle: vehicle
          ? {
              brand: vehicle.brand,
              model: vehicle.model,
              plateNumber: vehicle.plateNumber,
            }
          : null,
        customer: {
          displayName: customer?.displayName ?? null,
          phoneMasked: maskE164(customer?.phoneE164 ?? ""),
        },
        driverEarnings: calculateDriverEarnings(
          booking.totalAmount,
          driver.commissionRate,
          booking.currency,
        ),
      };
    });
  }
}
