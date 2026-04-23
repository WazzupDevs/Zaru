import { SetMetadata } from "@nestjs/common";

export const IS_PUBLIC_METADATA_KEY = "auth:isPublic";

/**
 * Marks a route handler (or whole controller) as not requiring an
 * authenticated user. The global JwtAuthGuard short-circuits on this.
 * Use sparingly — login, OTP, health, version are the legit cases.
 */
export const Public = (): MethodDecorator & ClassDecorator =>
  SetMetadata(IS_PUBLIC_METADATA_KEY, true);
