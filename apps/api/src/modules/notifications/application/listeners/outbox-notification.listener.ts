import { Injectable } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { InjectPinoLogger, PinoLogger } from "nestjs-pino";

import { formatTrCurrency } from "../services/format.helpers";
import {
  NotificationContextProvider,
  type NotificationCustomerContext,
} from "../services/notification-context.provider";
import { QueueNotificationUseCase } from "../use-cases/queue-notification.use-case";

import type { NotificationChannel, NotificationKind } from "../../domain/notification-types";

/**
 * Channel routing — token present → PUSH, otherwise SMS fallback.
 * Returning channel + token in one shape lets call sites stay flat.
 * ADR 0021 amended in A4e-3.
 */
function pickChannel(customer: NotificationCustomerContext): {
  channel: NotificationChannel;
  recipientPushToken: string | null;
} {
  if (customer.expoPushToken !== null && customer.expoPushToken.length > 0) {
    return { channel: "PUSH", recipientPushToken: customer.expoPushToken };
  }
  return { channel: "SMS", recipientPushToken: null };
}

/**
 * In-process bridge from outbox events (drained by OutboxScheduler →
 * EventEmitter2.emitAsync) to the notifications queue. Booking and
 * dispatch modules never know notifications exist; they just write
 * the outbox row.
 *
 * Customer-facing event chains (post-A4f-2b-2):
 *   booking.BookingCreated     → BOOKING_CONFIRMED  (template: booking.confirmed)
 *   booking.BookingCancelled   → BOOKING_CANCELLED  (template: booking.cancelled)
 *   booking.BookingExpired     → BOOKING_EXPIRED    (template: booking.expired)
 *   dispatch.DriverOfferAccepted → DRIVER_ASSIGNED_TO_BOOKING (template: booking.driver_assigned)
 *   dispatch.DriverOnTheWay    → DRIVER_ON_THE_WAY  (template: dispatch.driver_on_the_way)
 *   dispatch.DriverArrived     → DRIVER_ARRIVED    (template: dispatch.driver_arrived)
 *   dispatch.BookingCompleted  → BOOKING_COMPLETED (template: booking.completed)
 *
 * Driver-facing event chains:
 *   dispatch.DriverDispatched  → NEW_BOOKING_OFFER  (template: dispatch.new_offer)
 *
 * Note that DriverDispatched no longer fans out to the customer —
 * under the offer flow (A4f-2a/2b) that event only marks "offer
 * created", not "driver locked in". The DRIVER_ASSIGNED_TO_BOOKING
 * customer notification now fires off DriverOfferAccepted, which is
 * the actual moment the booking transitions to DRIVER_ASSIGNED.
 *
 * Recipient phones + push tokens are resolved via NotificationContext
 * Provider — keeps outbox payloads PII-free (ADR 0019, A4b discipline)
 * and concentrates cross-module reads in one tested service (A4e-2).
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

  /**
   * Driver SMS only — under the A4f-2 offer flow this event fires
   * when the worker creates a PENDING offer. The customer is NOT
   * notified yet (the offer might be rejected/expired); they receive
   * DRIVER_ASSIGNED_TO_BOOKING only on DriverOfferAccepted.
   */
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
        "skip DriverDispatched notification: booking not found",
      );
      return;
    }
    const driver = await this.contextProvider.getDriverContext(payload.driverProfileId);
    if (!driver) {
      this.logger.warn(
        { driverProfileId: payload.driverProfileId },
        "skip DriverDispatched notification: driver not found",
      );
      return;
    }

    await this.queueNotification.execute({
      channel: "SMS",
      kind: "NEW_BOOKING_OFFER",
      recipientUserId: driver.userId,
      recipientPhone: driver.phoneE164,
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
  }

  /**
   * Customer SMS / push — fires when the driver taps Kabul Et and the
   * booking transitions to DRIVER_ASSIGNED. Replaces the previous
   * "DriverDispatched fans out to customer" path; that event now only
   * means "offered, awaiting accept".
   */
  @OnEvent("dispatch.DriverOfferAccepted", { async: true })
  async onDriverOfferAccepted(payload: {
    offerId: string;
    bookingId: string;
    driverProfileId: string;
    vehicleId: string;
    acceptedAt: string;
  }): Promise<void> {
    await this.fanoutCustomerLifecycle({
      bookingId: payload.bookingId,
      kind: "DRIVER_ASSIGNED_TO_BOOKING",
      templateKey: "booking.driver_assigned",
      sourceEventType: "dispatch.DriverOfferAccepted",
    });
  }

  @OnEvent("dispatch.DriverOnTheWay", { async: true })
  async onDriverOnTheWay(payload: {
    offerId: string;
    bookingId: string;
    driverProfileId: string;
    onTheWayAt: string;
  }): Promise<void> {
    await this.fanoutCustomerLifecycle({
      bookingId: payload.bookingId,
      kind: "DRIVER_ON_THE_WAY",
      templateKey: "dispatch.driver_on_the_way",
      sourceEventType: "dispatch.DriverOnTheWay",
    });
  }

  @OnEvent("dispatch.DriverArrived", { async: true })
  async onDriverArrived(payload: {
    offerId: string;
    bookingId: string;
    driverProfileId: string;
    arrivedAt: string;
  }): Promise<void> {
    await this.fanoutCustomerLifecycle({
      bookingId: payload.bookingId,
      kind: "DRIVER_ARRIVED",
      templateKey: "dispatch.driver_arrived",
      sourceEventType: "dispatch.DriverArrived",
    });
  }

  @OnEvent("dispatch.BookingCompleted", { async: true })
  async onBookingCompleted(payload: {
    offerId: string;
    bookingId: string;
    driverProfileId: string;
    completedAt: string;
  }): Promise<void> {
    await this.fanoutCustomerLifecycle({
      bookingId: payload.bookingId,
      kind: "BOOKING_COMPLETED",
      templateKey: "booking.completed",
      sourceEventType: "dispatch.BookingCompleted",
    });
  }

  /**
   * The four post-accept lifecycle events all share the same shape:
   * look up customer, render with {customerName, bookingShortId},
   * pick channel by push-token presence. Extracted to keep each
   * @OnEvent handler a one-line dispatch.
   */
  private async fanoutCustomerLifecycle(params: {
    bookingId: string;
    kind: NotificationKind;
    templateKey: string;
    sourceEventType: string;
  }): Promise<void> {
    const booking = await this.contextProvider.getBookingContext(params.bookingId);
    if (!booking) {
      this.logger.warn(
        { bookingId: params.bookingId, kind: params.kind },
        "skip lifecycle notification: booking not found",
      );
      return;
    }
    const customer = await this.contextProvider.getCustomerContext(booking.customerId);
    if (!customer) return;

    const route = pickChannel(customer);
    await this.queueNotification.execute({
      channel: route.channel,
      kind: params.kind,
      recipientUserId: customer.userId,
      recipientPhone: customer.phoneE164,
      recipientPushToken: route.recipientPushToken,
      templateKey: params.templateKey,
      locale: "tr",
      variables: {
        customerName: customer.displayName ?? "Müşterimiz",
        bookingShortId: booking.bookingShortId,
      },
      sourceEventType: params.sourceEventType,
      sourceAggregateId: params.bookingId,
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
