import { forwardRef, Module, type Type } from "@nestjs/common";

import { NotificationsModule } from "../notifications/notifications.module";
import { DRIVER_INVITE_REPOSITORY_PORT } from "./application/ports/driver-invite.repository.port";
import { JWT_TOKEN_SERVICE_PORT } from "./application/ports/jwt-token.service.port";
import { OTP_REQUEST_REPOSITORY_PORT } from "./application/ports/otp-request.repository.port";
import { REFRESH_TOKEN_REPOSITORY_PORT } from "./application/ports/refresh-token.repository.port";
import {
  TEST_OTP_CACHE_PORT,
  type TestOtpCachePort,
} from "./application/ports/test-otp-cache.port";
import { USER_REPOSITORY_PORT } from "./application/ports/user.repository.port";
import { AcceptDriverInviteUseCase } from "./application/use-cases/accept-driver-invite.use-case";
import { CheckDriverWhitelistUseCase } from "./application/use-cases/check-driver-whitelist.use-case";
import { CreateDriverInviteUseCase } from "./application/use-cases/create-driver-invite.use-case";
import { RefreshTokensUseCase } from "./application/use-cases/refresh-tokens.use-case";
import { RequestOtpUseCase } from "./application/use-cases/request-otp.use-case";
import { RevokeDriverInviteUseCase } from "./application/use-cases/revoke-driver-invite.use-case";
import { UpdatePushTokenUseCase } from "./application/use-cases/update-push-token.use-case";
import { VerifyOtpUseCase } from "./application/use-cases/verify-otp.use-case";
import { InMemoryTestOtpCache, NoopTestOtpCache } from "./infrastructure/in-memory-test-otp-cache";
import { JwtTokenService } from "./infrastructure/jwt/jwt-token.service";
import { PrismaDriverInviteRepository } from "./infrastructure/persistence/prisma-driver-invite.repository";
import { PrismaOtpRequestRepository } from "./infrastructure/persistence/prisma-otp-request.repository";
import { PrismaRefreshTokenRepository } from "./infrastructure/persistence/prisma-refresh-token.repository";
import { PrismaUserRepository } from "./infrastructure/persistence/prisma-user.repository";
import { AdminDriverInvitesController } from "./interface/controllers/admin-driver-invites.controller";
import { AuthController } from "./interface/controllers/auth.controller";
import { TestOnlyController } from "./interface/controllers/test-only.controller";
import { UsersController } from "./interface/controllers/users.controller";

// Test-only OTP cache: real impl in dev/test, no-op in production. The
// controller is also gated below — defense in depth.
const TestOtpCacheClass: Type<TestOtpCachePort> =
  process.env.NODE_ENV === "production" ? NoopTestOtpCache : InMemoryTestOtpCache;

const isProduction = process.env.NODE_ENV === "production";

@Module({
  imports: [forwardRef(() => NotificationsModule)],
  controllers: [
    AuthController,
    UsersController,
    AdminDriverInvitesController,
    ...(isProduction ? [] : [TestOnlyController]),
  ],
  providers: [
    RequestOtpUseCase,
    VerifyOtpUseCase,
    RefreshTokensUseCase,
    UpdatePushTokenUseCase,
    CreateDriverInviteUseCase,
    CheckDriverWhitelistUseCase,
    AcceptDriverInviteUseCase,
    RevokeDriverInviteUseCase,
    { provide: OTP_REQUEST_REPOSITORY_PORT, useClass: PrismaOtpRequestRepository },
    { provide: USER_REPOSITORY_PORT, useClass: PrismaUserRepository },
    { provide: REFRESH_TOKEN_REPOSITORY_PORT, useClass: PrismaRefreshTokenRepository },
    { provide: DRIVER_INVITE_REPOSITORY_PORT, useClass: PrismaDriverInviteRepository },
    { provide: JWT_TOKEN_SERVICE_PORT, useClass: JwtTokenService },
    { provide: TEST_OTP_CACHE_PORT, useClass: TestOtpCacheClass },
  ],
  exports: [JWT_TOKEN_SERVICE_PORT, USER_REPOSITORY_PORT],
})
export class IdentityModule {}
