import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseInterceptors,
} from "@nestjs/common";

import {
  RejectDriverInputSchema,
  ReviewDocumentInputSchema,
  type DocumentResponse,
  type DriverProfileResponse,
  type RejectDriverInput,
  type ReviewDocumentInput,
  type VehicleResponse,
} from "@event-fleet/shared-types";

import { CurrentUser, type AuthUser } from "../../../../common/auth/current-user.decorator";
import { Roles } from "../../../../common/auth/roles.decorator";
import { IdempotencyInterceptor } from "../../../../common/idempotency/idempotency.interceptor";
import { ZodValidationPipe } from "../../../../common/pipes/zod-validation.pipe";
import { ActivateVehicleUseCase } from "../../application/use-cases/activate-vehicle.use-case";
import { ApproveDriverUseCase } from "../../application/use-cases/approve-driver.use-case";
import { ListPendingDriversUseCase } from "../../application/use-cases/list-pending-drivers.use-case";
import { RejectDriverUseCase } from "../../application/use-cases/reject-driver.use-case";
import { ReviewDocumentUseCase } from "../../application/use-cases/review-document.use-case";
import {
  toDocumentResponse,
  toDriverProfileResponse,
  toVehicleResponse,
} from "../mappers/driver-profile.mapper";

@Controller("admin/supply")
@Roles("ADMIN")
export class AdminSupplyController {
  constructor(
    private readonly listPending: ListPendingDriversUseCase,
    private readonly approve: ApproveDriverUseCase,
    private readonly reject: RejectDriverUseCase,
    private readonly review: ReviewDocumentUseCase,
    private readonly activate: ActivateVehicleUseCase,
  ) {}

  @Get("driver-profiles")
  async pending(
    @Query("limit") limitRaw?: string,
    @Query("cursor") cursor?: string,
  ): Promise<{ items: DriverProfileResponse[]; nextCursor: string | null }> {
    const limit = limitRaw ? Number.parseInt(limitRaw, 10) : undefined;
    const result = await this.listPending.execute({
      ...(limit !== undefined && Number.isFinite(limit) ? { limit } : {}),
      ...(cursor ? { cursor } : {}),
    });
    return {
      items: result.items.map(toDriverProfileResponse),
      nextCursor: result.nextCursor,
    };
  }

  @Post("driver-profiles/:id/approve")
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(IdempotencyInterceptor)
  async approveOne(
    @Param("id") id: string,
    @CurrentUser() admin: AuthUser,
  ): Promise<DriverProfileResponse> {
    const result = await this.approve.execute(id, { userId: admin.id });
    return toDriverProfileResponse(result);
  }

  @Post("driver-profiles/:id/reject")
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(IdempotencyInterceptor)
  async rejectOne(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(RejectDriverInputSchema)) body: RejectDriverInput,
    @CurrentUser() admin: AuthUser,
  ): Promise<DriverProfileResponse> {
    const result = await this.reject.execute(id, body.rejectionReason, { userId: admin.id });
    return toDriverProfileResponse(result);
  }

  @Post("documents/:id/review")
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(IdempotencyInterceptor)
  async reviewDocument(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(ReviewDocumentInputSchema)) body: ReviewDocumentInput,
    @CurrentUser() admin: AuthUser,
  ): Promise<DocumentResponse> {
    const result = await this.review.execute(
      id,
      {
        decision: body.decision,
        ...(body.rejectionReason ? { rejectionReason: body.rejectionReason } : {}),
      },
      { userId: admin.id },
    );
    return toDocumentResponse(result);
  }

  @Post("vehicles/:id/activate")
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(IdempotencyInterceptor)
  async activateVehicle(
    @Param("id") id: string,
    @CurrentUser() admin: AuthUser,
  ): Promise<VehicleResponse> {
    const result = await this.activate.execute(id, { userId: admin.id });
    return toVehicleResponse(result);
  }
}
