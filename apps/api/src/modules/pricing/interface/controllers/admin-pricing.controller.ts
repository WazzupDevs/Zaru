import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseInterceptors,
  Inject,
} from "@nestjs/common";

import {
  CreatePricingRuleInputSchema,
  PricingRuleTypeSchema,
  UpsertPricingProfileInputSchema,
  type CreatePricingRuleInput,
  type PricingProfileResponse,
  type PricingRuleResponse,
  type UpsertPricingProfileInput,
} from "@event-fleet/shared-types";

import { CurrentUser, type AuthUser } from "../../../../common/auth/current-user.decorator";
import { Roles } from "../../../../common/auth/roles.decorator";
import { IdempotencyInterceptor } from "../../../../common/idempotency/idempotency.interceptor";
import { TX_RUNNER_PORT, type TxRunnerPort } from "../../../../common/persistence/tx-runner.port";
import { ZodValidationPipe } from "../../../../common/pipes/zod-validation.pipe";
import {
  PRICING_PROFILE_REPOSITORY_PORT,
  type PricingProfileRepositoryPort,
} from "../../application/ports/pricing-profile.repository.port";
import {
  PRICING_RULE_REPOSITORY_PORT,
  type PricingRuleRepositoryPort,
} from "../../application/ports/pricing-rule.repository.port";
import { CreatePricingRuleUseCase } from "../../application/use-cases/create-pricing-rule.use-case";
import { DeactivatePricingRuleUseCase } from "../../application/use-cases/deactivate-pricing-rule.use-case";
import { UpsertPricingProfileUseCase } from "../../application/use-cases/upsert-pricing-profile.use-case";
import { toProfileResponse, toRuleResponse } from "../mappers/pricing.mapper";

@Controller("admin/pricing")
@Roles("ADMIN")
export class AdminPricingController {
  constructor(
    private readonly upsertProfile: UpsertPricingProfileUseCase,
    private readonly createRule: CreatePricingRuleUseCase,
    private readonly deactivateRule: DeactivatePricingRuleUseCase,
    @Inject(PRICING_PROFILE_REPOSITORY_PORT)
    private readonly profileRepo: PricingProfileRepositoryPort,
    @Inject(PRICING_RULE_REPOSITORY_PORT)
    private readonly ruleRepo: PricingRuleRepositoryPort,
    @Inject(TX_RUNNER_PORT) private readonly tx: TxRunnerPort,
  ) {}

  @Put("profiles/:vehicleTypeId")
  @UseInterceptors(IdempotencyInterceptor)
  async upsertProfileEndpoint(
    @Param("vehicleTypeId") vehicleTypeId: string,
    @Body(new ZodValidationPipe(UpsertPricingProfileInputSchema))
    body: UpsertPricingProfileInput,
    @CurrentUser() admin: AuthUser,
  ): Promise<PricingProfileResponse> {
    // The path param is canonical; ignore any body mismatch.
    const result = await this.upsertProfile.execute(
      { ...body, vehicleTypeId },
      { userId: admin.id },
    );
    return toProfileResponse(result);
  }

  @Get("profiles")
  async listProfiles(): Promise<PricingProfileResponse[]> {
    const records = await this.tx.run((tx) => this.profileRepo.list(tx));
    return records.map(toProfileResponse);
  }

  @Post("rules")
  @UseInterceptors(IdempotencyInterceptor)
  async createRuleEndpoint(
    @Body(new ZodValidationPipe(CreatePricingRuleInputSchema)) body: CreatePricingRuleInput,
    @CurrentUser() admin: AuthUser,
  ): Promise<PricingRuleResponse> {
    const rule = await this.createRule.execute(
      {
        type: body.type,
        ...(body.categoryId !== undefined ? { categoryId: body.categoryId } : {}),
        ...(body.vehicleTypeId !== undefined ? { vehicleTypeId: body.vehicleTypeId } : {}),
        name: body.name,
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.validFrom !== undefined ? { validFrom: new Date(body.validFrom) } : {}),
        ...(body.validTo !== undefined ? { validTo: new Date(body.validTo) } : {}),
        ...(body.daysOfWeek !== undefined ? { daysOfWeek: body.daysOfWeek } : {}),
        ...(body.multiplier !== undefined ? { multiplier: body.multiplier } : {}),
        ...(body.fixedAmount !== undefined ? { fixedAmount: body.fixedAmount } : {}),
        ...(body.isOptional !== undefined ? { isOptional: body.isOptional } : {}),
        ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}),
      },
      { userId: admin.id },
    );
    return toRuleResponse(rule);
  }

  @Patch("rules/:id/deactivate")
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(IdempotencyInterceptor)
  async deactivateRuleEndpoint(
    @Param("id") id: string,
    @CurrentUser() admin: AuthUser,
  ): Promise<PricingRuleResponse> {
    const rule = await this.deactivateRule.execute(id, { userId: admin.id });
    return toRuleResponse(rule);
  }

  @Get("rules")
  async listRules(
    @Query("type") type?: string,
    @Query("isActive") isActive?: string,
  ): Promise<PricingRuleResponse[]> {
    const filter: { type?: ReturnType<typeof PricingRuleTypeSchema.parse>; isActive?: boolean } =
      {};
    if (type !== undefined) {
      const parsed = PricingRuleTypeSchema.safeParse(type);
      if (parsed.success) filter.type = parsed.data;
    }
    if (isActive !== undefined) filter.isActive = isActive === "true";
    const records = await this.tx.run((tx) => this.ruleRepo.list(tx, filter));
    return records.map(toRuleResponse);
  }
}
