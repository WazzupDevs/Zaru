import { Module } from "@nestjs/common";

import { CatalogModule } from "../catalog/catalog.module";
import { DOCUMENT_REPOSITORY_PORT } from "./application/ports/document.repository.port";
import { DRIVER_PROFILE_REPOSITORY_PORT } from "./application/ports/driver-profile.repository.port";
import { VEHICLE_REPOSITORY_PORT } from "./application/ports/vehicle.repository.port";
import { ApproveDriverUseCase } from "./application/use-cases/approve-driver.use-case";
import { ConfirmDocumentUploadUseCase } from "./application/use-cases/confirm-document-upload.use-case";
import { CreateDriverProfileUseCase } from "./application/use-cases/create-driver-profile.use-case";
import { GetMyDriverProfileUseCase } from "./application/use-cases/get-my-driver-profile.use-case";
import { ListMyDocumentsUseCase } from "./application/use-cases/list-my-documents.use-case";
import { ListMyVehiclesUseCase } from "./application/use-cases/list-my-vehicles.use-case";
import { ListPendingDriversUseCase } from "./application/use-cases/list-pending-drivers.use-case";
import { RegisterVehicleUseCase } from "./application/use-cases/register-vehicle.use-case";
import { RejectDriverUseCase } from "./application/use-cases/reject-driver.use-case";
import { RequestDocumentUploadUseCase } from "./application/use-cases/request-document-upload.use-case";
import { ReviewDocumentUseCase } from "./application/use-cases/review-document.use-case";
import { SubmitForReviewUseCase } from "./application/use-cases/submit-for-review.use-case";
import { UpdateDriverProfileUseCase } from "./application/use-cases/update-driver-profile.use-case";
import { UpdateVehicleAttributesUseCase } from "./application/use-cases/update-vehicle-attributes.use-case";
import { PrismaDocumentRepository } from "./infrastructure/persistence/prisma-document.repository";
import { PrismaDriverProfileRepository } from "./infrastructure/persistence/prisma-driver-profile.repository";
import { PrismaVehicleRepository } from "./infrastructure/persistence/prisma-vehicle.repository";
import { AdminSupplyController } from "./interface/controllers/admin-supply.controller";
import { DocumentController } from "./interface/controllers/document.controller";
import { DriverProfileController } from "./interface/controllers/driver-profile.controller";
import { VehicleController } from "./interface/controllers/vehicle.controller";

@Module({
  imports: [CatalogModule],
  controllers: [
    DriverProfileController,
    VehicleController,
    DocumentController,
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
    RequestDocumentUploadUseCase,
    ConfirmDocumentUploadUseCase,
    ReviewDocumentUseCase,
    ListMyDocumentsUseCase,
    { provide: DRIVER_PROFILE_REPOSITORY_PORT, useClass: PrismaDriverProfileRepository },
    { provide: VEHICLE_REPOSITORY_PORT, useClass: PrismaVehicleRepository },
    { provide: DOCUMENT_REPOSITORY_PORT, useClass: PrismaDocumentRepository },
  ],
})
export class SupplyModule {}
