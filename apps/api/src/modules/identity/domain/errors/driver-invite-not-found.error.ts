import { DomainError } from "../../../../common/errors/domain-error";

export class DriverInviteNotFoundError extends DomainError {
  readonly code = "DRIVER_INVITE_NOT_FOUND";
  readonly httpStatus = 404;
}
