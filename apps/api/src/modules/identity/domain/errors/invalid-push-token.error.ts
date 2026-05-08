import { DomainError } from "../../../../common/errors/domain-error";

/**
 * Thrown when the controller / use case receives a push token string
 * that doesn't match Expo's `ExponentPushToken[<opaque>]` shape. The
 * mobile app should never send a malformed token, so a 400 here points
 * at either a tampered request or a stale client build.
 */
export class InvalidPushTokenError extends DomainError {
  readonly code = "INVALID_PUSH_TOKEN";
  readonly httpStatus = 400;
}
