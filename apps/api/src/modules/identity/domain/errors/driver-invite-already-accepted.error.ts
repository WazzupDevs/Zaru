import { DomainError } from "../../../../common/errors/domain-error";

/**
 * Admin can't revoke an ACCEPTED invite — the driver is already in the
 * system, so a separate "deactivate driver" flow handles that (Faz 3+).
 * The accepted DriverInvite row stays as audit evidence of how the
 * driver got onboarded.
 */
export class DriverInviteAlreadyAcceptedError extends DomainError {
  readonly code = "DRIVER_INVITE_ALREADY_ACCEPTED";
  readonly httpStatus = 409;
}
