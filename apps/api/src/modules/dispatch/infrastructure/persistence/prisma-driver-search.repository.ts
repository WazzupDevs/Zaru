import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";

import type { TxClient } from "../../../../common/persistence/tx-client";
import type {
  DriverSearchInput,
  DriverSearchRepositoryPort,
} from "../../application/ports/driver-search.repository.port";
import type { DriverCandidate } from "../../domain/services/driver-matcher.service";

/**
 * PostGIS-backed driver candidate query. Combines five filters in one
 * pass — done in SQL because each row otherwise needs a per-driver
 * roundtrip:
 *
 *   1. Driver APPROVED + online + recent location update (configurable)
 *   2. Vehicle ACTIVE + matches requested vehicle type
 *   3. Driver location within radius (ST_DWithin uses GIST index)
 *   4. No vehicle availability row overlapping the event window
 *      (tstzrange `&&` operator on half-open ranges)
 *   5. Driver has no other active booking overlapping the event window
 *
 * Mesafe (km) skoring için döndürülür; en yakın 50 satır LIMIT'i, app
 * tarafı (DriverMatcher) skor sıralı seçim yapar.
 *
 * Note on raw types: $queryRaw returns plain JS objects, but Postgres
 * NUMERIC comes through as string. We cast explicitly via Number() in
 * the toCandidate mapper. UUIDs come through as strings already.
 */
@Injectable()
export class PrismaDriverSearchRepository implements DriverSearchRepositoryPort {
  async findCandidates(tx: TxClient, input: DriverSearchInput): Promise<DriverCandidate[]> {
    const radiusMeters = input.maxRadiusKm * 1000;
    const excludeClause =
      input.excludeDriverIds && input.excludeDriverIds.length > 0
        ? Prisma.sql`AND dp.id NOT IN (${Prisma.join(input.excludeDriverIds)})`
        : Prisma.empty;

    const rows = await tx.$queryRaw<RawCandidateRow[]>(Prisma.sql`
      SELECT
        dp.id              AS "driverProfileId",
        dp.user_id         AS "userId",
        v.id               AS "vehicleId",
        v.vehicle_type_id  AS "vehicleTypeId",
        ST_Distance(
          dp.last_known_location,
          ST_SetSRID(ST_MakePoint(${input.pickupLng}::float, ${input.pickupLat}::float), 4326)::geography
        ) / 1000.0         AS "distanceKmRaw",
        dp.rating_average  AS "ratingAverageRaw",
        dp.rating_count    AS "ratingCount"
      FROM driver_profiles dp
      JOIN vehicles v ON v.driver_profile_id = dp.id
      WHERE dp.deleted_at IS NULL
        AND dp.status = 'APPROVED'
        AND dp.is_online = true
        AND dp.last_known_location IS NOT NULL
        AND dp.last_location_update > NOW() - (${input.locationFreshnessSeconds}::int || ' seconds')::interval
        AND v.deleted_at IS NULL
        AND v.status = 'ACTIVE'
        AND v.vehicle_type_id = ${input.vehicleTypeId}::uuid
        AND ST_DWithin(
          dp.last_known_location,
          ST_SetSRID(ST_MakePoint(${input.pickupLng}::float, ${input.pickupLat}::float), 4326)::geography,
          ${radiusMeters}::float
        )
        AND NOT EXISTS (
          SELECT 1 FROM vehicle_availabilities va
          WHERE va.vehicle_id = v.id
            AND va.deleted_at IS NULL
            AND tstzrange(va.start_at, va.end_at, '[)') &&
                tstzrange(${input.eventStartAt}::timestamptz, ${input.eventEndAt}::timestamptz, '[)')
        )
        AND NOT EXISTS (
          SELECT 1 FROM bookings b
          WHERE b.driver_id = dp.id
            AND b.deleted_at IS NULL
            AND b.status IN ('CONFIRMED', 'DRIVER_ASSIGNED', 'IN_PROGRESS')
            AND tstzrange(b.event_start_at, b.event_end_at, '[)') &&
                tstzrange(${input.eventStartAt}::timestamptz, ${input.eventEndAt}::timestamptz, '[)')
        )
        ${excludeClause}
      ORDER BY "distanceKmRaw" ASC
      LIMIT 50
    `);

    return rows.map(toCandidate);
  }
}

interface RawCandidateRow {
  driverProfileId: string;
  userId: string;
  vehicleId: string;
  vehicleTypeId: string;
  distanceKmRaw: string | number;
  ratingAverageRaw: string | number;
  ratingCount: number;
}

function toCandidate(r: RawCandidateRow): DriverCandidate {
  return {
    driverProfileId: r.driverProfileId,
    userId: r.userId,
    vehicleId: r.vehicleId,
    vehicleTypeId: r.vehicleTypeId,
    distanceKm: typeof r.distanceKmRaw === "number" ? r.distanceKmRaw : Number(r.distanceKmRaw),
    ratingAverage:
      typeof r.ratingAverageRaw === "number" ? r.ratingAverageRaw : Number(r.ratingAverageRaw),
    ratingCount: r.ratingCount,
  };
}
