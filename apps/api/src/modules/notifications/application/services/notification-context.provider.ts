import { Inject, Injectable } from "@nestjs/common";

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

export interface NotificationCustomerContext {
  userId: string;
  displayName: string | null;
  phoneE164: string;
}

export interface NotificationDriverContext {
  driverProfileId: string;
  userId: string;
  displayName: string | null;
  phoneE164: string;
  /** "Renault Symbol - ivory" — derived from first active vehicle. */
  vehicleInfo: string;
  plateNumber: string;
}

export interface NotificationBookingContext {
  bookingId: string;
  /** First 8 chars uppercased — what the customer sees in templates. */
  bookingShortId: string;
  customerId: string;
  eventStartAt: Date;
  eventEndAt: Date;
  /** Privacy-shortened address ("Sultanahmet Mahallesi, Fatih, İstanbul" → "Sultanahmet Mahallesi, Fatih"). */
  pickupArea: string;
  dropoffArea: string;
  totalAmount: string;
}

/**
 * Single point of cross-module reads for the outbox listener. Outbox
 * payloads stay PII-free (ADR 0019), so the listener fetches the
 * recipient's phone here. Centralising the lookup keeps the listener
 * itself short and the address-shortening / vehicle-fallback logic
 * unit-testable.
 *
 * Each method opens its own short tx — listeners are async and we do
 * not need cross-method consistency, just a connection per query.
 */
@Injectable()
export class NotificationContextProvider {
  constructor(
    @Inject(USER_REPOSITORY_PORT)
    private readonly userRepo: UserRepositoryPort,
    @Inject(BOOKING_REPOSITORY_PORT)
    private readonly bookingRepo: BookingRepositoryPort,
    @Inject(DRIVER_PROFILE_REPOSITORY_PORT)
    private readonly driverRepo: DriverProfileRepositoryPort,
    @Inject(VEHICLE_REPOSITORY_PORT)
    private readonly vehicleRepo: VehicleRepositoryPort,
    @Inject(TX_RUNNER_PORT) private readonly tx: TxRunnerPort,
  ) {}

  async getCustomerContext(userId: string): Promise<NotificationCustomerContext | null> {
    const user = await this.tx.run((tx) => this.userRepo.findActiveById(tx, userId));
    if (!user) return null;
    return {
      userId: user.id,
      displayName: user.displayName,
      phoneE164: user.phoneE164,
    };
  }

  async getBookingContext(bookingId: string): Promise<NotificationBookingContext | null> {
    const booking = await this.tx.run((tx) => this.bookingRepo.findById(tx, bookingId));
    if (!booking) return null;
    return {
      bookingId: booking.id,
      bookingShortId: booking.id.slice(0, 8).toUpperCase(),
      customerId: booking.customerId,
      eventStartAt: booking.eventStartAt,
      eventEndAt: booking.eventEndAt,
      pickupArea: this.shortenAddress(booking.pickupAddress),
      dropoffArea: this.shortenAddress(booking.dropoffAddress),
      totalAmount: booking.totalAmount.toString(),
    };
  }

  async getDriverContext(driverProfileId: string): Promise<NotificationDriverContext | null> {
    return this.tx.run(async (tx) => {
      const driver = await this.driverRepo.findActiveById(tx, driverProfileId);
      if (!driver) return null;
      const user = await this.userRepo.findActiveById(tx, driver.userId);
      if (!user) return null;
      const vehicles = await this.vehicleRepo.listByDriver(tx, driverProfileId);
      const vehicle = vehicles[0];
      return {
        driverProfileId: driver.id,
        userId: user.id,
        displayName: user.displayName,
        phoneE164: user.phoneE164,
        vehicleInfo: vehicle
          ? `${vehicle.brand} ${vehicle.model} - ${vehicle.color}`
          : "Belirtilmemiş",
        plateNumber: vehicle?.plateNumber ?? "Belirtilmemiş",
      };
    });
  }

  /**
   * Drops everything past the second comma. Goes from
   * "Sultanahmet Mahallesi, Fatih, İstanbul" to "Sultanahmet Mahallesi, Fatih".
   * Privacy: SMS body should not carry the customer's full street address,
   * only the neighborhood + district.
   */
  private shortenAddress(address: string): string {
    const parts = address
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    return parts.slice(0, 2).join(", ");
  }
}
