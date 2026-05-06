import { createHmac } from "node:crypto";

import { buildUser, type BuiltUser } from "./user-builder";

import type { PrismaClient } from "@prisma/client";

export interface DriverBuilderInput {
  user?: BuiltUser;
  vehicleTypeId: string;
  /** Default Sultanahmet — same coordinates the smoke uses for pickup. */
  lat?: number;
  lng?: number;
  isOnline?: boolean;
  ratingAverage?: number;
  /** Set to a date in the past to simulate stale location. */
  lastLocationUpdate?: Date;
  vehicleColor?: string;
  brand?: string;
  model?: string;
  plateNumber?: string;
}

export interface BuiltDriver {
  user: BuiltUser;
  driverProfileId: string;
  vehicleId: string;
  plateNumber: string;
}

/**
 * Inserts the full Driver chain (User + DriverProfile APPROVED +
 * Vehicle ACTIVE) so dispatch tests have a candidate to match.
 * Coordinates default to the Sultanahmet pin used by the smoke flow
 * — keep tests in the same neighbourhood unless the spec is explicitly
 * about distance filtering.
 *
 * national_id_hash + iban_hash are deterministic dummies (HMAC against
 * a fixed secret) — never used for matching, only present to satisfy
 * the schema's NOT NULL constraint.
 */
export async function buildDriver(
  prisma: PrismaClient,
  input: DriverBuilderInput,
): Promise<BuiltDriver> {
  const user =
    input.user ?? (await buildUser(prisma, { role: "DRIVER", displayName: "Test Sürücü" }));

  // Per-test unique HMAC input so concurrent specs don't collide on the
  // unique national_id_hash partial index.
  const seed = `${user.id}-${Date.now().toString()}-${Math.random().toString()}`;
  const hash = (label: string): string =>
    createHmac("sha256", "test-secret").update(`${label}:${seed}`).digest("hex");

  const driverProfile = await prisma.driverProfile.create({
    data: {
      userId: user.id,
      firstName: "Test",
      lastName: "Sürücü",
      birthDate: new Date("1990-01-01"),
      nationalIdHash: hash("tckn"),
      ibanHash: hash("iban"),
      ibanLast4: "0000",
      status: "APPROVED",
      approvedAt: new Date(),
      isOnline: input.isOnline ?? true,
      lastKnownLat: input.lat ?? 41.0082,
      lastKnownLng: input.lng ?? 28.9784,
      lastLocationUpdate: input.lastLocationUpdate ?? new Date(),
      ratingAverage: input.ratingAverage ?? 5.0,
      ratingCount: 0,
    },
  });

  const plateNumber =
    input.plateNumber ??
    `34TEST${Math.floor(Math.random() * 100_000)
      .toString()
      .padStart(5, "0")}`;
  const vehicle = await prisma.vehicle.create({
    data: {
      driverProfileId: driverProfile.id,
      vehicleTypeId: input.vehicleTypeId,
      brand: input.brand ?? "Renault",
      model: input.model ?? "Symbol",
      year: 2022,
      color: input.vehicleColor ?? "ivory",
      plateNumber,
      attributes: {
        trim_color: "ivory",
        has_air_conditioning: true,
        has_chauffeur: true,
      },
      photoKeys: [],
      status: "ACTIVE",
    },
  });

  return {
    user,
    driverProfileId: driverProfile.id,
    vehicleId: vehicle.id,
    plateNumber,
  };
}
