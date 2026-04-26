import { Inject, Injectable } from "@nestjs/common";

import { CLOCK_PORT, type ClockPort } from "../../../../common/clock/clock.port";
import { ConflictError } from "../../../../common/errors/domain-error";
import {
  OUTBOX_WRITER_PORT,
  type OutboxWriterPort,
} from "../../../../common/persistence/outbox-writer.port";
import { TX_RUNNER_PORT, type TxRunnerPort } from "../../../../common/persistence/tx-runner.port";
import { DriverNotApprovedError } from "../../domain/errors/driver-not-approved.error";
import { DriverProfileNotFoundError } from "../../domain/errors/driver-profile-not-found.error";
import { VehicleNotFoundError } from "../../domain/errors/vehicle-not-found.error";
import {
  VEHICLE_ACTIVATED_EVENT_TYPE,
  type VehicleActivatedEventPayload,
} from "../../domain/events/availability-blocked.event";
import {
  DRIVER_PROFILE_REPOSITORY_PORT,
  type DriverProfileRepositoryPort,
} from "../ports/driver-profile.repository.port";
import {
  VEHICLE_REPOSITORY_PORT,
  type VehicleRecord,
  type VehicleRepositoryPort,
} from "../ports/vehicle.repository.port";

/**
 * Admin moves a vehicle from DRAFT/PENDING_APPROVAL → ACTIVE so the driver
 * can start managing availability and (A4) accept bookings. Driver profile
 * must already be APPROVED. Photo / inspection requirements are A4+.
 */
@Injectable()
export class ActivateVehicleUseCase {
  constructor(
    @Inject(VEHICLE_REPOSITORY_PORT)
    private readonly vehicleRepo: VehicleRepositoryPort,
    @Inject(DRIVER_PROFILE_REPOSITORY_PORT)
    private readonly profileRepo: DriverProfileRepositoryPort,
    @Inject(TX_RUNNER_PORT) private readonly tx: TxRunnerPort,
    @Inject(OUTBOX_WRITER_PORT) private readonly outbox: OutboxWriterPort,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
  ) {}

  async execute(vehicleId: string, admin: { userId: string }): Promise<VehicleRecord> {
    return this.tx.run(async (tx) => {
      const vehicle = await this.vehicleRepo.findActiveById(tx, vehicleId);
      if (!vehicle) throw new VehicleNotFoundError();
      if (vehicle.status === "ACTIVE") {
        // Idempotent — re-activating an active vehicle is a no-op.
        return vehicle;
      }
      if (vehicle.status === "SUSPENDED") {
        throw new ConflictError("Suspended vehicles cannot be re-activated here.");
      }

      const driver = await this.profileRepo.findActiveById(tx, vehicle.driverProfileId);
      if (!driver) throw new DriverProfileNotFoundError();
      if (driver.status !== "APPROVED") throw new DriverNotApprovedError();

      const now = this.clock.now();
      await this.vehicleRepo.setStatus(tx, vehicle.id, "ACTIVE");

      await this.outbox.write(tx, {
        aggregateType: "Vehicle",
        aggregateId: vehicle.id,
        eventType: VEHICLE_ACTIVATED_EVENT_TYPE,
        payload: {
          vehicleId: vehicle.id,
          driverProfileId: vehicle.driverProfileId,
          activatedByUserId: admin.userId,
          activatedAt: now.toISOString(),
        } satisfies VehicleActivatedEventPayload,
      });

      const updated = await this.vehicleRepo.findActiveById(tx, vehicle.id);
      if (!updated) throw new VehicleNotFoundError();
      return updated;
    });
  }
}
