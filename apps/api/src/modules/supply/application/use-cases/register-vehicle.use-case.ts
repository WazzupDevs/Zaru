import { Inject, Injectable } from "@nestjs/common";

import { CLOCK_PORT, type ClockPort } from "../../../../common/clock/clock.port";
import { DomainError } from "../../../../common/errors/domain-error";
import {
  OUTBOX_WRITER_PORT,
  type OutboxWriterPort,
} from "../../../../common/persistence/outbox-writer.port";
import { TX_RUNNER_PORT, type TxRunnerPort } from "../../../../common/persistence/tx-runner.port";
import {
  SERVICE_CATEGORY_REPOSITORY_PORT,
  type ServiceCategoryRepositoryPort,
} from "../../../catalog/application/ports/service-category.repository.port";
import { DriverNotApprovedError } from "../../domain/errors/driver-not-approved.error";
import { DriverProfileNotFoundError } from "../../domain/errors/driver-profile-not-found.error";
import { PlateAlreadyRegisteredError } from "../../domain/errors/plate-already-registered.error";
import {
  VEHICLE_REGISTERED_EVENT_TYPE,
  type VehicleRegisteredEventPayload,
} from "../../domain/events/vehicle-registered.event";
import { PlateVO } from "../../domain/value-objects/plate.vo";
import {
  DRIVER_PROFILE_REPOSITORY_PORT,
  type DriverProfileRepositoryPort,
} from "../ports/driver-profile.repository.port";
import {
  VEHICLE_REPOSITORY_PORT,
  type VehicleRecord,
  type VehicleRepositoryPort,
} from "../ports/vehicle.repository.port";
import { AttributeValidator } from "../services/attribute-validator";

export interface RegisterVehicleInput {
  vehicleTypeId: string;
  plateNumber: string;
  brand: string;
  model: string;
  year: number;
  color: string;
  attributes: Record<string, unknown>;
}

class VehicleTypeNotFoundError extends DomainError {
  readonly code = "SUPPLY_VEHICLE_TYPE_NOT_FOUND";
  readonly httpStatus = 404;
}

@Injectable()
export class RegisterVehicleUseCase {
  private readonly attributeValidator = new AttributeValidator();

  constructor(
    @Inject(DRIVER_PROFILE_REPOSITORY_PORT)
    private readonly profileRepo: DriverProfileRepositoryPort,
    @Inject(VEHICLE_REPOSITORY_PORT)
    private readonly vehicleRepo: VehicleRepositoryPort,
    @Inject(SERVICE_CATEGORY_REPOSITORY_PORT)
    private readonly catalogRepo: ServiceCategoryRepositoryPort,
    @Inject(TX_RUNNER_PORT) private readonly tx: TxRunnerPort,
    @Inject(OUTBOX_WRITER_PORT) private readonly outbox: OutboxWriterPort,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
  ) {}

  async execute(input: RegisterVehicleInput, actor: { userId: string }): Promise<VehicleRecord> {
    const plate = PlateVO.create(input.plateNumber);

    // Catalog reads run outside the write tx — they're stable reference data.
    const vehicleType = await this.catalogRepo.findActiveVehicleType(input.vehicleTypeId);
    if (!vehicleType) throw new VehicleTypeNotFoundError("Vehicle type not found or inactive.");
    const definitions = await this.catalogRepo.listAttributeDefinitionsForCategory(
      vehicleType.categoryId,
    );
    const validated = this.attributeValidator.validate(definitions, "VEHICLE", input.attributes);

    return this.tx.run(async (tx) => {
      const profile = await this.profileRepo.findActiveByUserId(tx, actor.userId);
      if (!profile) throw new DriverProfileNotFoundError();
      if (profile.status !== "APPROVED") throw new DriverNotApprovedError();

      const existingPlate = await this.vehicleRepo.findActiveByPlate(tx, plate.value);
      if (existingPlate) throw new PlateAlreadyRegisteredError(plate.value);

      const vehicle = await this.vehicleRepo.create(tx, {
        driverProfileId: profile.id,
        vehicleTypeId: vehicleType.id,
        plateNumber: plate.value,
        brand: input.brand,
        model: input.model,
        year: input.year,
        color: input.color,
        attributes: validated,
      });

      await this.outbox.write(tx, {
        aggregateType: "Vehicle",
        aggregateId: vehicle.id,
        eventType: VEHICLE_REGISTERED_EVENT_TYPE,
        payload: {
          vehicleId: vehicle.id,
          driverProfileId: vehicle.driverProfileId,
          vehicleTypeId: vehicle.vehicleTypeId,
          plateNumber: vehicle.plateNumber,
          brand: vehicle.brand,
          model: vehicle.model,
          year: vehicle.year,
          registeredAt: this.clock.now().toISOString(),
        } satisfies VehicleRegisteredEventPayload,
      });

      return vehicle;
    });
  }
}
