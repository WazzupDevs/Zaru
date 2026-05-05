import type { TxClient } from "../../../../common/persistence/tx-client";
import type { PriceBreakdownJson } from "../../domain/value-objects/price-breakdown.vo";
import type { PriceQuoteStatus } from "@prisma/client";

export const PRICE_QUOTE_REPOSITORY_PORT = Symbol("PRICE_QUOTE_REPOSITORY_PORT");

export interface PriceQuoteEntity {
  id: string;
  requestedByUserId: string;
  vehicleTypeId: string;
  categoryId: string;
  pickupLat: string;
  pickupLng: string;
  pickupAddress: string;
  dropoffLat: string;
  dropoffLng: string;
  dropoffAddress: string;
  distanceKm: string;
  durationMinutes: number;
  eventStartAt: Date;
  eventEndAt: Date;
  durationHours: string;
  breakdown: PriceBreakdownJson;
  totalAmount: string;
  currency: string;
  selectedAddons: string[];
  status: PriceQuoteStatus;
  expiresAt: Date;
  consumedAt: Date | null;
  consumedByBookingId: string | null;
  createdAt: Date;
}

export interface CreatePriceQuoteInput {
  requestedByUserId: string;
  vehicleTypeId: string;
  categoryId: string;
  pickupLat: string;
  pickupLng: string;
  pickupAddress: string;
  dropoffLat: string;
  dropoffLng: string;
  dropoffAddress: string;
  distanceKm: string;
  durationMinutes: number;
  eventStartAt: Date;
  eventEndAt: Date;
  durationHours: string;
  breakdown: PriceBreakdownJson;
  totalAmount: string;
  currency: string;
  selectedAddons: string[];
  expiresAt: Date;
}

export interface PriceQuoteRepositoryPort {
  create(tx: TxClient, input: CreatePriceQuoteInput): Promise<PriceQuoteEntity>;
  findById(tx: TxClient, id: string): Promise<PriceQuoteEntity | null>;
  /**
   * Atomic ACTIVE → CONSUMED. Throws when the row was already consumed,
   * already expired, or concurrently mutated. Used by booking creation.
   */
  consumeQuote(tx: TxClient, id: string, bookingId: string, now: Date): Promise<PriceQuoteEntity>;
  /**
   * Bulk ACTIVE → EXPIRED for rows whose expiresAt is past `now`. Returns
   * the affected entities so the caller can emit one outbox event per row.
   * Used by the cleanup worker.
   */
  expireOlderThan(tx: TxClient, now: Date): Promise<PriceQuoteEntity[]>;
}
