import { Inject, Injectable } from "@nestjs/common";

import { CLOCK_PORT, type ClockPort } from "../../../../common/clock/clock.port";
import {
  OUTBOX_WRITER_PORT,
  type OutboxWriterPort,
} from "../../../../common/persistence/outbox-writer.port";
import { TX_RUNNER_PORT, type TxRunnerPort } from "../../../../common/persistence/tx-runner.port";
import { RefreshExpiredError } from "../../domain/errors/refresh-expired.error";
import { RefreshNotFoundError } from "../../domain/errors/refresh-not-found.error";
import { RefreshReuseDetectedError } from "../../domain/errors/refresh-reuse-detected.error";
import { UserNotFoundError } from "../../domain/errors/user-not-found.error";
import {
  REFRESH_REUSE_DETECTED_EVENT_TYPE,
  type RefreshReuseDetectedEventPayload,
} from "../../domain/events/refresh-reuse-detected.event";
import {
  REFRESH_TOKENS_ISSUED_EVENT_TYPE,
  type RefreshTokensIssuedEventPayload,
} from "../../domain/events/refresh-tokens-issued.event";
import { JWT_TOKEN_SERVICE_PORT, type JwtTokenServicePort } from "../ports/jwt-token.service.port";
import {
  REFRESH_TOKEN_REPOSITORY_PORT,
  type RefreshTokenRepositoryPort,
} from "../ports/refresh-token.repository.port";
import { USER_REPOSITORY_PORT, type UserRepositoryPort } from "../ports/user.repository.port";

export interface RefreshTokensInput {
  refreshToken: string;
  ipAddress: string;
  userAgent?: string;
}

export interface RefreshTokensResult {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: Date;
  refreshTokenExpiresAt: Date;
  user: {
    id: string;
    phoneE164: string;
    role: "CUSTOMER" | "DRIVER" | "ADMIN" | "SUPPORT";
    displayName: string | null;
  };
}

/**
 * Reuse detection writes (cascade revoke + audit event) live in their own
 * transaction so they survive the throw that signals the caller. The
 * happy-path rotation runs in a single big transaction.
 */
@Injectable()
export class RefreshTokensUseCase {
  constructor(
    @Inject(REFRESH_TOKEN_REPOSITORY_PORT)
    private readonly refreshRepo: RefreshTokenRepositoryPort,
    @Inject(USER_REPOSITORY_PORT)
    private readonly userRepo: UserRepositoryPort,
    @Inject(JWT_TOKEN_SERVICE_PORT)
    private readonly jwt: JwtTokenServicePort,
    @Inject(CLOCK_PORT)
    private readonly clock: ClockPort,
    @Inject(OUTBOX_WRITER_PORT)
    private readonly outbox: OutboxWriterPort,
    @Inject(TX_RUNNER_PORT)
    private readonly tx: TxRunnerPort,
  ) {}

  async execute(input: RefreshTokensInput): Promise<RefreshTokensResult> {
    const now = this.clock.now();
    const incomingHash = this.jwt.hashRefresh(input.refreshToken);

    // Step 1: read-only lookup
    const existing = await this.tx.run((tx) => this.refreshRepo.findByHash(tx, incomingHash));
    if (!existing) {
      throw new RefreshNotFoundError("Refresh token not recognized");
    }

    // Step 2: reuse detection — separate tx, then throw.
    if (existing.revokedAt) {
      await this.tx.run(async (tx) => {
        await this.refreshRepo.revokeFamily(tx, existing.familyId, now);
        await this.outbox.write(tx, {
          aggregateType: "RefreshToken",
          aggregateId: existing.id,
          eventType: REFRESH_REUSE_DETECTED_EVENT_TYPE,
          payload: {
            userId: existing.userId,
            familyId: existing.familyId,
            replayedTokenId: existing.id,
            detectedAt: now.toISOString(),
            ...(input.ipAddress ? { ipAddress: input.ipAddress } : {}),
            ...(input.userAgent ? { userAgent: input.userAgent } : {}),
          } satisfies RefreshReuseDetectedEventPayload,
        });
      });
      throw new RefreshReuseDetectedError("Refresh token reuse detected");
    }

    if (existing.expiresAt.getTime() <= now.getTime()) {
      throw new RefreshExpiredError("Refresh token expired");
    }

    // Step 3: rotation in a single atomic tx.
    return this.tx.run(async (tx) => {
      const user = await this.userRepo.findActiveById(tx, existing.userId);
      if (!user) {
        throw new UserNotFoundError("User no longer exists");
      }

      const refreshSecret = this.jwt.generateRefresh(now);
      const newToken = await this.refreshRepo.issue(tx, {
        userId: user.id,
        tokenHash: refreshSecret.hash,
        familyId: existing.familyId,
        expiresAt: refreshSecret.expiresAt,
        ...(input.ipAddress ? { ipAddress: input.ipAddress } : {}),
        ...(input.userAgent ? { userAgent: input.userAgent } : {}),
      });
      await this.refreshRepo.revokeAndLink(tx, existing.id, newToken.id, now);

      const accessToken = this.jwt.signAccess({ sub: user.id, role: user.role }, now);

      await this.outbox.write(tx, {
        aggregateType: "RefreshToken",
        aggregateId: newToken.id,
        eventType: REFRESH_TOKENS_ISSUED_EVENT_TYPE,
        payload: {
          userId: user.id,
          refreshTokenId: newToken.id,
          familyId: existing.familyId,
          replacedTokenId: existing.id,
          issuedAt: newToken.createdAt.toISOString(),
          expiresAt: newToken.expiresAt.toISOString(),
          ...(input.ipAddress ? { ipAddress: input.ipAddress } : {}),
          ...(input.userAgent ? { userAgent: input.userAgent } : {}),
        } satisfies RefreshTokensIssuedEventPayload,
      });

      return {
        accessToken: accessToken.token,
        refreshToken: refreshSecret.plaintext,
        accessTokenExpiresAt: accessToken.expiresAt,
        refreshTokenExpiresAt: refreshSecret.expiresAt,
        user: {
          id: user.id,
          phoneE164: user.phoneE164,
          role: user.role,
          displayName: user.displayName,
        },
      };
    });
  }
}
