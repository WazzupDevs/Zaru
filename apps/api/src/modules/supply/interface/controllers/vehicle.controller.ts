import { Body, Controller, Get, Param, Patch, Post, UseInterceptors } from "@nestjs/common";

import {
  RegisterVehicleInputSchema,
  UpdateVehicleAttributesInputSchema,
  type RegisterVehicleInput,
  type UpdateVehicleAttributesInput,
  type VehicleResponse,
} from "@event-fleet/shared-types";

import { CurrentUser, type AuthUser } from "../../../../common/auth/current-user.decorator";
import { IdempotencyInterceptor } from "../../../../common/idempotency/idempotency.interceptor";
import { ZodValidationPipe } from "../../../../common/pipes/zod-validation.pipe";
import { ListMyVehiclesUseCase } from "../../application/use-cases/list-my-vehicles.use-case";
import { RegisterVehicleUseCase } from "../../application/use-cases/register-vehicle.use-case";
import { UpdateVehicleAttributesUseCase } from "../../application/use-cases/update-vehicle-attributes.use-case";
import { toVehicleResponse } from "../mappers/driver-profile.mapper";

@Controller("supply/driver-profiles/me/vehicles")
export class VehicleController {
  constructor(
    private readonly register: RegisterVehicleUseCase,
    private readonly listMine: ListMyVehiclesUseCase,
    private readonly updateAttrs: UpdateVehicleAttributesUseCase,
  ) {}

  @Post()
  @UseInterceptors(IdempotencyInterceptor)
  async create(
    @Body(new ZodValidationPipe(RegisterVehicleInputSchema)) body: RegisterVehicleInput,
    @CurrentUser() user: AuthUser,
  ): Promise<VehicleResponse> {
    const vehicle = await this.register.execute(body, { userId: user.id });
    return toVehicleResponse(vehicle);
  }

  @Get()
  async list(@CurrentUser() user: AuthUser): Promise<VehicleResponse[]> {
    const items = await this.listMine.execute({ userId: user.id });
    return items.map(toVehicleResponse);
  }

  @Patch(":id")
  async update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(UpdateVehicleAttributesInputSchema))
    body: UpdateVehicleAttributesInput,
    @CurrentUser() user: AuthUser,
  ): Promise<VehicleResponse> {
    const updated = await this.updateAttrs.execute(id, body, { userId: user.id });
    return toVehicleResponse(updated);
  }
}
