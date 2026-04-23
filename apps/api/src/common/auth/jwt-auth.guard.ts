import { CanActivate, ExecutionContext, Inject, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import { IS_PUBLIC_METADATA_KEY } from "./public.decorator";
import {
  JWT_TOKEN_SERVICE_PORT,
  type JwtTokenServicePort,
} from "../../modules/identity/application/ports/jwt-token.service.port";
import { UnauthorizedError } from "../errors/domain-error";
import { PrismaService } from "../prisma/prisma.service";
import { RequestContextService } from "../request-context/request-context.service";

import type { AuthUser } from "./current-user.decorator";
import type { Request } from "express";

/**
 * Global auth guard. Routes are guarded by default; @Public() bypasses.
 * Verifies the access JWT, looks up the (active) user, attaches it to
 * the request and writes userId into RequestContext for downstream
 * logging.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(JWT_TOKEN_SERVICE_PORT)
    private readonly jwt: JwtTokenServicePort,
    private readonly prisma: PrismaService,
    private readonly ctx: RequestContextService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_METADATA_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const auth = req.header("authorization");
    if (!auth?.startsWith("Bearer ")) {
      throw new UnauthorizedError("Missing Bearer access token");
    }
    const token = auth.slice("Bearer ".length).trim();
    if (!token) {
      throw new UnauthorizedError("Empty access token");
    }

    const claims = this.jwt.verifyAccess(token);

    // Hydrate from DB so downstream sees up-to-date displayName + soft-delete state.
    const user = await this.prisma.client.user.findFirst({
      where: { id: claims.sub, deletedAt: null },
    });
    if (!user) {
      throw new UnauthorizedError("User no longer exists or was deleted");
    }

    const authUser: AuthUser = {
      id: user.id,
      phoneE164: user.phoneE164,
      role: user.role,
      displayName: user.displayName,
    };
    req.user = authUser;
    this.ctx.setUserId(user.id);
    return true;
  }
}
