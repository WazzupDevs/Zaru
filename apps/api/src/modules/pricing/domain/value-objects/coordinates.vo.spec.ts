import { describe, expect, it } from "vitest";

import { CoordinatesVO } from "./coordinates.vo";
import { InvalidCoordinatesError } from "../errors/invalid-coordinates.error";

describe("CoordinatesVO", () => {
  it("accepts İstanbul (Sultanahmet) coordinates", () => {
    const c = CoordinatesVO.create(41.0082, 28.9784);
    expect(c.toLatLng()).toEqual({ lat: 41.0082, lng: 28.9784 });
  });

  it("rejects lat > 90", () => {
    expect(() => CoordinatesVO.create(91, 0)).toThrowError(InvalidCoordinatesError);
  });

  it("rejects lat < -90", () => {
    expect(() => CoordinatesVO.create(-90.1, 0)).toThrowError(/lat out of range/);
  });

  it("rejects lng > 180", () => {
    expect(() => CoordinatesVO.create(0, 181)).toThrowError(/lng out of range/);
  });

  it("rejects lng < -180", () => {
    expect(() => CoordinatesVO.create(0, -180.5)).toThrowError(InvalidCoordinatesError);
  });

  it("clamps to 7-decimal precision", () => {
    const c = CoordinatesVO.create("41.00825554999", "28.97849999");
    expect(c.lat.toString()).toBe("41.0082555");
    expect(c.lng.toString()).toBe("28.9785");
  });
});
