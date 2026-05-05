import { Module } from "@nestjs/common";

import { CatalogModule } from "../catalog/catalog.module";
import { DOCUMENT_REPOSITORY_PORT } from "./application/ports/document.repository.port";
import { DRIVER_PROFILE_REPOSITORY_PORT } from "./application/ports/driver-profile.repository.port";
import { VEHICLE_AVAILABILITY_REPOSITORY_PORT } from "./application/ports/vehicle-availability.repository.port";
import { VEHICLE_REPOSITORY_PORT } from "./application/ports/vehicle.repository.port";
import { ActivateVehicleUseCase } from "./application/use-cases/activate-vehicle.use-case";
import { ApproveDriverUseCase } from "./application/use-cases/approve-driver.use-case";
import { BlockAvailabilityUseCase } from "./application/use-cases/block-availability.use-case";
import { CheckVehicleFreeUseCase } from "./application/use-cases/check-vehicle-free.use-case";
import { ConfirmDocumentUploadUseCase } from "./application/use-cases/confirm-document-upload.use-case";
import { CreateDriverProfileUseCase } from "./application/use-cases/create-driver-profile.use-case";
import { GetMyDriverProfileUseCase } from "./application/use-cases/get-my-driver-profile.use-case";
import { ListAvailabilityUseCase } from "./application/use-cases/list-availability.use-case";
import { ListMyDocumentsUseCase } from "./application/use-cases/list-my-documents.use-case";
import { ListMyVehiclesUseCase } from "./application/use-cases/list-my-vehicles.use-case";
import { ListPendingDriversUseCase } from "./application/use-cases/list-pending-drivers.use-case";
import { RegisterVehicleUseCase } from "./application/use-cases/register-vehicle.use-case";
import { RejectDriverUseCase } from "./application/use-cases/reject-driver.use-case";
import { RequestDocumentUploadUseCase } from "./application/use-cases/request-document-upload.use-case";
import { ReviewDocumentUseCase } from "./application/use-cases/review-document.use-case";
import { SubmitForReviewUseCase } from "./application/use-cases/submit-for-review.use-case";
import { UnblockAvailabilityUseCase } from "./application/use-cases/unblock-availability.use-case";
import { UpdateDriverProfileUseCase } from "./application/use-cases/update-driver-profile.use-case";
import { UpdateVehicleAttributesUseCase } from "./application/use-cases/update-vehicle-attributes.use-case";
import { PrismaDocumentRepository } from "./infrastructure/persistence/prisma-document.repository";
import { PrismaDriverProfileRepository } from "./infrastructure/persistence/prisma-driver-profile.repository";
import { PrismaVehicleAvailabilityRepository } from "./infrastructure/persistence/prisma-vehicle-availability.repository";
import { PrismaVehicleRepository } from "./infrastructure/persistence/prisma-vehicle.repository";
import { AdminSupplyController } from "./interface/controllers/admin-supply.controller";
import { AvailabilityController } from "./interface/controllers/availability.controller";
import { DocumentController } from "./interface/controllers/document.controller";
import { DriverProfileController } from "./interface/controllers/driver-profile.controller";
import { VehicleController } from "./interface/controllers/vehicle.controller";

@Module({
  imports: [CatalogModule],
  controllers: [
    DriverProfileController,
    VehicleController,
    DocumentController,
    AvailabilityController,
    AdminSupplyController,
  ],
  providers: [
    CreateDriverProfileUseCase,
    UpdateDriverProfileUseCase,
    GetMyDriverProfileUseCase,
    SubmitForReviewUseCase,
    ApproveDriverUseCase,
    RejectDriverUseCase,
    ListPendingDriversUseCase,
    RegisterVehicleUseCase,
    UpdateVehicleAttributesUseCase,
    ListMyVehiclesUseCase,
    ActivateVehicleUseCase,
    RequestDocumentUploadUseCase,
    ConfirmDocumentUploadUseCase,
    ReviewDocumentUseCase,
    ListMyDocumentsUseCase,
    BlockAvailabilityUseCase,
    UnblockAvailabilityUseCase,
    ListAvailabilityUseCase,
    CheckVehicleFreeUseCase,
    { provide: DRIVER_PROFILE_REPOSITORY_PORT, useClass: PrismaDriverProfileRepository },
    { provide: VEHICLE_REPOSITORY_PORT, useClass: PrismaVehicleRepository },
    { provide: DOCUMENT_REPOSITORY_PORT, useClass: PrismaDocumentRepository },
    {
      provide: VEHICLE_AVAILABILITY_REPOSITORY_PORT,
      useClass: PrismaVehicleAvailabilityRepository,
    },
  ],
  // Exported so cross-module callers (e.g. Dispatch) can inject the repos
  // without re-wiring Prisma. Same disipline as BookingModule exports.
  exports: [
    DRIVER_PROFILE_REPOSITORY_PORT,
    VEHICLE_REPOSITORY_PORT,
    VEHICLE_AVAILABILITY_REPOSITORY_PORT,
  ],
})
export class SupplyModule {}
