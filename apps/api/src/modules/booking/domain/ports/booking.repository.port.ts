import type { TxClient } from "../../../../common/persistence/tx-client";
import type { BookingEntity } from "../booking-types";

export const BOOKING_REPOSITORY_PORT = Symbol("BOOKING_REPOSITORY_PORT");

export interface CreateBookingInput {
  customerId: string;
  priceQuoteId: string;
}

/**
 * A4a skeleton: only the round-trip we need to prove the
 * Quote → Booking handoff. A4b grows this into the full state machine.
 */
export interface BookingRepositoryPort {
  create(tx: TxClient, input: CreateBookingInput): Promise<BookingEntity>;
  findById(tx: TxClient, id: string): Promise<BookingEntity | null>;
}
