import { Injectable } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { InjectPinoLogger, PinoLogger } from "nestjs-pino";

import { NotificationContextProvider } from "../services/notification-context.provider";
import { QueueNotificationUseCase } from "../use-cases/queue-notification.use-case";

/**
 * In-process bridge from outbox events (drained by OutboxScheduler →
 * EventEmitter2.emitAsync) to the notifications queue. Booking and
 * dispatch modules never know notifications exist; they just write
 * the outbox row.
 *
 * Recipient phones are resolved via NotificationContextProvider —
 * keeps outbox payloads PII-free (ADR 0019, A4b discipline) and
 * concentrates cross-module reads in one tested service (A4e-2).
 *
 * Faz 3+ multi-instance API: in-process listener won't fan out across
 * pods. ADR 0021 revisit trigger.
 */
@Injectable()
export class OutboxNotificationListener {
  constructor(
    private readonly contextProvider: NotificationContextProvider,
    private readonly queueNotification: QueueNotificationUseCase,
    @InjectPinoLogger(OutboxNotificationListener.name)
    private readonly logger: PinoLogger,
  ) {}

  @OnEvent("booking.BookingConfirmed", { async: true })
  async onBookingConfirmed(payload: {
    bookingId: string;
    customerId: string;
    vehicleTypeId: string;
    categoryId: string;
    totalAmount: string;
    currency: string;
    eventStartAt: string;
  }): Promise<void> {
    const customer = await this.contextProvider.getCustomerContext(payload.customerId);
    if (!customer) {
      this.logger.warn(
        { bookingId: payload.bookingId, customerId: payload.customerId },
        "skip BookingConfirmed notification: customer not found",
      );
      return;
    }
    await this.queueNotification.execute({
      channel: "SMS",
      kind: "BOOKING_CONFIRMED",
      recipientUserId: customer.userId,
      recipientPhone: customer.phoneE164,
      templateKey: "booking.confirmed",
      locale: "tr",
      variables: {
        customerName: customer.displayName ?? "Müşterimiz",
        bookingShortId: payload.bookingId.slice(0, 8).toUpperCase(),
        eventDate: this.formatTrDate(new Date(payload.eventStartAt)),
        totalAmount: payload.totalAmount,
      },
      sourceEventType: "booking.BookingConfirmed",
      sourceAggregateId: payload.bookingId,
    });
  }

  @OnEvent("booking.BookingCancelled", { async: true })
  async onBookingCancelled(payload: {
    bookingId: string;
    cancelledByUserId: string;
    cancelledByRole: string;
    previousStatus: string;
    cancelledAt: string;
  }): Promise<void> {
    // Customer is the booking owner. Even ADMIN-initiated cancels need
    // to reach the customer — we read the booking to find them rather
    // than trusting cancelledByUserId (which is admin id for admin path).
    void payload.cancelledByRole;
    const booking = await this.contextProvider.getBookingContext(payload.bookingId);
    if (!booking) {
      this.logger.warn(
        { bookingId: payload.bookingId },
        "skip BookingCancelled notification: booking not found",
      );
      return;
    }
    const customer = await this.contextProvider.getCustomerContext(booking.customerId);
    if (!customer) return;
    await this.queueNotification.execute({
      channel: "SMS",
      kind: "BOOKING_CANCELLED",
      recipientUserId: customer.userId,
      recipientPhone: customer.phoneE164,
      templateKey: "booking.cancelled",
      locale: "tr",
      variables: {
        customerName: customer.displayName ?? "Müşterimiz",
        bookingShortId: booking.bookingShortId,
      },
      sourceEventType: "booking.BookingCancelled",
      sourceAggregateId: payload.bookingId,
    });
  }

  @OnEvent("booking.BookingExpired", { async: true })
  async onBookingExpired(payload: { bookingId: string; expiredAt: string }): Promise<void> {
    const booking = await this.contextProvider.getBookingContext(payload.bookingId);
    if (!booking) {
      this.logger.warn(
        { bookingId: payload.bookingId },
        "skip BookingExpired notification: booking not found",
      );
      return;
    }
    const customer = await this.contextProvider.getCustomerContext(booking.customerId);
    if (!customer) return;
    await this.queueNotification.execute({
      channel: "SMS",
      kind: "BOOKING_EXPIRED",
      recipientUserId: customer.userId,
      recipientPhone: customer.phoneE164,
      templateKey: "booking.expired",
      locale: "tr",
      variables: {
        customerName: customer.displayName ?? "Müşterimiz",
        bookingShortId: booking.bookingShortId,
      },
      sourceEventType: "booking.BookingExpired",
      sourceAggregateId: payload.bookingId,
    });
  }

  @OnEvent("dispatch.DriverDispatched", { async: true })
  async onDriverDispatched(payload: {
    bookingId: string;
    driverProfileId: string;
    vehicleId: string;
    distanceKm: number;
    score: number;
    attempts: number;
    dispatchedAt: string;
  }): Promise<void> {
    const booking = await this.contextProvider.getBookingContext(payload.bookingId);
    if (!booking) {
      this.logger.warn(
        { bookingId: payload.bookingId },
        "skip DriverDispatched notifications: booking not found",
      );
      return;
    }
    const driver = await this.contextProvider.getDriverContext(payload.driverProfileId);
    if (!driver) {
      this.logger.warn(
        { driverProfileId: payload.driverProfileId },
        "skip DriverDispatched notifications: driver not found",
      );
      return;
    }
    const customer = await this.contextProvider.getCustomerContext(booking.customerId);
    if (!customer) return;

    // Two SMS — different recipientPhone, different kind: idempotency
    // window does not collide (ADR 0021).
    await this.queueNotification.execute({
      channel: "SMS",
      kind: "NEW_BOOKING_OFFER",
      recipientUserId: driver.userId,
      recipientPhone: driver.phoneE164,
      templateKey: "dispatch.new_offer",
      locale: "tr",
      variables: {
        eventDate: this.formatTrDate(booking.eventStartAt),
        totalAmount: booking.totalAmount,
        bookingShortId: booking.bookingShortId,
      },
      sourceEventType: "dispatch.DriverDispatched",
      sourceAggregateId: payload.bookingId,
    });

    await this.queueNotification.execute({
      channel: "SMS",
      kind: "DRIVER_ASSIGNED_TO_BOOKING",
      recipientUserId: customer.userId,
      recipientPhone: customer.phoneE164,
      templateKey: "booking.driver_assigned",
      locale: "tr",
      variables: {
        customerName: customer.displayName ?? "Müşterimiz",
        bookingShortId: booking.bookingShortId,
      },
      sourceEventType: "dispatch.DriverDispatched",
      sourceAggregateId: payload.bookingId,
    });
  }

  private formatTrDate(date: Date): string {
    return date.toLocaleDateString("tr-TR", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }
}
