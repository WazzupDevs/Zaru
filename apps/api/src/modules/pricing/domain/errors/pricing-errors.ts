import { DomainError } from "../../../../common/errors/domain-error";

export class InvalidTimeRangeError extends DomainError {
  readonly code = "PRICING_INVALID_TIME_RANGE";
  readonly httpStatus = 400;
  constructor(reason: string) {
    super(`Invalid event time range: ${reason}`, { reason });
  }
}

export class PricingProfileNotFoundError extends DomainError {
  readonly code = "PRICING_PROFILE_NOT_FOUND";
  readonly httpStatus = 404;
  constructor() {
    super("No active pricing profile for this vehicle type.");
  }
}

export class DistanceCalculationFailedError extends DomainError {
  readonly code = "PRICING_DISTANCE_CALCULATION_FAILED";
  readonly httpStatus = 502;
  constructor(reason: string) {
    super(`Distance calculation failed: ${reason}`, { reason });
  }
}

export class QuoteNotFoundError extends DomainError {
  readonly code = "PRICING_QUOTE_NOT_FOUND";
  readonly httpStatus = 404;
  constructor() {
    super("Price quote not found.");
  }
}

export class QuoteExpiredError extends DomainError {
  readonly code = "PRICING_QUOTE_EXPIRED";
  readonly httpStatus = 410;
  constructor() {
    super("Price quote has expired. Request a fresh quote.");
  }
}

export class QuoteAlreadyConsumedError extends DomainError {
  readonly code = "PRICING_QUOTE_ALREADY_CONSUMED";
  readonly httpStatus = 409;
  constructor() {
    super("Price quote was already used to create a booking.");
  }
}

export class InvalidAddonSelectionError extends DomainError {
  readonly code = "PRICING_INVALID_ADDON_SELECTION";
  readonly httpStatus = 400;
  constructor(unknownAddonIds: string[]) {
    super("One or more selected addons are not valid for this booking context.", {
      unknownAddonIds,
    });
  }
}
