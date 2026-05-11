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
  Inject,
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
import { TX_RUNNER_PORT, type TxRunnerPort } from "../../../../common/persistence/tx-runner.port";
import { ZodValidationPipe } from "../../../../common/pipes/zod-validation.pipe";
import {
  DRIVER_PROFILE_REPOSITORY_PORT,
  type DriverProfileRepositoryPort,
} from "../../../supply/application/ports/driver-profile.repository.port";
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
    // A4f-1b — driverProfileId enrichment for driver app responses.
    // Identity use cases stay independent of supply (CLAUDE.md
    // discipline); only the controller layer cross-reads, since
    // controllers are the orchestration seam and `/auth/me` +
    // `/auth/otp/verify` already aggregate cross-module fields.
    @Inject(DRIVER_PROFILE_REPOSITORY_PORT)
    private readonly driverProfileRepo: DriverProfileRepositoryPort,
    @Inject(TX_RUNNER_PORT) private readonly tx: TxRunnerPort,
  ) {}

  /**
   * Looks up the driver profile id only when the user is in DRIVER role.
   * Returns null for everyone else. One DB hit per call — kept here
   * (not a use case) because the lookup is purely a presentation
   * concern.
   */
  private async resolveDriverProfileId(user: {
    id: string;
    role: AuthUserSummary["role"];
  }): Promise<string | null> {
    if (user.role !== "DRIVER") return null;
    const profile = await this.tx.run((tx) =>
      this.driverProfileRepo.findActiveByUserId(tx, user.id),
    );
    return profile ? profile.id : null;
  }

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
    const driverProfileId = await this.resolveDriverProfileId(result.user);
    return toAuthTokens(result, driverProfileId);
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
    const driverProfileId = await this.resolveDriverProfileId(result.user);
    return toAuthTokens(result, driverProfileId);
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
    // Driver profile may not exist yet (supply onboarding lives downstream).
    // Look up here so the response carries the id when it does — driver
    // mobile uses null to show "complete onboarding" UI.
    const driverProfileId = await this.resolveDriverProfileId({
      id: result.user.id,
      role: "DRIVER",
    });
    return toAuthTokens({ ...result, user: { ...result.user, role: "DRIVER" } }, driverProfileId);
  }

  @Get("me")
  @Header("Cache-Control", "no-store")
  async me(@CurrentUser() user: AuthUser, @Req() req: Request): Promise<AuthUserSummary> {
    void req;
    const driverProfileId = await this.resolveDriverProfileId({
      id: user.id,
      role: user.role,
    });
    return {
      id: user.id,
      phoneE164: user.phoneE164,
      role: user.role,
      displayName: user.displayName,
      driverProfileId,
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

function toAuthTokens(r: UseCaseResult, driverProfileId: string | null): AuthTokens {
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
      driverProfileId,
    },
  };
}
