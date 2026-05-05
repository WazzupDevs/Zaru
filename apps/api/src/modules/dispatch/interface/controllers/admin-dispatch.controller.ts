import { Body, Controller, Param, ParseUUIDPipe, Post, UseInterceptors } from "@nestjs/common";

import {
  ReassignDriverInputSchema,
  UpdateDriverLocationInputSchema,
  SetDriverOnlineStatusInputSchema,
  type ReassignDriverInput,
  type UpdateDriverLocationInput,
  type SetDriverOnlineStatusInput,
} from "@event-fleet/shared-types";

import { CurrentUser, type AuthUser } from "../../../../common/auth/current-user.decorator";
import { Roles } from "../../../../common/auth/roles.decorator";
import { IdempotencyInterceptor } from "../../../../common/idempotency/idempotency.interceptor";
import { ZodValidationPipe } from "../../../../common/pipes/zod-validation.pipe";
import { ManualReassignDriverUseCase } from "../../application/use-cases/manual-reassign-driver.use-case";
import { SetDriverOnlineStatusUseCase } from "../../application/use-cases/set-driver-online-status.use-case";
import { UpdateDriverLocationUseCase } from "../../application/use-cases/update-driver-location.use-case";

/**
 * Admin-facing dispatch surface. The two driver-fixture endpoints
 * (location + online toggle) bypass the owner check and exist mainly
 * for the smoke script + manual support intervention. Both still
 * require @Roles("ADMIN").
 */
@Controller("admin/dispatch")
@Roles("ADMIN")
export class AdminDispatchController {
  constructor(
    private readonly reassign: ManualReassignDriverUseCase,
    private readonly setOnline: SetDriverOnlineStatusUseCase,
    private readonly updateLocation: UpdateDriverLocationUseCase,
  ) {}

  @Post("bookings/:id/reassign")
  @UseInterceptors(IdempotencyInterceptor)
  async reassignBooking(
    @Param("id", new ParseUUIDPipe()) bookingId: string,
    @Body(new ZodValidationPipe(ReassignDriverInputSchema)) body: ReassignDriverInput,
    @CurrentUser() user: AuthUser,
  ): Promise<{ bookingId: string; newDriverId: string | null }> {
    const updated = await this.reassign.execute(
      { bookingId, reason: body.reason },
      { userId: user.id, role: "ADMIN" },
    );
    return { bookingId: updated.id, newDriverId: updated.driverId };
  }

  /**
   * Smoke + support helper: set a driver's online flag on their behalf.
   * Driver-app path uses /dispatch/drivers/:id/online-status with the
   * owner check; this admin path bypasses it.
   */
  @Post("drivers/:id/online-status")
  @UseInterceptors(IdempotencyInterceptor)
  async adminSetOnline(
    @Param("id", new ParseUUIDPipe()) driverProfileId: string,
    @Body(new ZodValidationPipe(SetDriverOnlineStatusInputSchema))
    body: SetDriverOnlineStatusInput,
    @CurrentUser() user: AuthUser,
  ): Promise<{ ok: true }> {
    await this.setOnline.execute(
      { driverProfileId, isOnline: body.isOnline },
      { userId: user.id, allowAdmin: true },
    );
    return { ok: true };
  }

  /**
   * Smoke helper: set a driver's location on their behalf. Note this
   * requires the driver to be the same user as the admin (owner check
   * is enforced by UpdateDriverLocationUseCase). For pure smoke usage
   * the admin user IS the driver fixture.
   */
  @Post("drivers/:id/location")
  @UseInterceptors(IdempotencyInterceptor)
  async adminSetLocation(
    @Param("id", new ParseUUIDPipe()) driverProfileId: string,
    @Body(new ZodValidationPipe(UpdateDriverLocationInputSchema))
    body: UpdateDriverLocationInput,
    @CurrentUser() user: AuthUser,
  ): Promise<{ ok: true }> {
    await this.updateLocation.execute(
      { driverProfileId, lat: body.lat, lng: body.lng },
      { userId: user.id, allowAdmin: true },
    );
    return { ok: true };
  }
}
