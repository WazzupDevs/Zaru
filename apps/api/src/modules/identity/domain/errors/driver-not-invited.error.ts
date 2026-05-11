import { DomainError } from "../../../../common/errors/domain-error";

/**
 * Whitelist guard. Closed-beta driver app only accepts phones with a
 * PENDING DriverInvite row. The OTP request endpoint short-circuits
 * BEFORE sending an SMS so we don't burn provider credits on uninvited
 * numbers + don't reveal "did this number get invited" via SMS receipt.
 *
 * 403, not 401 — the request is properly authenticated (no auth needed
 * for OTP request) but the resource (driver login) is gated.
 */
export class DriverNotInvitedError extends DomainError {
  readonly code = "DRIVER_NOT_INVITED";
  readonly httpStatus = 403;
}
