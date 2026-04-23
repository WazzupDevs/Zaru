import { createParamDecorator, type ExecutionContext } from "@nestjs/common";

import type { UserRole } from "@event-fleet/shared-types";

import { UnauthorizedError } from "../errors/domain-error";

import type { Request } from "express";

/** Authenticated user attached to the request by JwtAuthGuard. */
export interface AuthUser {
  id: string;
  phoneE164: string;
  role: UserRole;
  displayName: string | null;
}

/**
 * Resolves the authenticated user that JwtAuthGuard placed on the request.
 * Throwing here (instead of returning undefined) keeps controllers honest:
 * if you reached this decorator, auth was supposed to have run.
 */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const req = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>();
  if (!req.user) {
    throw new UnauthorizedError("No authenticated user on request");
  }
  return req.user;
});
