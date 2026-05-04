import { describe, expect, it } from "vitest";

import { MockDistanceCalculator } from "./mock-distance-calculator";

describe("MockDistanceCalculator", () => {
  const calc = new MockDistanceCalculator();

  it("returns 0 km / 0 min for identical coordinates", async () => {
    const r = await calc.calculate({
      origin: { lat: 41.0082, lng: 28.9784 },
      destination: { lat: 41.0082, lng: 28.9784 },
    });
    expect(r.distanceKm).toBe(0);
    expect(r.durationMinutes).toBe(0);
  });

  it("İstanbul: Sultanahmet → Beşiktaş ≈ 5–8 km haversine × 1.4", async () => {
    const r = await calc.calculate({
      origin: { lat: 41.0082, lng: 28.9784 },
      destination: { lat: 41.0428, lng: 29.0093 },
    });
    expect(r.distanceKm).toBeGreaterThan(4);
    expect(r.distanceKm).toBeLessThan(10);
    expect(r.durationMinutes).toBeGreaterThan(0);
  });

  it("symmetric: A→B === B→A", async () => {
    const a = { lat: 41.0082, lng: 28.9784 };
    const b = { lat: 41.0428, lng: 29.0093 };
    const ab = await calc.calculate({ origin: a, destination: b });
    const ba = await calc.calculate({ origin: b, destination: a });
    expect(ab.distanceKm).toBe(ba.distanceKm);
    expect(ab.durationMinutes).toBe(ba.durationMinutes);
  });
});
