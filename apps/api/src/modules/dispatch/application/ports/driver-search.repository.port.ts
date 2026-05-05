import type { TxClient } from "../../../../common/persistence/tx-client";
import type { DriverCandidate } from "../../domain/services/driver-matcher.service";

export const DRIVER_SEARCH_REPOSITORY_PORT = Symbol("DRIVER_SEARCH_REPOSITORY_PORT");

export interface DriverSearchInput {
  vehicleTypeId: string;
  pickupLat: number;
  pickupLng: number;
  eventStartAt: Date;
  eventEndAt: Date;
  maxRadiusKm: number;
  /** Drivers to skip (used by manual reassign — exclude the previous driver). */
  excludeDriverIds?: string[];
  /** Drivers whose location is older than this are filtered out. */
  locationFreshnessSeconds: number;
}

/**
 * Encapsulates the multi-table PostGIS query that finds drivers eligible
 * for a booking. The query enforces the hard filters (status, online,
 * vehicle type, radius, availability conflicts); DriverMatcher applies
 * the soft scoring on top.
 */
export interface DriverSearchRepositoryPort {
  findCandidates(tx: TxClient, input: DriverSearchInput): Promise<DriverCandidate[]>;
}
