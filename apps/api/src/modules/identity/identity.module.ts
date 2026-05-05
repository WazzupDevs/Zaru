import { Module, type Type } from "@nestjs/common";

import { JWT_TOKEN_SERVICE_PORT } from "./application/ports/jwt-token.service.port";
import { OTP_REQUEST_REPOSITORY_PORT } from "./application/ports/otp-request.repository.port";
import { REFRESH_TOKEN_REPOSITORY_PORT } from "./application/ports/refresh-token.repository.port";
import { SMS_SENDER_PORT, type SmsSenderPort } from "./application/ports/sms-sender.port";
import {
  TEST_OTP_CACHE_PORT,
  type TestOtpCachePort,
} from "./application/ports/test-otp-cache.port";
import { USER_REPOSITORY_PORT } from "./application/ports/user.repository.port";
import { RefreshTokensUseCase } from "./application/use-cases/refresh-tokens.use-case";
import { RequestOtpUseCase } from "./application/use-cases/request-otp.use-case";
import { VerifyOtpUseCase } from "./application/use-cases/verify-otp.use-case";
import { InMemoryTestOtpCache, NoopTestOtpCache } from "./infrastructure/in-memory-test-otp-cache";
import { JwtTokenService } from "./infrastructure/jwt/jwt-token.service";
import { PrismaOtpRequestRepository } from "./infrastructure/persistence/prisma-otp-request.repository";
import { PrismaRefreshTokenRepository } from "./infrastructure/persistence/prisma-refresh-token.repository";
import { PrismaUserRepository } from "./infrastructure/persistence/prisma-user.repository";
import { MockSmsSender } from "./infrastructure/sms/mock-sms-sender";
import { NetgsmSmsSender } from "./infrastructure/sms/netgsm-sms-sender";
import { AuthController } from "./interface/controllers/auth.controller";
import { TestOnlyController } from "./interface/controllers/test-only.controller";

// Pick SMS implementation up-front from process.env (Nest needs a stable
// useClass at module-instantiation time). ConfigModule has already validated
// SMS_DRIVER through validateEnv at this point.
const SmsSenderClass: Type<SmsSenderPort> =
  process.env.SMS_DRIVER === "netgsm" ? NetgsmSmsSender : MockSmsSender;

// Test-only OTP cache: real impl in dev/test, no-op in production. The
// controller is also gated below — defense in depth.
const TestOtpCacheClass: Type<TestOtpCachePort> =
  process.env.NODE_ENV === "production" ? NoopTestOtpCache : InMemoryTestOtpCache;

const isProduction = process.env.NODE_ENV === "production";

@Module({
  controllers: [AuthController, ...(isProduction ? [] : [TestOnlyController])],
  providers: [
    RequestOtpUseCase,
    VerifyOtpUseCase,
    RefreshTokensUseCase,
    { provide: OTP_REQUEST_REPOSITORY_PORT, useClass: PrismaOtpRequestRepository },
    { provide: USER_REPOSITORY_PORT, useClass: PrismaUserRepository },
    { provide: REFRESH_TOKEN_REPOSITORY_PORT, useClass: PrismaRefreshTokenRepository },
    { provide: JWT_TOKEN_SERVICE_PORT, useClass: JwtTokenService },
    { provide: SMS_SENDER_PORT, useClass: SmsSenderClass },
    { provide: TEST_OTP_CACHE_PORT, useClass: TestOtpCacheClass },
  ],
  // Notifications module imports IdentityModule to call
  // UserRepositoryPort.findActiveById from its outbox listener — keeps
  // outbox event payloads PII-free (no phone in the payload).
  exports: [JWT_TOKEN_SERVICE_PORT, USER_REPOSITORY_PORT],
})
export class IdentityModule {}
