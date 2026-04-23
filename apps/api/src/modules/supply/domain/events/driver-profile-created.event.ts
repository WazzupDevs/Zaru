export const DRIVER_PROFILE_CREATED_EVENT_TYPE = "supply.DriverProfileCreated";

/**
 * NOTE: PII (nationalId, IBAN) MUST NOT appear in this payload. Subscribers
 * have no business with the raw values; they get hashes via the repository
 * if they truly need them. ADR 0016.
 */
export interface DriverProfileCreatedEventPayload {
  driverProfileId: string;
  userId: string;
  firstName: string;
  lastName: string;
  ibanLast4: string;
  createdAt: string;
}
