import { Inject, Injectable } from "@nestjs/common";

import { CLOCK_PORT, type ClockPort } from "../../../../common/clock/clock.port";
import { ForbiddenError } from "../../../../common/errors/domain-error";
import {
  OUTBOX_WRITER_PORT,
  type OutboxWriterPort,
} from "../../../../common/persistence/outbox-writer.port";
import { TX_RUNNER_PORT, type TxRunnerPort } from "../../../../common/persistence/tx-runner.port";
import {
  AvailabilityConflictError,
  InvalidAvailabilityRangeError,
  PastDateError,
  VehicleNotActiveError,
} from "../../domain/errors/availability-errors";
import { VehicleNotFoundError } from "../../domain/errors/vehicle-not-found.error";
import {
  AVAILABILITY_BLOCKED_EVENT_TYPE,
  type AvailabilityBlockedEventPayload,
} from "../../domain/events/availability-blocked.event";
import {
  DRIVER_PROFILE_REPOSITORY_PORT,
  type DriverProfileRepositoryPort,
} from "../ports/driver-profile.repository.port";
import {
  VEHICLE_AVAILABILITY_REPOSITORY_PORT,
  type AvailabilityRecord,
  type VehicleAvailabilityRepositoryPort,
} from "../ports/vehicle-availability.repository.port";
import {
  VEHICLE_REPOSITORY_PORT,
  type VehicleRepositoryPort,
} from "../ports/vehicle.repository.port";

export interface BlockAvailabilityInput {
  vehicleId: string;
  startAt: Date;
  endAt: Date;
  reason?: string | undefined;
}

@Injectable()
export class BlockAvailabilityUseCase {
  constructor(
    @Inject(VEHICLE_REPOSITORY_PORT)
    private readonly vehicleRepo: VehicleRepositoryPort,
    @Inject(VEHICLE_AVAILABILITY_REPOSITORY_PORT)
    private readonly availRepo: VehicleAvailabilityRepositoryPort,
    @Inject(DRIVER_PROFILE_REPOSITORY_PORT)
    private readonly profileRepo: DriverProfileRepositoryPort,
    @Inject(TX_RUNNER_PORT) private readonly tx: TxRunnerPort,
    @Inject(OUTBOX_WRITER_PORT) private readonly outbox: OutboxWriterPort,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
  ) {}

  async execute(
    input: BlockAvailabilityInput,
    actor: { userId: string },
  ): Promise<AvailabilityRecord> {
    if (input.endAt.getTime() <= input.startAt.getTime()) {
      throw new InvalidAvailabilityRangeError();
    }
    const now = this.clock.now();
    if (input.startAt.getTime() < now.getTime()) {
      throw new PastDateError();
    }

    return this.tx.run(async (tx) => {
      const profile = await this.profileRepo.findActiveByUserId(tx, actor.userId);
      if (!profile) throw new ForbiddenError("Driver profile required.");

      const vehicle = await this.vehicleRepo.findActiveById(tx, input.vehicleId);
      if (vehicle?.driverProfileId !== profile.id) throw new VehicleNotFoundError();
      if (vehicle.status !== "ACTIVE") throw new VehicleNotActiveError();

      const conflicts = await this.availRepo.findOverlapping(
        tx,
        input.vehicleId,
        input.startAt,
        input.endAt,
      );
      if (conflicts.length > 0) {
        throw new AvailabilityConflictError(
          conflicts.map((c) => ({ id: c.id, startAt: c.startAt, endAt: c.endAt, type: c.type })),
        );
      }

      const record = await this.availRepo.create(tx, {
        vehicleId: input.vehicleId,
        driverProfileId: profile.id,
        startAt: input.startAt,
        endAt: input.endAt,
        type: "BLOCKED",
        reason: input.reason,
      });

      await this.outbox.write(tx, {
        aggregateType: "VehicleAvailability",
        aggregateId: record.id,
        eventType: AVAILABILITY_BLOCKED_EVENT_TYPE,
        payload: {
          availabilityId: record.id,
          vehicleId: record.vehicleId,
          driverProfileId: record.driverProfileId,
          startAt: record.startAt.toISOString(),
          endAt: record.endAt.toISOString(),
          reason: record.reason,
        } satisfies AvailabilityBlockedEventPayload,
      });

      return record;
    });
  }
}
