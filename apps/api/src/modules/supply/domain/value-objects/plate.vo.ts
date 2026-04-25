import { InvalidPlateError } from "../errors/invalid-plate.error";

/**
 * Turkish vehicle license plate. Layout: 2-digit province code + 1-3 letters
 * + 2-4 digits (e.g. "34 ABC 1234"). Stored normalized — uppercase, no
 * spaces — so duplicate detection works on a single shape.
 */
export class PlateVO {
  private constructor(readonly value: string) {}

  static create(raw: string): PlateVO {
    const cleaned = raw.replace(/\s/g, "").toUpperCase();
    if (!/^\d{2}[A-Z]{1,3}\d{2,4}$/.test(cleaned)) {
      throw new InvalidPlateError();
    }
    return new PlateVO(cleaned);
  }

  toString(): string {
    return this.value;
  }
}
