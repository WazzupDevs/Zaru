import { createHash, randomBytes } from "node:crypto";

import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import jwt, { type JwtPayload } from "jsonwebtoken";

import { UnauthorizedError } from "../../../../common/errors/domain-error";
import { type Env } from "../../../../config/env";

import type {
  AccessTokenClaims,
  JwtTokenServicePort,
  RefreshTokenSecret,
  SignedAccessToken,
} from "../../application/ports/jwt-token.service.port";

const ALGORITHM = "HS256" as const;

/**
 * HS256-signed JWT for access; raw 32-byte refresh tokens hashed with SHA-256
 * for storage. See ADR 0008.
 */
@Injectable()
export class JwtTokenService implements JwtTokenServicePort {
  private readonly accessSecret: string;
  private readonly accessTtlSec: number;
  private readonly refreshTtlSec: number;

  constructor(config: ConfigService<Env, true>) {
    this.accessSecret = config.get("JWT_ACCESS_SECRET", { infer: true });
    this.accessTtlSec = config.get("JWT_ACCESS_TTL_SECONDS", { infer: true });
    this.refreshTtlSec = config.get("JWT_REFRESH_TTL_SECONDS", { infer: true });
  }

  signAccess(claims: AccessTokenClaims, now: Date): SignedAccessToken {
    const iat = Math.floor(now.getTime() / 1000);
    const exp = iat + this.accessTtlSec;
    const token = jwt.sign(
      {
        sub: claims.sub,
        role: claims.role,
        iat,
        exp,
        ...(claims.requestId ? { requestId: claims.requestId } : {}),
      },
      this.accessSecret,
      { algorithm: ALGORITHM },
    );
    return { token, expiresAt: new Date(exp * 1000) };
  }

  verifyAccess(token: string): AccessTokenClaims {
    let payload: string | JwtPayload;
    try {
      payload = jwt.verify(token, this.accessSecret, { algorithms: [ALGORITHM] });
    } catch {
      throw new UnauthorizedError("Invalid or expired access token");
    }
    if (typeof payload !== "object" || !payload.sub || typeof payload.sub !== "string") {
      throw new UnauthorizedError("Malformed access token");
    }
    const role = (payload as JwtPayload & { role?: unknown }).role;
    if (typeof role !== "string") {
      throw new UnauthorizedError("Malformed access token (role)");
    }
    return {
      sub: payload.sub,
      role: role as AccessTokenClaims["role"],
      ...(typeof (payload as Record<string, unknown>).requestId === "string"
        ? { requestId: (payload as Record<string, unknown>).requestId as string }
        : {}),
    };
  }

  generateRefresh(now: Date): RefreshTokenSecret {
    const plaintext = randomBytes(32).toString("base64url");
    const hash = this.hashRefresh(plaintext);
    const expiresAt = new Date(now.getTime() + this.refreshTtlSec * 1000);
    return { plaintext, hash, expiresAt };
  }

  hashRefresh(plaintext: string): string {
    return createHash("sha256").update(plaintext).digest("hex");
  }
}
