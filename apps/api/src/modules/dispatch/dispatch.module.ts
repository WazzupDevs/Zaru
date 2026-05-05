import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";

import { BookingModule } from "../booking/booking.module";
import { SupplyModule } from "../supply/supply.module";
import { DRIVER_SEARCH_REPOSITORY_PORT } from "./application/ports/driver-search.repository.port";
import { AssignDriverToBookingUseCase } from "./application/use-cases/assign-driver-to-booking.use-case";
import { ManualReassignDriverUseCase } from "./application/use-cases/manual-reassign-driver.use-case";
import { SetDriverOnlineStatusUseCase } from "./application/use-cases/set-driver-online-status.use-case";
import { UpdateDriverLocationUseCase } from "./application/use-cases/update-driver-location.use-case";
import { DispatchPolicyService } from "./domain/services/dispatch-policy.service";
import { DriverMatcher } from "./domain/services/driver-matcher.service";
import { PrismaDriverSearchRepository } from "./infrastructure/persistence/prisma-driver-search.repository";
import { BOOKING_DISPATCH_QUEUE_NAME } from "./infrastructure/workers/booking-dispatch.constants";
import { BookingDispatchScheduler } from "./infrastructure/workers/booking-dispatch.scheduler";
import { BookingDispatchService } from "./infrastructure/workers/booking-dispatch.service";
import { BookingDispatchWorker } from "./infrastructure/workers/booking-dispatch.worker";
import { AdminDispatchController } from "./interface/controllers/admin-dispatch.controller";
import { DriverLocationController } from "./interface/controllers/driver-location.controller";

/**
 * Dispatch module — A4c. Owns the matching algorithm + worker that
 * promotes CONFIRMED bookings to DRIVER_ASSIGNED. Imports BookingModule
 * (BOOKING_REPOSITORY_PORT) and SupplyModule (driver/vehicle/availability
 * repos) so its use cases can stitch the cross-module flow inside one
 * transaction.
 */
@Module({
  imports: [
    BookingModule,
    SupplyModule,
    BullModule.registerQueue({ name: BOOKING_DISPATCH_QUEUE_NAME }),
  ],
  controllers: [DriverLocationController, AdminDispatchController],
  providers: [
    DriverMatcher,
    DispatchPolicyService,
    { provide: DRIVER_SEARCH_REPOSITORY_PORT, useClass: PrismaDriverSearchRepository },
    AssignDriverToBookingUseCase,
    ManualReassignDriverUseCase,
    UpdateDriverLocationUseCase,
    SetDriverOnlineStatusUseCase,
    BookingDispatchService,
    BookingDispatchWorker,
    BookingDispatchScheduler,
  ],
})
export class DispatchModule {}
