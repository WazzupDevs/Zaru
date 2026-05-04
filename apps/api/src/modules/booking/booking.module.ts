import { Module } from "@nestjs/common";

import { BOOKING_REPOSITORY_PORT } from "./domain/ports/booking.repository.port";
import { PrismaBookingRepository } from "./infrastructure/persistence/prisma-booking.repository";

/**
 * A4a skeleton — only the repository so other modules (Pricing's consume
 * round-trip test, A4b booking creation) can wire against the port. State
 * machine + use cases land in A4b.
 */
@Module({
  providers: [{ provide: BOOKING_REPOSITORY_PORT, useClass: PrismaBookingRepository }],
  exports: [BOOKING_REPOSITORY_PORT],
})
export class BookingModule {}
