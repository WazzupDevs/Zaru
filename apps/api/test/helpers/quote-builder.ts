import request from "supertest";

import type { INestApplication } from "@nestjs/common";

export interface QuoteBuilderInput {
  /** Bearer token (signAccessTokenFor). */
  token: string;
  vehicleTypeId: string;
  categoryId: string;
  /** Defaults to Sultanahmet — same pin as the smoke flow. */
  pickupLat?: number;
  pickupLng?: number;
  /** Defaults to Beşiktaş. */
  dropoffLat?: number;
  dropoffLng?: number;
  pickupAddress?: string;
  dropoffAddress?: string;
  /** Defaults to a Saturday in August (compound multiplier window). */
  eventStartAt?: Date;
  /** Defaults to eventStartAt + 8h. */
  eventEndAt?: Date;
  selectedAddonIds?: string[];
}

export interface BuiltQuote {
  id: string;
  totalAmount: string;
  currency: string;
  status: string;
  expiresAt: string;
}

const DEFAULT_START = new Date("2026-08-15T14:00:00.000Z");
const DEFAULT_END = new Date("2026-08-15T22:00:00.000Z");

/**
 * Hits POST /pricing/quotes via supertest. Defaults match the smoke
 * flow's compound-multiplier case (6877.00 TRY) so a vanilla call
 * exercises both seasonal + weekend rules.
 */
export async function buildQuote(
  app: INestApplication,
  input: QuoteBuilderInput,
): Promise<BuiltQuote> {
  const start = input.eventStartAt ?? DEFAULT_START;
  const end = input.eventEndAt ?? DEFAULT_END;
  const res = await request(app.getHttpServer())
    .post("/pricing/quotes")
    .set("Authorization", `Bearer ${input.token}`)
    .send({
      vehicleTypeId: input.vehicleTypeId,
      categoryId: input.categoryId,
      pickupLat: input.pickupLat ?? 41.0082,
      pickupLng: input.pickupLng ?? 28.9784,
      dropoffLat: input.dropoffLat ?? 41.0428,
      dropoffLng: input.dropoffLng ?? 29.0093,
      pickupAddress: input.pickupAddress ?? "Sultanahmet Mahallesi, Fatih, İstanbul",
      dropoffAddress: input.dropoffAddress ?? "Beşiktaş Merkez, Beşiktaş, İstanbul",
      eventStartAt: start.toISOString(),
      eventEndAt: end.toISOString(),
      selectedAddonIds: input.selectedAddonIds ?? [],
    });
  if (res.status !== 201 && res.status !== 200) {
    throw new Error(`buildQuote failed: ${String(res.status)} ${JSON.stringify(res.body)}`);
  }
  const body = res.body as BuiltQuote;
  return {
    id: body.id,
    totalAmount: body.totalAmount,
    currency: body.currency,
    status: body.status,
    expiresAt: body.expiresAt,
  };
}
