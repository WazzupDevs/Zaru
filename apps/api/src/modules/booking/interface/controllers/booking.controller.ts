import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseInterceptors,
} from "@nestjs/common";

import {
  CancelBookingInputSchema,
  ConfirmBookingInputSchema,
  ListMyBookingsQuerySchema,
  type BookingResponse,
  type CancelBookingInput,
  type ConfirmBookingInput,
  type ListMyBookingsQuery,
} from "@event-fleet/shared-types";

import { CurrentUser, type AuthUser } from "../../../../common/auth/current-user.decorator";
import { IdempotencyInterceptor } from "../../../../common/idempotency/idempotency.interceptor";
import { ZodValidationPipe } from "../../../../common/pipes/zod-validation.pipe";
import { CancelBookingUseCase } from "../../application/use-cases/cancel-booking.use-case";
import { ConfirmBookingUseCase } from "../../application/use-cases/confirm-booking.use-case";
import { GetBookingUseCase } from "../../application/use-cases/get-booking.use-case";
import { ListMyBookingsUseCase } from "../../application/use-cases/list-my-bookings.use-case";
import { toBookingResponse } from "../mappers/booking.mapper";

@Controller("bookings")
export class BookingController {
  constructor(
    private readonly confirm: ConfirmBookingUseCase,
    private readonly cancel: CancelBookingUseCase,
    private readonly get: GetBookingUseCase,
    private readonly listMine: ListMyBookingsUseCase,
  ) {}

  @Post("confirm")
  @UseInterceptors(IdempotencyInterceptor)
  async confirmBooking(
    @Body(new ZodValidationPipe(ConfirmBookingInputSchema)) body: ConfirmBookingInput,
    @CurrentUser() user: AuthUser,
  ): Promise<BookingResponse> {
    const booking = await this.confirm.execute({ quoteId: body.quoteId }, { userId: user.id });
    return toBookingResponse(booking);
  }

  @Post(":id/cancel")
  @UseInterceptors(IdempotencyInterceptor)
  async cancelBooking(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(CancelBookingInputSchema)) body: CancelBookingInput,
    @CurrentUser() user: AuthUser,
  ): Promise<BookingResponse> {
    const role = user.role === "ADMIN" ? "ADMIN" : "CUSTOMER";
    const booking = await this.cancel.execute(
      { bookingId: id, reason: body.reason },
      { userId: user.id, role },
    );
    return toBookingResponse(booking);
  }

  @Get("me")
  async listMyBookings(
    @Query(new ZodValidationPipe(ListMyBookingsQuerySchema)) query: ListMyBookingsQuery,
    @CurrentUser() user: AuthUser,
  ): Promise<BookingResponse[]> {
    const items = await this.listMine.execute(
      {
        ...(query.status ? { status: query.status } : {}),
        ...(query.cursor ? { cursor: query.cursor } : {}),
        ...(query.limit ? { limit: query.limit } : {}),
      },
      { userId: user.id },
    );
    return items.map(toBookingResponse);
  }

  @Get(":id")
  async getBooking(
    @Param("id", new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<BookingResponse> {
    const booking = await this.get.execute(id, { userId: user.id, role: user.role });
    return toBookingResponse(booking);
  }
}
