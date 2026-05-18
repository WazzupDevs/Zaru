import type { DriverOfferStatus, DriverRejectReason } from "../../domain/driver-offer-types";

/**
 * Money returned to the driver app on the offer detail / history
 * endpoints. String-encoded so the wire format is deterministic and
 * the mobile app can present it without re-parsing through a Decimal
 * library. ALWAYS two decimal places (formatted via Decimal.toFixed).
 */
export interface DriverOfferMoneyView {
  amount: string;
  currency: string;
}

/** Enriched detail returned by GetDriverOfferUseCase. */
export interface DriverOfferDetailView {
  offerId: string;
  bookingId: string;
  status: DriverOfferStatus;

  expiresAt: Date;
  acceptedAt: Date | null;
  rejectedAt: Date | null;
  onTheWayAt: Date | null;
  arrivedAt: Date | null;
  inProgressAt: Date | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
  rejectReason: DriverRejectReason | null;

  booking: {
    pickupAddress: string;
    dropoffAddress: string;
    pickupLat: string;
    pickupLng: string;
    eventStartAt: Date;
    eventEndAt: Date;
    totalAmount: DriverOfferMoneyView;
  };

  vehicle: {
    brand: string;
    model: string;
    plateNumber: string;
  } | null;

  customer: {
    /** Customer's chosen displayName; null when not set. */
    displayName: string | null;
    /** Masked phone (+90555***4567). Plaintext NEVER returned to driver. */
    phoneMasked: string;
  };

  /** Driver's share after platform commission. */
  driverEarnings: DriverOfferMoneyView;
}

/** Compact summary returned by ListDriverOfferHistoryUseCase. */
export interface DriverOfferSummaryView {
  offerId: string;
  bookingId: string;
  status: DriverOfferStatus;
  createdAt: Date;
  completedAt: Date | null;
  eventStartAt: Date | null;
  pickupAddress: string;
  driverEarnings: DriverOfferMoneyView;
}
