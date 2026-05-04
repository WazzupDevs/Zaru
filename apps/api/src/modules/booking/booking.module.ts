import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";

import { PricingModule } from "../pricing/pricing.module";
import { CancelBookingUseCase } from "./application/use-cases/cancel-booking.use-case";
import { ConfirmBookingUseCase } from "./application/use-cases/confirm-booking.use-case";
import { GetBookingUseCase } from "./application/use-cases/get-booking.use-case";
import { ListMyBookingsUseCase } from "./application/use-cases/list-my-bookings.use-case";
import { BOOKING_REPOSITORY_PORT } from "./domain/ports/booking.repository.port";
import { PrismaBookingRepository } from "./infrastructure/persistence/prisma-booking.repository";
import { BOOKING_EXPIRY_QUEUE_NAME } from "./infrastructure/workers/booking-expiry.constants";
import { BookingExpiryScheduler } from "./infrastructure/workers/booking-expiry.scheduler";
import { BookingExpiryService } from "./infrastructure/workers/booking-expiry.service";
import { BookingExpiryWorker } from "./infrastructure/workers/booking-expiry.worker";

/**
 * Booking module — A4b. Owns the Booking aggregate, the state machine,
 * and the DRAFT-expiry worker. Imports PricingModule so use cases can
 * call PriceQuoteRepositoryPort.consumeQuote inside their tx.
 */
@Module({
  imports: [PricingModule, BullModule.registerQueue({ name: BOOKING_EXPIRY_QUEUE_NAME })],
  providers: [
    { provide: BOOKING_REPOSITORY_PORT, useClass: PrismaBookingRepository },
    ConfirmBookingUseCase,
    CancelBookingUseCase,
    GetBookingUseCase,
    ListMyBookingsUseCase,
    BookingExpiryService,
    BookingExpiryWorker,
    BookingExpiryScheduler,
  ],
  exports: [BOOKING_REPOSITORY_PORT],
})
export class BookingModule {}
