import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseInterceptors } from "@nestjs/common";

import {
  CancelBookingInputSchema,
  type BookingResponse,
  type CancelBookingInput,
} from "@event-fleet/shared-types";

import { CurrentUser, type AuthUser } from "../../../../common/auth/current-user.decorator";
import { Roles } from "../../../../common/auth/roles.decorator";
import { IdempotencyInterceptor } from "../../../../common/idempotency/idempotency.interceptor";
import { ZodValidationPipe } from "../../../../common/pipes/zod-validation.pipe";
import { CancelBookingUseCase } from "../../application/use-cases/cancel-booking.use-case";
import { GetBookingUseCase } from "../../application/use-cases/get-booking.use-case";
import { toBookingResponse } from "../mappers/booking.mapper";

@Controller("admin/bookings")
@Roles("ADMIN")
export class AdminBookingController {
  constructor(
    private readonly get: GetBookingUseCase,
    private readonly cancel: CancelBookingUseCase,
  ) {}

  @Get(":id")
  async getBooking(
    @Param("id", new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<BookingResponse> {
    const booking = await this.get.execute(id, { userId: user.id, role: user.role });
    return toBookingResponse(booking);
  }

  @Post(":id/cancel")
  @UseInterceptors(IdempotencyInterceptor)
  async cancelBooking(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(CancelBookingInputSchema)) body: CancelBookingInput,
    @CurrentUser() user: AuthUser,
  ): Promise<BookingResponse> {
    const booking = await this.cancel.execute(
      { bookingId: id, reason: body.reason },
      { userId: user.id, role: "ADMIN" },
    );
    return toBookingResponse(booking);
  }
}
