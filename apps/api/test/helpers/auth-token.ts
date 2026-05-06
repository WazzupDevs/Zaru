import {
  JWT_TOKEN_SERVICE_PORT,
  type JwtTokenServicePort,
} from "../../src/modules/identity/application/ports/jwt-token.service.port";

import type { BuiltUser } from "./user-builder";
import type { INestApplication } from "@nestjs/common";

/**
 * Mints an access token for a user without going through the OTP/JWT
 * controller. Lets booking/dispatch/notifications integration suites
 * skip the OTP loop and exercise their own modules. Auth-flow specs
 * keep using the real /auth/otp/{request,verify} pair.
 */
export function signAccessTokenFor(app: INestApplication, user: BuiltUser): string {
  const jwt = app.get<JwtTokenServicePort>(JWT_TOKEN_SERVICE_PORT);
  return jwt.signAccess({ sub: user.id, role: user.role }, new Date()).token;
}
