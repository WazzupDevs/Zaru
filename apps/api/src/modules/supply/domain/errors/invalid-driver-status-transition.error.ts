import type { DriverOnboardingStatus } from "@event-fleet/shared-types";

import { DomainError } from "../../../../common/errors/domain-error";

export class InvalidDriverStatusTransitionError extends DomainError {
  readonly code = "SUPPLY_INVALID_DRIVER_STATUS_TRANSITION";
  readonly httpStatus = 409;

  constructor(from: DriverOnboardingStatus, to: DriverOnboardingStatus) {
    super(`Cannot transition driver profile from ${from} to ${to}.`, { from, to });
  }
}
