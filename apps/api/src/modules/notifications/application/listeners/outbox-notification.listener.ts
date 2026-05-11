import { Injectable } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { InjectPinoLogger, PinoLogger } from "nestjs-pino";

import { formatTrCurrency } from "../services/format.helpers";
import {
  NotificationContextProvider,
  type NotificationCustomerContext,
  type NotificationDriverContext,
} from "../services/notification-context.provider";
import { QueueNotificationUseCase } from "../use-cases/queue-notification.use-case";

import type { NotificationChannel } from "../../domain/notification-types";

/**
 * Channel routing — token present → PUSH, otherwise SMS fallback.
 * Returning channel + token in one shape lets call sites stay flat.
 * ADR 0021 amended in A4e-3 (customer side) + A4f-1b (driver side).
 *
 * The single shape accepts either context type because both expose
 * `expoPushToken` with identical semantics — keeping a union here means
 * the four event handlers (BookingCreated/Cancelled/Expired,
 * DriverDispatched) all use the same routing helper.
 */
function pickChannel(context: NotificationCustomerContext | NotificationDriverContext): {
  channel: NotificationChannel;
  recipientPushToken: string | null;
} {
  if (context.expoPushToken !== null && context.expoPushToken.length > 0) {
    return { channel: "PUSH", recipientPushToken: context.expoPushToken };
  }
  return { channel: "SMS", recipientPushToken: null };
}

/**
 * In-process bridge from outbox events (drained by OutboxScheduler →
 * EventEmitter2.emitAsync) to the notifications queue. Booking and
 * dispatch modules never know notifications exist; they just write
 * the outbox row.
 *
 * Recipient phones + push tokens are resolved via NotificationContext
 * Provider — keeps outbox payloads PII-free (ADR 0019, A4b discipline)
 * and concentrates cross-module reads in one tested service (A4e-2).
 *
 * Channel selection (A4e-3): PUSH if the customer has a registered
 * Expo token, otherwise SMS. Drivers always receive SMS for now —
 * driver mobile app + push registration land in A4f.
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

  // Subscribed to BookingCreated (not BookingConfirmed): the Created
  // payload carries totalAmount + eventStartAt + eventEndAt that the
  // template needs. ConfirmBookingUseCase emits both events in the
  // same tx; BookingConfirmed is the lifecycle marker (time-only) for
  // future audit-style consumers and intentionally not consumed here.
  @OnEvent("booking.BookingCreated", { async: true })
  async onBookingCreated(payload: {
    bookingId: string;
    customerId: string;
    vehicleTypeId: string;
    categoryId: string;
    totalAmount: string;
    currency: string;
    eventStartAt: string;
    eventEndAt: string;
  }): Promise<void> {
    const customer = await this.contextProvider.getCustomerContext(payload.customerId);
    if (!customer) {
      this.logger.warn(
        { bookingId: payload.bookingId, customerId: payload.customerId },
        "skip BookingCreated notification: customer not found",
      );
      return;
    }
    const route = pickChannel(customer);
    await this.queueNotification.execute({
      channel: route.channel,
      kind: "BOOKING_CONFIRMED",
      recipientUserId: customer.userId,
      recipientPhone: customer.phoneE164,
      recipientPushToken: route.recipientPushToken,
      templateKey: "booking.confirmed",
      locale: "tr",
      variables: {
        customerName: customer.displayName ?? "Müşterimiz",
        bookingShortId: payload.bookingId.slice(0, 8).toUpperCase(),
        eventDate: this.formatTrDate(new Date(payload.eventStartAt)),
        totalAmount: formatTrCurrency(payload.totalAmount),
      },
      sourceEventType: "booking.BookingCreated",
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
    const route = pickChannel(customer);
    await this.queueNotification.execute({
      channel: route.channel,
      kind: "BOOKING_CANCELLED",
      recipientUserId: customer.userId,
      recipientPhone: customer.phoneE164,
      recipientPushToken: route.recipientPushToken,
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
    const route = pickChannel(customer);
    await this.queueNotification.execute({
      channel: route.channel,
      kind: "BOOKING_EXPIRED",
      recipientUserId: customer.userId,
      recipientPhone: customer.phoneE164,
      recipientPushToken: route.recipientPushToken,
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

    // Driver — A4f-1b wires push registration in the driver mobile app,
    // so this side now picks PUSH when the driver has a token (same
    // helper as the customer path; SMS stays the fallback for drivers
    // who declined permission or are on a simulator).
    const driverRoute = pickChannel(driver);
    await this.queueNotification.execute({
      channel: driverRoute.channel,
      kind: "NEW_BOOKING_OFFER",
      recipientUserId: driver.userId,
      recipientPhone: driver.phoneE164,
      recipientPushToken: driverRoute.recipientPushToken,
      templateKey: "dispatch.new_offer",
      locale: "tr",
      variables: {
        eventDate: this.formatTrDate(booking.eventStartAt),
        totalAmount: formatTrCurrency(booking.totalAmount),
        bookingShortId: booking.bookingShortId,
      },
      sourceEventType: "dispatch.DriverDispatched",
      sourceAggregateId: payload.bookingId,
    });

    // Customer side picks the channel from the customer's push token.
    const customerRoute = pickChannel(customer);
    await this.queueNotification.execute({
      channel: customerRoute.channel,
      kind: "DRIVER_ASSIGNED_TO_BOOKING",
      recipientUserId: customer.userId,
      recipientPhone: customer.phoneE164,
      recipientPushToken: customerRoute.recipientPushToken,
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
