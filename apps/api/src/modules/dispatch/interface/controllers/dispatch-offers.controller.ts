import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseInterceptors,
} from "@nestjs/common";

import {
  ListDriverOfferHistoryQuerySchema,
  RejectOfferInputSchema,
  type ListDriverOfferHistoryQuery,
  type RejectOfferInput,
} from "@event-fleet/shared-types";

import { CurrentUser, type AuthUser } from "../../../../common/auth/current-user.decorator";
import { Roles } from "../../../../common/auth/roles.decorator";
import { IdempotencyInterceptor } from "../../../../common/idempotency/idempotency.interceptor";
import { ZodValidationPipe } from "../../../../common/pipes/zod-validation.pipe";
import { AcceptDriverOfferUseCase } from "../../application/use-cases/accept-driver-offer.use-case";
import { GetDriverOfferUseCase } from "../../application/use-cases/get-driver-offer.use-case";
import { ListDriverOfferHistoryUseCase } from "../../application/use-cases/list-driver-offer-history.use-case";
import { RejectDriverOfferUseCase } from "../../application/use-cases/reject-driver-offer.use-case";

import type {
  DriverOfferDetailView,
  DriverOfferSummaryView,
} from "../../application/use-cases/driver-offer-view-types";

/**
 * Driver-facing surface for the offer lifecycle. The four endpoints
 * cover the post-push flow:
 *   GET  /dispatch/offers/:offerId         → pre-accept detail screen
 *   POST /dispatch/offers/:offerId/accept  → driver taps Kabul Et
 *   POST /dispatch/offers/:offerId/reject  → driver taps Reddet
 *   GET  /dispatch/offers                  → history / my offers
 *
 * Auth is required (global JwtAuthGuard). The @Roles("DRIVER") guard
 * blocks admin-impersonation paths from this endpoint; admin should
 * use the existing admin/dispatch controller for any override flow.
 *
 * The use cases enforce per-offer ownership (offerId belongs to the
 * caller's driverProfile). Concurrency + expiry guards live inside
 * the use cases so the controller stays a thin shape mapper.
 */
@Controller("dispatch/offers")
@Roles("DRIVER")
export class DispatchOffersController {
  constructor(
    private readonly getOffer: GetDriverOfferUseCase,
    private readonly acceptOffer: AcceptDriverOfferUseCase,
    private readonly rejectOffer: RejectDriverOfferUseCase,
    private readonly listHistory: ListDriverOfferHistoryUseCase,
  ) {}

  @Get(":offerId")
  async getById(
    @Param("offerId", new ParseUUIDPipe()) offerId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<DriverOfferDetailView> {
    return this.getOffer.execute({ offerId, driverUserId: user.id });
  }

  @Get()
  async list(
    @Query(new ZodValidationPipe(ListDriverOfferHistoryQuerySchema))
    query: ListDriverOfferHistoryQuery,
    @CurrentUser() user: AuthUser,
  ): Promise<DriverOfferSummaryView[]> {
    return this.listHistory.execute({
      driverUserId: user.id,
      ...(query.status ? { status: query.status } : {}),
      ...(query.limit !== undefined ? { limit: query.limit } : {}),
    });
  }

  @Post(":offerId/accept")
  @HttpCode(200)
  @UseInterceptors(IdempotencyInterceptor)
  async accept(
    @Param("offerId", new ParseUUIDPipe()) offerId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<{ ok: true; offerId: string; status: string }> {
    const updated = await this.acceptOffer.execute({ offerId, driverUserId: user.id });
    return { ok: true, offerId: updated.id, status: updated.status };
  }

  @Post(":offerId/reject")
  @HttpCode(200)
  @UseInterceptors(IdempotencyInterceptor)
  async reject(
    @Param("offerId", new ParseUUIDPipe()) offerId: string,
    @Body(new ZodValidationPipe(RejectOfferInputSchema)) body: RejectOfferInput,
    @CurrentUser() user: AuthUser,
  ): Promise<{ ok: true; offerId: string; status: string }> {
    const updated = await this.rejectOffer.execute({
      offerId,
      driverUserId: user.id,
      reason: body.reason,
      ...(body.note !== undefined ? { note: body.note } : {}),
    });
    return { ok: true, offerId: updated.id, status: updated.status };
  }
}
