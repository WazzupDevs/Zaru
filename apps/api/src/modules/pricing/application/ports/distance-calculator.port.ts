export const DISTANCE_CALCULATOR_PORT = Symbol("DISTANCE_CALCULATOR_PORT");

export interface DistanceCalculationInput {
  origin: { lat: number; lng: number };
  destination: { lat: number; lng: number };
  /** Defaults to "driving" — only mode supported for the wedding-car vertical. */
  mode?: "driving";
  /** Optional traffic-aware estimate; ignored by the mock adapter. */
  departureTime?: Date;
}

export interface DistanceCalculationResult {
  distanceKm: number;
  durationMinutes: number;
  /** Present only when departureTime was supplied AND adapter supports it. */
  durationInTrafficMinutes?: number;
}

/**
 * Boundary so the pricing use cases never hard-depend on Google Maps. The
 * factory in pricing.module.ts swaps in MockDistanceCalculator (haversine)
 * when GOOGLE_MAPS_API_KEY starts with "AIzaSy_DUMMY". ADR 0018.
 */
export interface DistanceCalculatorPort {
  calculate(input: DistanceCalculationInput): Promise<DistanceCalculationResult>;
}
