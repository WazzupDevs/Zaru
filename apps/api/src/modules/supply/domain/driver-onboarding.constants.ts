import type { DocumentType } from "@event-fleet/shared-types";

/**
 * Documents the driver must upload before submitting for review.
 * Resubmission flow can extend this in A4+ (e.g. for kasko-required vehicles).
 */
export const REQUIRED_DOCUMENT_TYPES: readonly DocumentType[] = [
  "DRIVER_LICENSE",
  "IDENTITY_CARD",
  "VEHICLE_REGISTRATION",
  "INSURANCE",
];

export const MIN_DRIVER_AGE_YEARS = 18;
