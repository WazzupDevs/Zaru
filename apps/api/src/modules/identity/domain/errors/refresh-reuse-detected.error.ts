import { DomainError } from "../../../../common/errors/domain-error";

/**
 * A refresh token that was already revoked was replayed. The use case
 * cascades a revoke across the entire token family before throwing this.
 * Client must re-authenticate via OTP. See ADR 0008.
 */
export class RefreshReuseDetectedError extends DomainError {
  readonly code = "REFRESH_REUSE_DETECTED";
  readonly httpStatus = 401;
}
