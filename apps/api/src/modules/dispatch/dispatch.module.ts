import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";

import { BookingModule } from "../booking/booking.module";
import { IdentityModule } from "../identity/identity.module";
import { SupplyModule } from "../supply/supply.module";
import { DRIVER_DISPATCH_COOLDOWN_REPOSITORY_PORT } from "./application/ports/driver-dispatch-cooldown.repository.port";
import { DRIVER_OFFER_REPOSITORY_PORT } from "./application/ports/driver-offer.repository.port";
import { DRIVER_SEARCH_REPOSITORY_PORT } from "./application/ports/driver-search.repository.port";
import { AcceptDriverOfferUseCase } from "./application/use-cases/accept-driver-offer.use-case";
import { CreateDriverOfferUseCase } from "./application/use-cases/create-driver-offer.use-case";
import { GetDriverOfferUseCase } from "./application/use-cases/get-driver-offer.use-case";
import { ListDriverOfferHistoryUseCase } from "./application/use-cases/list-driver-offer-history.use-case";
import { ManualReassignDriverUseCase } from "./application/use-cases/manual-reassign-driver.use-case";
import { RejectDriverOfferUseCase } from "./application/use-cases/reject-driver-offer.use-case";
import { SetDriverOnlineStatusUseCase } from "./application/use-cases/set-driver-online-status.use-case";
import { UpdateDriverLocationUseCase } from "./application/use-cases/update-driver-location.use-case";
import { UpdateDriverOfferStatusUseCase } from "./application/use-cases/update-driver-offer-status.use-case";
import { DispatchPolicyService } from "./domain/services/dispatch-policy.service";
import { DriverMatcher } from "./domain/services/driver-matcher.service";
import { PrismaDriverDispatchCooldownRepository } from "./infrastructure/persistence/prisma-driver-dispatch-cooldown.repository";
import { PrismaDriverOfferRepository } from "./infrastructure/persistence/prisma-driver-offer.repository";
import { PrismaDriverSearchRepository } from "./infrastructure/persistence/prisma-driver-search.repository";
import { BOOKING_DISPATCH_QUEUE_NAME } from "./infrastructure/workers/booking-dispatch.constants";
import { BookingDispatchScheduler } from "./infrastructure/workers/booking-dispatch.scheduler";
import { BookingDispatchService } from "./infrastructure/workers/booking-dispatch.service";
import { BookingDispatchWorker } from "./infrastructure/workers/booking-dispatch.worker";
import { AdminDispatchController } from "./interface/controllers/admin-dispatch.controller";
import { DispatchOffersController } from "./interface/controllers/dispatch-offers.controller";
import { DriverLocationController } from "./interface/controllers/driver-location.controller";
import { DriverStatusController } from "./interface/controllers/driver-status.controller";
import { DispatchRetriggerListener } from "./interface/listeners/dispatch-retrigger.listener";

/**
 * Dispatch module — A4c foundation + A4f-2 offer flow.
 *
 * Phase 1 (A4c) introduced the matcher + worker that auto-assigned a
 * driver onto a CONFIRMED booking. Phase 2 (A4f-2a/2b/2b-2) splits
 * that into a two-step flow: the worker creates a PENDING offer, the
 * driver app accepts/rejects, and only on accept does the booking
 * transition to DRIVER_ASSIGNED.
 *
 * Imports BookingModule (BOOKING_REPOSITORY_PORT), SupplyModule
 * (driver/vehicle/availability repos), and IdentityModule
 * (USER_REPOSITORY_PORT for query enrichment).
 */
@Module({
  imports: [
    BookingModule,
    SupplyModule,
    IdentityModule,
    BullModule.registerQueue({ name: BOOKING_DISPATCH_QUEUE_NAME }),
  ],
  controllers: [
    DriverLocationController,
    AdminDispatchController,
    DispatchOffersController,
    DriverStatusController,
  ],
  providers: [
    DriverMatcher,
    DispatchPolicyService,
    { provide: DRIVER_SEARCH_REPOSITORY_PORT, useClass: PrismaDriverSearchRepository },
    { provide: DRIVER_OFFER_REPOSITORY_PORT, useClass: PrismaDriverOfferRepository },
    {
      provide: DRIVER_DISPATCH_COOLDOWN_REPOSITORY_PORT,
      useClass: PrismaDriverDispatchCooldownRepository,
    },
    CreateDriverOfferUseCase,
    AcceptDriverOfferUseCase,
    RejectDriverOfferUseCase,
    UpdateDriverOfferStatusUseCase,
    GetDriverOfferUseCase,
    ListDriverOfferHistoryUseCase,
    ManualReassignDriverUseCase,
    UpdateDriverLocationUseCase,
    SetDriverOnlineStatusUseCase,
    BookingDispatchService,
    BookingDispatchWorker,
    BookingDispatchScheduler,
    DispatchRetriggerListener,
  ],
})
export class DispatchModule {}
