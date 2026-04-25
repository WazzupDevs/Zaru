import { Inject, Injectable } from "@nestjs/common";

import { TX_RUNNER_PORT, type TxRunnerPort } from "../../../../common/persistence/tx-runner.port";
import {
  SERVICE_CATEGORY_REPOSITORY_PORT,
  type ServiceCategoryRepositoryPort,
} from "../../../catalog/application/ports/service-category.repository.port";
import { DriverProfileNotFoundError } from "../../domain/errors/driver-profile-not-found.error";
import {
  VehicleConcurrencyError,
  VehicleNotFoundError,
} from "../../domain/errors/vehicle-not-found.error";
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

export interface UpdateVehicleAttributesInput {
  attributes: Record<string, unknown>;
  expectedVersion: number;
}

@Injectable()
export class UpdateVehicleAttributesUseCase {
  private readonly attributeValidator = new AttributeValidator();

  constructor(
    @Inject(VEHICLE_REPOSITORY_PORT)
    private readonly vehicleRepo: VehicleRepositoryPort,
    @Inject(DRIVER_PROFILE_REPOSITORY_PORT)
    private readonly profileRepo: DriverProfileRepositoryPort,
    @Inject(SERVICE_CATEGORY_REPOSITORY_PORT)
    private readonly catalogRepo: ServiceCategoryRepositoryPort,
    @Inject(TX_RUNNER_PORT) private readonly tx: TxRunnerPort,
  ) {}

  async execute(
    vehicleId: string,
    input: UpdateVehicleAttributesInput,
    actor: { userId: string },
  ): Promise<VehicleRecord> {
    return this.tx.run(async (tx) => {
      const profile = await this.profileRepo.findActiveByUserId(tx, actor.userId);
      if (!profile) throw new DriverProfileNotFoundError();
      const vehicle = await this.vehicleRepo.findActiveById(tx, vehicleId);
      if (vehicle?.driverProfileId !== profile.id) throw new VehicleNotFoundError();

      const vehicleType = await this.catalogRepo.findActiveVehicleType(vehicle.vehicleTypeId);
      if (!vehicleType) throw new VehicleNotFoundError();
      const definitions = await this.catalogRepo.listAttributeDefinitionsForCategory(
        vehicleType.categoryId,
      );
      const validated = this.attributeValidator.validate(definitions, "VEHICLE", input.attributes);

      const ok = await this.vehicleRepo.updateAttributes(
        tx,
        vehicle.id,
        input.expectedVersion,
        validated,
      );
      if (!ok) throw new VehicleConcurrencyError();
      const updated = await this.vehicleRepo.findActiveById(tx, vehicle.id);
      if (!updated) throw new VehicleNotFoundError();
      return updated;
    });
  }
}
