import {
  Body,
  Controller,
  Get,
  Headers,
  Header,
  HttpCode,
  HttpStatus,
  Ip,
  Post,
  Req,
  UseInterceptors,
} from "@nestjs/common";

import {
  DriverOtpRequestInputSchema,
  type AuthTokens,
  type AuthUserSummary,
  type DriverOtpRequestInput,
} from "@event-fleet/shared-types";

import { CurrentUser, type AuthUser } from "../../../../common/auth/current-user.decorator";
import { Public } from "../../../../common/auth/public.decorator";
import { IdempotencyInterceptor } from "../../../../common/idempotency/idempotency.interceptor";
import { ZodValidationPipe } from "../../../../common/pipes/zod-validation.pipe";
import { AcceptDriverInviteUseCase } from "../../application/use-cases/accept-driver-invite.use-case";
import { CheckDriverWhitelistUseCase } from "../../application/use-cases/check-driver-whitelist.use-case";
import { RefreshTokensUseCase } from "../../application/use-cases/refresh-tokens.use-case";
import { RequestOtpUseCase } from "../../application/use-cases/request-otp.use-case";
import { VerifyOtpUseCase } from "../../application/use-cases/verify-otp.use-case";
import { DriverNotInvitedError } from "../../domain/errors/driver-not-invited.error";
import { RequestOtpDto, type RequestOtpDtoType } from "../dtos/otp-request.dto";
import {
  RefreshTokensDto,
  type RefreshTokensDtoType,
  VerifyOtpDto,
  type VerifyOtpDtoType,
} from "../dtos/otp-verify.dto";

import type { Request } from "express";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly requestOtp: RequestOtpUseCase,
    private readonly verifyOtp: VerifyOtpUseCase,
    private readonly refresh: RefreshTokensUseCase,
    private readonly checkDriverWhitelist: CheckDriverWhitelistUseCase,
    private readonly acceptDriverInvite: AcceptDriverInviteUseCase,
  ) {}

  @Public()
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

  @Public()
  @Post("otp/verify")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "no-store")
  @UseInterceptors(IdempotencyInterceptor)
  async otpVerify(
    @Body(new ZodValidationPipe(VerifyOtpDto)) body: VerifyOtpDtoType,
    @Ip() ip: string,
    @Headers("user-agent") userAgent: string | undefined,
  ): Promise<AuthTokens> {
    const result = await this.verifyOtp.execute({
      phone: body.phone,
      requestId: body.requestId,
      code: body.code,
      ipAddress: ip,
      ...(userAgent ? { userAgent } : {}),
      ...(body.deviceId ? { deviceId: body.deviceId } : {}),
    });
    return toAuthTokens(result);
  }

  @Public()
  @Post("tokens/refresh")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "no-store")
  async tokensRefresh(
    @Body(new ZodValidationPipe(RefreshTokensDto)) body: RefreshTokensDtoType,
    @Ip() ip: string,
    @Headers("user-agent") userAgent: string | undefined,
  ): Promise<AuthTokens> {
    const result = await this.refresh.execute({
      refreshToken: body.refreshToken,
      ipAddress: ip,
      ...(userAgent ? { userAgent } : {}),
    });
    return toAuthTokens(result);
  }

  /**
   * Driver-specific OTP flow. The whitelist gate fires BEFORE we ask
   * the SMS provider — uninvited phones get a clean 403 + don't burn
   * Netgsm credits + don't reveal "is this number on the list" via
   * an SMS receipt. Accepted phones (returning drivers) flow through
   * the same gate (CheckDriverWhitelistUseCase returns true for both
   * PENDING and ACCEPTED), so the OTP path is shared after the gate.
   */
  @Public()
  @Post("driver/otp/request")
  @HttpCode(HttpStatus.ACCEPTED)
  @UseInterceptors(IdempotencyInterceptor)
  async driverOtpRequest(
    @Body(new ZodValidationPipe(DriverOtpRequestInputSchema)) body: DriverOtpRequestInput,
    @Ip() ip: string,
    @Headers("user-agent") userAgent: string | undefined,
  ): Promise<{ requestId: string; expiresAt: string }> {
    const whitelist = await this.checkDriverWhitelist.execute({ phone: body.phone });
    if (!whitelist.isWhitelisted) {
      throw new DriverNotInvitedError("phone is not on the driver whitelist");
    }
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

  /**
   * Driver-specific OTP verify. After the standard verify (which may
   * create a new User row or log in an existing one), we accept the
   * pending DriverInvite — that promotes the User to role=DRIVER and
   * fires the identity.DriverInviteAccepted outbox event. Idempotent
   * for the same user (verifyOtp may retry on duplicate delivery).
   *
   * The accept call uses the customer-shaped VerifyOtpDto for symmetry
   * — the body shape is identical, only the post-step differs.
   */
  @Public()
  @Post("driver/otp/verify")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "no-store")
  @UseInterceptors(IdempotencyInterceptor)
  async driverOtpVerify(
    @Body(new ZodValidationPipe(VerifyOtpDto)) body: VerifyOtpDtoType,
    @Ip() ip: string,
    @Headers("user-agent") userAgent: string | undefined,
  ): Promise<AuthTokens> {
    const result = await this.verifyOtp.execute({
      phone: body.phone,
      requestId: body.requestId,
      code: body.code,
      ipAddress: ip,
      ...(userAgent ? { userAgent } : {}),
      ...(body.deviceId ? { deviceId: body.deviceId } : {}),
    });
    await this.acceptDriverInvite.execute({ phone: body.phone, userId: result.user.id });
    // Re-fetch the user so the response carries role=DRIVER.
    return toAuthTokens({ ...result, user: { ...result.user, role: "DRIVER" } });
  }

  @Get("me")
  @Header("Cache-Control", "no-store")
  me(@CurrentUser() user: AuthUser, @Req() req: Request): AuthUserSummary {
    void req;
    return {
      id: user.id,
      phoneE164: user.phoneE164,
      role: user.role,
      displayName: user.displayName,
    };
  }
}

interface UseCaseResult {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: Date;
  refreshTokenExpiresAt: Date;
  user: {
    id: string;
    phoneE164: string;
    role: AuthUserSummary["role"];
    displayName: string | null;
  };
}

function toAuthTokens(r: UseCaseResult): AuthTokens {
  return {
    accessToken: r.accessToken,
    refreshToken: r.refreshToken,
    accessTokenExpiresAt: r.accessTokenExpiresAt.toISOString(),
    refreshTokenExpiresAt: r.refreshTokenExpiresAt.toISOString(),
    user: {
      id: r.user.id,
      phoneE164: r.user.phoneE164,
      role: r.user.role,
      displayName: r.user.displayName,
    },
  };
}
