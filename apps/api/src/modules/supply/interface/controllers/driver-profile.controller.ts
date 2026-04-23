import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  UseInterceptors,
} from "@nestjs/common";

import {
  CreateDriverProfileInputSchema,
  UpdateDriverProfileInputSchema,
  type CreateDriverProfileInput,
  type DriverProfileResponse,
  type UpdateDriverProfileInput,
} from "@event-fleet/shared-types";

import { CurrentUser, type AuthUser } from "../../../../common/auth/current-user.decorator";
import { IdempotencyInterceptor } from "../../../../common/idempotency/idempotency.interceptor";
import { ZodValidationPipe } from "../../../../common/pipes/zod-validation.pipe";
import { CreateDriverProfileUseCase } from "../../application/use-cases/create-driver-profile.use-case";
import { GetMyDriverProfileUseCase } from "../../application/use-cases/get-my-driver-profile.use-case";
import { SubmitForReviewUseCase } from "../../application/use-cases/submit-for-review.use-case";
import { UpdateDriverProfileUseCase } from "../../application/use-cases/update-driver-profile.use-case";
import { toDriverProfileResponse } from "../mappers/driver-profile.mapper";

@Controller("supply/driver-profiles")
export class DriverProfileController {
  constructor(
    private readonly create: CreateDriverProfileUseCase,
    private readonly update: UpdateDriverProfileUseCase,
    private readonly getMine: GetMyDriverProfileUseCase,
    private readonly submit: SubmitForReviewUseCase,
  ) {}

  @Post()
  @UseInterceptors(IdempotencyInterceptor)
  async createMine(
    @Body(new ZodValidationPipe(CreateDriverProfileInputSchema)) body: CreateDriverProfileInput,
    @CurrentUser() user: AuthUser,
  ): Promise<DriverProfileResponse> {
    const result = await this.create.execute(
      {
        firstName: body.firstName,
        lastName: body.lastName,
        nationalId: body.nationalId,
        birthDate: new Date(`${body.birthDate}T00:00:00Z`),
        iban: body.iban,
      },
      { userId: user.id },
    );
    return toDriverProfileResponse(result);
  }

  @Get("me")
  async readMine(@CurrentUser() user: AuthUser): Promise<DriverProfileResponse> {
    const result = await this.getMine.execute({ userId: user.id });
    return toDriverProfileResponse(result);
  }

  @Patch("me")
  async updateMine(
    @Body(new ZodValidationPipe(UpdateDriverProfileInputSchema)) body: UpdateDriverProfileInput,
    @CurrentUser() user: AuthUser,
  ): Promise<DriverProfileResponse> {
    const result = await this.update.execute(body, { userId: user.id });
    return toDriverProfileResponse(result);
  }

  @Post("me/submit")
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(IdempotencyInterceptor)
  async submitMine(@CurrentUser() user: AuthUser): Promise<{ status: "DOCUMENTS_PENDING" }> {
    return this.submit.execute({ userId: user.id });
  }
}
