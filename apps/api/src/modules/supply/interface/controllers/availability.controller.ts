import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseInterceptors,
} from "@nestjs/common";

import {
  BlockAvailabilityInputSchema,
  CheckVehicleFreeQuerySchema,
  type AvailabilityResponse,
  type BlockAvailabilityInput,
  type CheckVehicleFreeQuery,
  type CheckVehicleFreeResponse,
} from "@event-fleet/shared-types";

import { CurrentUser, type AuthUser } from "../../../../common/auth/current-user.decorator";
import { Public } from "../../../../common/auth/public.decorator";
import { IdempotencyInterceptor } from "../../../../common/idempotency/idempotency.interceptor";
import { ZodValidationPipe } from "../../../../common/pipes/zod-validation.pipe";
import { BlockAvailabilityUseCase } from "../../application/use-cases/block-availability.use-case";
import { CheckVehicleFreeUseCase } from "../../application/use-cases/check-vehicle-free.use-case";
import { ListAvailabilityUseCase } from "../../application/use-cases/list-availability.use-case";
import { UnblockAvailabilityUseCase } from "../../application/use-cases/unblock-availability.use-case";
import { toAvailabilityResponse } from "../mappers/availability.mapper";

@Controller("supply")
export class AvailabilityController {
  constructor(
    private readonly block: BlockAvailabilityUseCase,
    private readonly unblock: UnblockAvailabilityUseCase,
    private readonly list: ListAvailabilityUseCase,
    private readonly check: CheckVehicleFreeUseCase,
  ) {}

  @Post("driver-profiles/me/vehicles/:vehicleId/availability")
  @UseInterceptors(IdempotencyInterceptor)
  async createBlock(
    @Param("vehicleId") vehicleId: string,
    @Body(new ZodValidationPipe(BlockAvailabilityInputSchema)) body: BlockAvailabilityInput,
    @CurrentUser() user: AuthUser,
  ): Promise<AvailabilityResponse> {
    const record = await this.block.execute(
      {
        vehicleId,
        startAt: new Date(body.startAt),
        endAt: new Date(body.endAt),
        reason: body.reason,
      },
      { userId: user.id },
    );
    return toAvailabilityResponse(record);
  }

  @Get("driver-profiles/me/vehicles/:vehicleId/availability")
  async listMine(
    @Param("vehicleId") vehicleId: string,
    @CurrentUser() user: AuthUser,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ): Promise<AvailabilityResponse[]> {
    const records = await this.list.execute(
      {
        vehicleId,
        ...(from ? { from: new Date(from) } : {}),
        ...(to ? { to: new Date(to) } : {}),
      },
      { userId: user.id },
    );
    return records.map(toAvailabilityResponse);
  }

  @Delete("driver-profiles/me/vehicles/:vehicleId/availability/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param("id") id: string, @CurrentUser() user: AuthUser): Promise<void> {
    await this.unblock.execute(id, { userId: user.id });
  }

  /**
   * Public availability check used by the (A4) booking flow before issuing
   * a quote. No PII is exposed; the response only reveals "this slot is busy".
   */
  @Public()
  @Get("vehicles/:vehicleId/availability/check")
  async checkFree(
    @Param("vehicleId") vehicleId: string,
    @Query(new ZodValidationPipe(CheckVehicleFreeQuerySchema)) query: CheckVehicleFreeQuery,
  ): Promise<CheckVehicleFreeResponse> {
    return this.check.execute({
      vehicleId,
      startAt: new Date(query.startAt),
      endAt: new Date(query.endAt),
    });
  }
}
