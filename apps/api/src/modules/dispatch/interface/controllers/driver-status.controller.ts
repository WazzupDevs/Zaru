import {
  Body,
  Controller,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  UseInterceptors,
} from "@nestjs/common";

import {
  UpdateOfferStatusInputSchema,
  type UpdateOfferStatusInput,
} from "@event-fleet/shared-types";

import { CurrentUser, type AuthUser } from "../../../../common/auth/current-user.decorator";
import { Roles } from "../../../../common/auth/roles.decorator";
import { IdempotencyInterceptor } from "../../../../common/idempotency/idempotency.interceptor";
import { ZodValidationPipe } from "../../../../common/pipes/zod-validation.pipe";
import { UpdateDriverOfferStatusUseCase } from "../../application/use-cases/update-driver-offer-status.use-case";

/**
 * Driver-driven lifecycle transitions: ON_THE_WAY / ARRIVED /
 * IN_PROGRESS / COMPLETED. The state machine guard (post-accept
 * only, no backwards transitions, no skip steps) lives in
 * UpdateDriverOfferStatusUseCase. PATCH chosen over POST because
 * this is an in-place status update, not a new resource.
 */
@Controller("dispatch/offers")
@Roles("DRIVER")
export class DriverStatusController {
  constructor(private readonly updateStatus: UpdateDriverOfferStatusUseCase) {}

  @Patch(":offerId/status")
  @HttpCode(200)
  @UseInterceptors(IdempotencyInterceptor)
  async patchStatus(
    @Param("offerId", new ParseUUIDPipe()) offerId: string,
    @Body(new ZodValidationPipe(UpdateOfferStatusInputSchema)) body: UpdateOfferStatusInput,
    @CurrentUser() user: AuthUser,
  ): Promise<{ ok: true; offerId: string; status: string }> {
    const updated = await this.updateStatus.execute({
      offerId,
      driverUserId: user.id,
      targetStatus: body.status,
    });
    return { ok: true, offerId: updated.id, status: updated.status };
  }
}
