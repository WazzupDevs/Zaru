import { Decimal } from "decimal.js";

import { InvalidCoordinatesError } from "../errors/invalid-coordinates.error";

/**
 * WGS84 lat/lng pair. Stored at 7-decimal precision (~1.1 cm at equator),
 * matching the schema column types.
 */
export class CoordinatesVO {
  private constructor(
    readonly lat: Decimal,
    readonly lng: Decimal,
  ) {}

  static create(lat: number | string | Decimal, lng: number | string | Decimal): CoordinatesVO {
    const latD = new Decimal(lat);
    const lngD = new Decimal(lng);
    if (latD.lessThan(-90) || latD.greaterThan(90)) {
      throw new InvalidCoordinatesError(`lat out of range: ${latD.toString()}`);
    }
    if (lngD.lessThan(-180) || lngD.greaterThan(180)) {
      throw new InvalidCoordinatesError(`lng out of range: ${lngD.toString()}`);
    }
    return new CoordinatesVO(
      latD.toDecimalPlaces(7, Decimal.ROUND_HALF_UP),
      lngD.toDecimalPlaces(7, Decimal.ROUND_HALF_UP),
    );
  }

  toLatLng(): { lat: number; lng: number } {
    return { lat: this.lat.toNumber(), lng: this.lng.toNumber() };
  }
}
