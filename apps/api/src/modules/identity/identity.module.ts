import { Module, type Type } from "@nestjs/common";

import { CLOCK_PORT } from "./application/ports/clock.port";
import { JWT_TOKEN_SERVICE_PORT } from "./application/ports/jwt-token.service.port";
import { OTP_REQUEST_REPOSITORY_PORT } from "./application/ports/otp-request.repository.port";
import { OUTBOX_WRITER_PORT } from "./application/ports/outbox-writer.port";
import { REFRESH_TOKEN_REPOSITORY_PORT } from "./application/ports/refresh-token.repository.port";
import { SMS_SENDER_PORT, type SmsSenderPort } from "./application/ports/sms-sender.port";
import { TX_RUNNER_PORT } from "./application/ports/tx-runner.port";
import { USER_REPOSITORY_PORT } from "./application/ports/user.repository.port";
import { RefreshTokensUseCase } from "./application/use-cases/refresh-tokens.use-case";
import { RequestOtpUseCase } from "./application/use-cases/request-otp.use-case";
import { VerifyOtpUseCase } from "./application/use-cases/verify-otp.use-case";
import { SystemClock } from "./infrastructure/clock/system-clock";
import { JwtTokenService } from "./infrastructure/jwt/jwt-token.service";
import { PrismaOtpRequestRepository } from "./infrastructure/persistence/prisma-otp-request.repository";
import { PrismaOutboxWriter } from "./infrastructure/persistence/prisma-outbox-writer";
import { PrismaRefreshTokenRepository } from "./infrastructure/persistence/prisma-refresh-token.repository";
import { PrismaTxRunner } from "./infrastructure/persistence/prisma-tx-runner";
import { PrismaUserRepository } from "./infrastructure/persistence/prisma-user.repository";
import { MockSmsSender } from "./infrastructure/sms/mock-sms-sender";
import { NetgsmSmsSender } from "./infrastructure/sms/netgsm-sms-sender";
import { AuthController } from "./interface/controllers/auth.controller";

// Pick SMS implementation up-front from process.env (Nest needs a stable
// useClass at module-instantiation time). ConfigModule has already validated
// SMS_DRIVER through validateEnv at this point.
const SmsSenderClass: Type<SmsSenderPort> =
  process.env.SMS_DRIVER === "netgsm" ? NetgsmSmsSender : MockSmsSender;

@Module({
  controllers: [AuthController],
  providers: [
    RequestOtpUseCase,
    VerifyOtpUseCase,
    RefreshTokensUseCase,
    { provide: OTP_REQUEST_REPOSITORY_PORT, useClass: PrismaOtpRequestRepository },
    { provide: USER_REPOSITORY_PORT, useClass: PrismaUserRepository },
    { provide: REFRESH_TOKEN_REPOSITORY_PORT, useClass: PrismaRefreshTokenRepository },
    { provide: OUTBOX_WRITER_PORT, useClass: PrismaOutboxWriter },
    { provide: TX_RUNNER_PORT, useClass: PrismaTxRunner },
    { provide: JWT_TOKEN_SERVICE_PORT, useClass: JwtTokenService },
    { provide: CLOCK_PORT, useClass: SystemClock },
    { provide: SMS_SENDER_PORT, useClass: SmsSenderClass },
  ],
  exports: [JWT_TOKEN_SERVICE_PORT],
})
export class IdentityModule {}
