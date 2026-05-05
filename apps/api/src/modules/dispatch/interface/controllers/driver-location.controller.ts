import { Body, Controller, Param, ParseUUIDPipe, Patch, UseInterceptors } from "@nestjs/common";

import {
  SetDriverOnlineStatusInputSchema,
  UpdateDriverLocationInputSchema,
  type SetDriverOnlineStatusInput,
  type UpdateDriverLocationInput,
} from "@event-fleet/shared-types";

import { CurrentUser, type AuthUser } from "../../../../common/auth/current-user.decorator";
import { IdempotencyInterceptor } from "../../../../common/idempotency/idempotency.interceptor";
import { ZodValidationPipe } from "../../../../common/pipes/zod-validation.pipe";
import { SetDriverOnlineStatusUseCase } from "../../application/use-cases/set-driver-online-status.use-case";
import { UpdateDriverLocationUseCase } from "../../application/use-cases/update-driver-location.use-case";

/**
 * Driver-facing surface — the driver app posts location/online updates here.
 * Auth is required (JwtAuthGuard global) and the use case enforces that
 * `actor.userId === driverProfile.userId`.
 */
@Controller("dispatch/drivers")
export class DriverLocationController {
  constructor(
    private readonly updateLocation: UpdateDriverLocationUseCase,
    private readonly setOnline: SetDriverOnlineStatusUseCase,
  ) {}

  @Patch(":id/location")
  async patchLocation(
    @Param("id", new ParseUUIDPipe()) driverProfileId: string,
    @Body(new ZodValidationPipe(UpdateDriverLocationInputSchema))
    body: UpdateDriverLocationInput,
    @CurrentUser() user: AuthUser,
  ): Promise<{ ok: true }> {
    await this.updateLocation.execute(
      { driverProfileId, lat: body.lat, lng: body.lng },
      { userId: user.id },
    );
    return { ok: true };
  }

  @Patch(":id/online-status")
  @UseInterceptors(IdempotencyInterceptor)
  async patchOnline(
    @Param("id", new ParseUUIDPipe()) driverProfileId: string,
    @Body(new ZodValidationPipe(SetDriverOnlineStatusInputSchema))
    body: SetDriverOnlineStatusInput,
    @CurrentUser() user: AuthUser,
  ): Promise<{ ok: true }> {
    await this.setOnline.execute({ driverProfileId, isOnline: body.isOnline }, { userId: user.id });
    return { ok: true };
  }
}
