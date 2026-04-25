import { SetMetadata } from "@nestjs/common";

import type { UserRole } from "@event-fleet/shared-types";

export const ROLES_METADATA_KEY = "roles";

/**
 * Routes annotated with `@Roles(UserRole.ADMIN, ...)` require the
 * authenticated user's role to be in the listed set. Used together with
 * the global JwtAuthGuard + RolesGuard.
 */
export const Roles = (...roles: UserRole[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_METADATA_KEY, roles);
