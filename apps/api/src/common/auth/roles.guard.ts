import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import type { UserRole } from "@event-fleet/shared-types";

import { ROLES_METADATA_KEY } from "./roles.decorator";
import { ForbiddenError, UnauthorizedError } from "../errors/domain-error";

import type { AuthUser } from "./current-user.decorator";
import type { Request } from "express";

/**
 * Runs after JwtAuthGuard. If the route exposes a `@Roles(...)` list, the
 * authenticated user must be in it; otherwise pass through (auth alone is
 * enough).
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES_METADATA_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const req = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const user = req.user;
    if (!user) throw new UnauthorizedError("Authenticated user required for this route.");
    if (!required.includes(user.role)) {
      throw new ForbiddenError(
        `This route requires one of: ${required.join(", ")} (you are ${user.role}).`,
      );
    }
    return true;
  }
}
