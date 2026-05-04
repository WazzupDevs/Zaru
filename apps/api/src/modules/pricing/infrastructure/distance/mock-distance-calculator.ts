import { Injectable } from "@nestjs/common";

import type {
  DistanceCalculationInput,
  DistanceCalculationResult,
  DistanceCalculatorPort,
} from "../../application/ports/distance-calculator.port";

const EARTH_RADIUS_KM = 6371;
const ROUTE_FACTOR = 1.4; // straight-line × 1.4 ≈ realistic road distance
const AVG_SPEED_KMH = 40;

/**
 * Deterministic offline replacement for Google Maps Distance Matrix.
 * Active when `GOOGLE_MAPS_API_KEY` starts with "AIzaSy_DUMMY". Tests use this
 * unconditionally so they never hit the network. ADR 0018.
 */
@Injectable()
export class MockDistanceCalculator implements DistanceCalculatorPort {
  calculate(input: DistanceCalculationInput): Promise<DistanceCalculationResult> {
    const straight = haversineKm(input.origin, input.destination);
    const distanceKm = round2(straight * ROUTE_FACTOR);
    const durationMinutes = Math.ceil((distanceKm / AVG_SPEED_KMH) * 60);
    return Promise.resolve({ distanceKm, durationMinutes });
  }
}

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLng * sinLng;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
