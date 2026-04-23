import { randomUUID } from "node:crypto";

import { Inject, Injectable, Optional } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as argon2 from "argon2";

import { CLOCK_PORT, type ClockPort } from "../../../../common/clock/clock.port";
import {
  RATE_LIMITER_PORT,
  type RateLimiterPort,
} from "../../../../common/rate-limit/rate-limiter.port";
import { type Env } from "../../../../config/env";
import { InvalidOtpError } from "../../domain/errors/invalid-otp.error";
import { OtpAlreadyConsumedError } from "../../domain/errors/otp-already-consumed.error";
import { OtpExpiredError } from "../../domain/errors/otp-expired.error";
import { OtpNotFoundError } from "../../domain/errors/otp-not-found.error";
import { VerifyRateLimitedError } from "../../domain/errors/verify-rate-limited.error";
import {
  OTP_VERIFIED_EVENT_TYPE,
  type OtpVerifiedEventPayload,
} from "../../domain/events/otp-verified.event";
import {
  REFRESH_TOKENS_ISSUED_EVENT_TYPE,
  type RefreshTokensIssuedEventPayload,
} from "../../domain/events/refresh-tokens-issued.event";
import {
  USER_CREATED_EVENT_TYPE,
  type UserCreatedEventPayload,
} from "../../domain/events/user-created.event";
import {
  USER_LOGGED_IN_EVENT_TYPE,
  type UserLoggedInEventPayload,
} from "../../domain/events/user-logged-in.event";
import { OtpCodeVO } from "../../domain/value-objects/otp-code.vo";
import { PhoneVO } from "../../domain/value-objects/phone.vo";
import { JWT_TOKEN_SERVICE_PORT, type JwtTokenServicePort } from "../ports/jwt-token.service.port";
import {
  OTP_REQUEST_REPOSITORY_PORT,
  type OtpRequestRepositoryPort,
} from "../ports/otp-request.repository.port";
import { OUTBOX_WRITER_PORT, type OutboxWriterPort } from "../ports/outbox-writer.port";
import {
  REFRESH_TOKEN_REPOSITORY_PORT,
  type RefreshTokenRepositoryPort,
} from "../ports/refresh-token.repository.port";
import { TX_RUNNER_PORT, type TxRunnerPort } from "../ports/tx-runner.port";
import {
  USER_REPOSITORY_PORT,
  type UserRecord,
  type UserRepositoryPort,
} from "../ports/user.repository.port";

const DEFAULT_MAX_ATTEMPTS = 5;
const VERIFY_PHONE_HOUR_LIMIT = 10;
const VERIFY_PHONE_HOUR_WINDOW_S = 3600;

export interface VerifyOtpInput {
  phone: string;
  requestId: string;
  code: string;
  ipAddress: string;
  userAgent?: string;
  deviceId?: string;
}

export interface VerifyOtpResult {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: Date;
  refreshTokenExpiresAt: Date;
  user: {
    id: string;
    phoneE164: string;
    role: UserRecord["role"];
    displayName: string | null;
  };
}

/**
 * Wrong-code increments and OTP-burn writes use **separate** short transactions
 * so they survive even when the use case throws. Only the success path opens
 * the big transaction (user upsert + token issue + outbox events).
 */
@Injectable()
export class VerifyOtpUseCase {
  private readonly maxAttempts: number;

  constructor(
    @Inject(OTP_REQUEST_REPOSITORY_PORT)
    private readonly otpRepo: OtpRequestRepositoryPort,
    @Inject(USER_REPOSITORY_PORT)
    private readonly userRepo: UserRepositoryPort,
    @Inject(REFRESH_TOKEN_REPOSITORY_PORT)
    private readonly refreshRepo: RefreshTokenRepositoryPort,
    @Inject(JWT_TOKEN_SERVICE_PORT)
    private readonly jwt: JwtTokenServicePort,
    @Inject(CLOCK_PORT)
    private readonly clock: ClockPort,
    @Inject(OUTBOX_WRITER_PORT)
    private readonly outbox: OutboxWriterPort,
    @Inject(TX_RUNNER_PORT)
    private readonly tx: TxRunnerPort,
    @Inject(RATE_LIMITER_PORT)
    private readonly rateLimiter: RateLimiterPort,
    @Optional() config?: ConfigService<Env, true>,
  ) {
    this.maxAttempts =
      config?.get("OTP_MAX_VERIFY_ATTEMPTS", { infer: true }) ?? DEFAULT_MAX_ATTEMPTS;
  }

