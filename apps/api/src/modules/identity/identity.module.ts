import { Module, type Type } from "@nestjs/common";

import { CLOCK_PORT } from "./application/ports/clock.port";
import { OTP_REQUEST_REPOSITORY_PORT } from "./application/ports/otp-request.repository.port";
import { SMS_SENDER_PORT, type SmsSenderPort } from "./application/ports/sms-sender.port";
import { RequestOtpUseCase } from "./application/use-cases/request-otp.use-case";
import { SystemClock } from "./infrastructure/clock/system-clock";
import { PrismaOtpRequestRepository } from "./infrastructure/persistence/prisma-otp-request.repository";
import { MockSmsSender } from "./infrastructure/sms/mock-sms-sender";
import { NetgsmSmsSender } from "./infrastructure/sms/netgsm-sms-sender";
import { AuthController } from "./interface/controllers/auth.controller";

const SmsSenderClass: Type<SmsSenderPort> =
  process.env.NODE_ENV === "production" ? NetgsmSmsSender : MockSmsSender;

@Module({
  controllers: [AuthController],
  providers: [
    RequestOtpUseCase,
    { provide: OTP_REQUEST_REPOSITORY_PORT, useClass: PrismaOtpRequestRepository },
    { provide: CLOCK_PORT, useClass: SystemClock },
    { provide: SMS_SENDER_PORT, useClass: SmsSenderClass },
  ],
})
export class IdentityModule {}
