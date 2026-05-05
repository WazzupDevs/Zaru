import { Inject, Injectable } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { InjectPinoLogger, PinoLogger } from "nestjs-pino";

import { TX_RUNNER_PORT, type TxRunnerPort } from "../../../../common/persistence/tx-runner.port";
import {
  USER_REPOSITORY_PORT,
  type UserRepositoryPort,
} from "../../../identity/application/ports/user.repository.port";
import { QueueNotificationUseCase } from "../use-cases/queue-notification.use-case";

/**
 * In-process bridge from outbox events (drained by OutboxScheduler →
 * EventEmitter2.emitAsync) to the notifications queue. The booking and
 * dispatch modules never know notifications exist; they just write the
 * outbox row. This listener does the cross-module read of the
 * recipient's phone via UserRepositoryPort (Identity), keeping the
 * outbox payload itself PII-free (ADR 0019, A4b discipline).
 *
 * Driver-side notifications need the driver's user id resolved from the
 * driverProfileId in the dispatch event payload. We do that with a
 * second lookup — the matching SQL touches a different table so the
 * tx cost is negligible at our volume.
 *
 * Faz 3+ multi-instance API: in-process listener won't fan out across
 * pods. ADR 0021 revisit trigger.
 */
@Injectable()
export class OutboxNotificationListener {
  constructor(
    @Inject(USER_REPOSITORY_PORT) private readonly userRepo: UserRepositoryPort,
    @Inject(TX_RUNNER_PORT) private readonly tx: TxRunnerPort,
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
    const customer = await this.tx.run((tx) =>
      this.userRepo.findActiveById(tx, payload.customerId),
    );
    if (!customer) {
      this.logger.warn({ customerId: payload.customerId }, "skip notification: customer not found");
      return;
    }
    await this.queueNotification.execute({
      channel: "SMS",
      kind: "BOOKING_CONFIRMED",
      recipientUserId: customer.id,
      recipientPhone: customer.phoneE164,
      templateKey: "booking.confirmed",
      locale: "tr",
      variables: {
        customerName: customer.displayName ?? "Müşterimiz",
        bookingShortId: payload.bookingId.slice(0, 8),
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
    // The cancel event tells us who pressed the button, but the SMS
    // recipient is always the booking customer. We need a second hop to
    // get there: read the booking via Prisma directly (cheap since we're
    // already in a tx). For now, read by aggregate id from the payload
    // and assume the cancelled-by user is also the customer for the
    // CUSTOMER role; admin cancellations carry the cancelled-by-admin
    // tag and we still want the CUSTOMER to be notified — A4e-2 will
    // grow a BookingRepository read here. For A4e-1 we ship the
    // cancelled-by-customer happy path which is the dominant case.
    if (payload.cancelledByRole !== "CUSTOMER") {
      this.logger.debug(
        { bookingId: payload.bookingId, role: payload.cancelledByRole },
        "skip cancel notification: only CUSTOMER cancels surface SMS in A4e-1",
      );
      return;
    }
    const customer = await this.tx.run((tx) =>
      this.userRepo.findActiveById(tx, payload.cancelledByUserId),
    );
    if (!customer) return;
    await this.queueNotification.execute({
      channel: "SMS",
      kind: "BOOKING_CANCELLED",
      recipientUserId: customer.id,
      recipientPhone: customer.phoneE164,
      templateKey: "booking.cancelled",
      locale: "tr",
      variables: {
        customerName: customer.displayName ?? "Müşterimiz",
        bookingShortId: payload.bookingId.slice(0, 8),
      },
      sourceEventType: "booking.BookingCancelled",
      sourceAggregateId: payload.bookingId,
    });
  }

  @OnEvent("booking.BookingExpired", { async: true })
  onBookingExpired(payload: { bookingId: string; expiredAt: string }): void {
    // Expired events come from the worker — they don't carry the
    // customer id. A4e-2 will read the Booking row to resolve the
    // customer; A4e-1 logs and skips so we don't fail loudly.
    this.logger.debug(
      { bookingId: payload.bookingId },
      "BookingExpired notification deferred to A4e-2 (needs booking lookup)",
    );
  }

  @OnEvent("dispatch.DriverDispatched", { async: true })
  onDriverDispatched(payload: {
    bookingId: string;
    driverProfileId: string;
    vehicleId: string;
    distanceKm: number;
    score: number;
    attempts: number;
    dispatchedAt: string;
  }): void {
    // Driver SMS — needs driver_profile → user → phone resolution.
    // For A4e-1 we log the intent; A4e-2 will wire the driver
    // repository read once Notifications imports SupplyModule.
    this.logger.info(
      {
        bookingId: payload.bookingId,
        driverProfileId: payload.driverProfileId,
      },
      "dispatch.DriverDispatched observed — driver SMS deferred to A4e-2",
    );
  }

  private formatTrDate(date: Date): string {
    return date.toLocaleDateString("tr-TR", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }
}
