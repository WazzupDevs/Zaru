import { Body, Controller, Get, Param, Post, Query, UseInterceptors } from "@nestjs/common";

import {
  ListActiveAddonRulesQuerySchema,
  RequestPriceQuoteInputSchema,
  type ListActiveAddonRulesQuery,
  type PriceQuoteResponse,
  type PricingRuleResponse,
  type RequestPriceQuoteInput,
} from "@event-fleet/shared-types";

import { CurrentUser, type AuthUser } from "../../../../common/auth/current-user.decorator";
import { IdempotencyInterceptor } from "../../../../common/idempotency/idempotency.interceptor";
import { ZodValidationPipe } from "../../../../common/pipes/zod-validation.pipe";
import { GetQuoteUseCase } from "../../application/use-cases/get-quote.use-case";
import { ListActiveRulesUseCase } from "../../application/use-cases/list-active-rules.use-case";
import { RequestPriceQuoteUseCase } from "../../application/use-cases/request-price-quote.use-case";
import { toQuoteResponse, toRuleResponse } from "../mappers/pricing.mapper";

@Controller("pricing")
export class PricingController {
  constructor(
    private readonly request: RequestPriceQuoteUseCase,
    private readonly get: GetQuoteUseCase,
    private readonly listRules: ListActiveRulesUseCase,
  ) {}

  @Post("quotes")
  @UseInterceptors(IdempotencyInterceptor)
  async requestQuote(
    @Body(new ZodValidationPipe(RequestPriceQuoteInputSchema)) body: RequestPriceQuoteInput,
    @CurrentUser() user: AuthUser,
  ): Promise<PriceQuoteResponse> {
    const quote = await this.request.execute(
      {
        vehicleTypeId: body.vehicleTypeId,
        categoryId: body.categoryId,
        pickupLat: body.pickupLat,
        pickupLng: body.pickupLng,
        pickupAddress: body.pickupAddress,
        dropoffLat: body.dropoffLat,
        dropoffLng: body.dropoffLng,
        dropoffAddress: body.dropoffAddress,
        eventStartAt: new Date(body.eventStartAt),
        eventEndAt: new Date(body.eventEndAt),
        selectedAddonIds: body.selectedAddonIds,
      },
      { userId: user.id },
    );
    return toQuoteResponse(quote);
  }

  @Get("quotes/:id")
  async getQuote(
    @Param("id") id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<PriceQuoteResponse> {
    const quote = await this.get.execute(id, { userId: user.id });
    return toQuoteResponse(quote);
  }

  @Get("rules")
  async rules(
    @Query(new ZodValidationPipe(ListActiveAddonRulesQuerySchema)) query: ListActiveAddonRulesQuery,
  ): Promise<PricingRuleResponse[]> {
    const records = await this.listRules.execute({
      categoryId: query.categoryId,
      vehicleTypeId: query.vehicleTypeId,
      ...(query.eventStartAt ? { eventStartAt: new Date(query.eventStartAt) } : {}),
    });
    return records.map(toRuleResponse);
  }
}
