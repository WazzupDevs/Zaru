import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Ip,
  Post,
  UseInterceptors,
} from "@nestjs/common";

import { IdempotencyInterceptor } from "../../../../common/idempotency/idempotency.interceptor";
import { ZodValidationPipe } from "../../../../common/pipes/zod-validation.pipe";
import { RequestOtpUseCase } from "../../application/use-cases/request-otp.use-case";
import { RequestOtpDto, type RequestOtpDtoType } from "../dtos/otp-request.dto";

@Controller("auth")
export class AuthController {
  constructor(private readonly requestOtp: RequestOtpUseCase) {}

  @Post("otp/request")
  @HttpCode(HttpStatus.ACCEPTED)
  @UseInterceptors(IdempotencyInterceptor)
  async otpRequest(
    @Body(new ZodValidationPipe(RequestOtpDto)) body: RequestOtpDtoType,
    @Ip() ip: string,
    @Headers("user-agent") userAgent: string | undefined,
  ): Promise<{ requestId: string; expiresAt: string }> {
    const result = await this.requestOtp.execute({
      phone: body.phone,
      ipAddress: ip,
      ...(userAgent ? { userAgent } : {}),
    });
    return {
      requestId: result.requestId,
      expiresAt: result.expiresAt.toISOString(),
    };
  }
}
