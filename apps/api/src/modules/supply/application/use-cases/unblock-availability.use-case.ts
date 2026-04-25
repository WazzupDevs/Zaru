import { Inject, Injectable } from "@nestjs/common";

import { CLOCK_PORT, type ClockPort } from "../../../../common/clock/clock.port";
import { ForbiddenError } from "../../../../common/errors/domain-error";
import {
  OUTBOX_WRITER_PORT,
  type OutboxWriterPort,
} from "../../../../common/persistence/outbox-writer.port";
import { TX_RUNNER_PORT, type TxRunnerPort } from "../../../../common/persistence/tx-runner.port";
import {
  AvailabilityNotFoundError,
  CannotRemoveBookedAvailabilityError,
} from "../../domain/errors/availability-errors";
import {
  AVAILABILITY_UNBLOCKED_EVENT_TYPE,
  type AvailabilityUnblockedEventPayload,
} from "../../domain/events/availability-blocked.event";
import {
  DRIVER_PROFILE_REPOSITORY_PORT,
  type DriverProfileRepositoryPort,
} from "../ports/driver-profile.repository.port";
import {
  VEHICLE_AVAILABILITY_REPOSITORY_PORT,
  type VehicleAvailabilityRepositoryPort,
} from "../ports/vehicle-availability.repository.port";

@Injectable()
export class UnblockAvailabilityUseCase {
  constructor(
    @Inject(VEHICLE_AVAILABILITY_REPOSITORY_PORT)
    private readonly availRepo: VehicleAvailabilityRepositoryPort,
    @Inject(DRIVER_PROFILE_REPOSITORY_PORT)
    private readonly profileRepo: DriverProfileRepositoryPort,
    @Inject(TX_RUNNER_PORT) private readonly tx: TxRunnerPort,
    @Inject(OUTBOX_WRITER_PORT) private readonly outbox: OutboxWriterPort,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
  ) {}

  async execute(availabilityId: string, actor: { userId: string }): Promise<void> {
    return this.tx.run(async (tx) => {
      const profile = await this.profileRepo.findActiveByUserId(tx, actor.userId);
      if (!profile) throw new ForbiddenError("Driver profile required.");

      const record = await this.availRepo.findActiveById(tx, availabilityId);
      if (!record) throw new AvailabilityNotFoundError();
      if (record.driverProfileId !== profile.id) {
        throw new ForbiddenError("Cannot remove another driver's availability.");
      }
      if (record.type === "BOOKED") throw new CannotRemoveBookedAvailabilityError();

      const now = this.clock.now();
      await this.availRepo.softDelete(tx, record.id, now);

      await this.outbox.write(tx, {
        aggregateType: "VehicleAvailability",
        aggregateId: record.id,
        eventType: AVAILABILITY_UNBLOCKED_EVENT_TYPE,
        payload: {
          availabilityId: record.id,
          vehicleId: record.vehicleId,
          driverProfileId: record.driverProfileId,
        } satisfies AvailabilityUnblockedEventPayload,
      });
    });
  }
}