  async execute(input: VerifyOtpInput): Promise<VerifyOtpResult> {
    const phone = PhoneVO.create(input.phone);
    const code = OtpCodeVO.create(input.code);
    const now = this.clock.now();

    // Step 0: rate-limit verify attempts per phone (covers brute-force across
    // multiple OTP requests). Counted on every entry; not coupled to OTP row.
    const verifyLimit = await this.rateLimiter.check({
      key: `rl:otp:verify:phone:${phone.value}`,
      limit: VERIFY_PHONE_HOUR_LIMIT,
      windowSeconds: VERIFY_PHONE_HOUR_WINDOW_S,
    });
    if (!verifyLimit.allowed) {
      throw new VerifyRateLimitedError(verifyLimit.retryAfterSeconds ?? 3600);
    }

    // Step 1: read OTP row in its own (read-only) tx so even validation
    // failures get a consistent snapshot.
    const row = await this.tx.run(async (tx) =>
      this.otpRepo.findByIdAndPhone(tx, input.requestId, phone.value),
    );
    if (!row) {
      throw new OtpNotFoundError("OTP request not found for this phone");
    }
    if (row.consumedAt) {
      throw new OtpAlreadyConsumedError("OTP already used");
    }
    if (row.expiresAt.getTime() <= now.getTime()) {
      throw new OtpExpiredError("OTP expired");
    }

    // Step 2: hash compare (CPU-bound, no DB).
    const matches = await argon2.verify(row.codeHash, code.value);

    // Step 3a: wrong code — bump attempt and (if maxed) burn, in its own tx.
    if (!matches) {
      const remaining = await this.tx.run(async (tx) => {
        const newAttempts = await this.otpRepo.incrementAttempt(tx, row.id);
        if (newAttempts >= this.maxAttempts) {
          await this.otpRepo.consume(tx, row.id, now);
          return 0;
        }
        return this.maxAttempts - newAttempts;
      });
      throw new InvalidOtpError(
        remaining === 0 ? "OTP invalidated after too many attempts" : "Invalid OTP code",
        { remainingAttempts: remaining },
      );
    }

    // Step 3b: success — big atomic tx (consume + user + tokens + outbox).
    return this.tx.run(async (tx) => {
      await this.otpRepo.consume(tx, row.id, now);

      let user = await this.userRepo.findActiveByPhone(tx, phone.value);
      const isNewUser = user === null;
      if (!user) {
        user = await this.userRepo.createVerified(tx, {
          phoneE164: phone.value,
          verifiedAt: now,
          loggedInAt: now,
        });
        await this.outbox.write(tx, {
          aggregateType: "User",
          aggregateId: user.id,
          eventType: USER_CREATED_EVENT_TYPE,
          payload: {
            userId: user.id,
            phoneE164: user.phoneE164,
            role: user.role,
            createdAt: user.createdAt.toISOString(),
          } satisfies UserCreatedEventPayload,
        });
      } else {
        await this.userRepo.touchLastLogin(tx, user.id, now);
      }

      const refreshSecret = this.jwt.generateRefresh(now);
      const familyId = randomUUID();
      const issued = await this.refreshRepo.issue(tx, {
        userId: user.id,
        tokenHash: refreshSecret.hash,
        familyId,
        expiresAt: refreshSecret.expiresAt,
        ...(input.ipAddress ? { ipAddress: input.ipAddress } : {}),
        ...(input.userAgent ? { userAgent: input.userAgent } : {}),
      });

      const accessToken = this.jwt.signAccess({ sub: user.id, role: user.role }, now);

      await this.outbox.write(tx, {
        aggregateType: "OtpRequest",
        aggregateId: row.id,
        eventType: OTP_VERIFIED_EVENT_TYPE,
        payload: {
          requestId: row.id,
          phoneE164: phone.value,
          userId: user.id,
          verifiedAt: now.toISOString(),
        } satisfies OtpVerifiedEventPayload,
      });

      await this.outbox.write(tx, {
        aggregateType: "User",
        aggregateId: user.id,
        eventType: USER_LOGGED_IN_EVENT_TYPE,
        payload: buildLoggedInPayload(user, now, input),
      });

      await this.outbox.write(tx, {
        aggregateType: "RefreshToken",
        aggregateId: issued.id,
        eventType: REFRESH_TOKENS_ISSUED_EVENT_TYPE,
        payload: {
          userId: user.id,
          refreshTokenId: issued.id,
          familyId,
          issuedAt: issued.createdAt.toISOString(),
          expiresAt: issued.expiresAt.toISOString(),
          ...(input.ipAddress ? { ipAddress: input.ipAddress } : {}),
          ...(input.userAgent ? { userAgent: input.userAgent } : {}),
        } satisfies RefreshTokensIssuedEventPayload,
      });

      void isNewUser;

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

function buildLoggedInPayload(
  user: UserRecord,
  now: Date,
  input: VerifyOtpInput,
): UserLoggedInEventPayload {
  return {
    userId: user.id,
    phoneE164: user.phoneE164,
    loggedInAt: now.toISOString(),
    ...(input.ipAddress ? { ipAddress: input.ipAddress } : {}),
    ...(input.userAgent ? { userAgent: input.userAgent } : {}),
    ...(input.deviceId ? { deviceId: input.deviceId } : {}),
  };
}
