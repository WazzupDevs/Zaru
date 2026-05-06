import { fireEvent, render } from "@testing-library/react-native";

import { BookingCard, statusDisplay } from "../BookingCard";

import type { BookingResponse } from "../../lib/api/booking";

const baseBooking: BookingResponse = {
  id: "11111111-1111-1111-1111-111111111111",
  customerId: "22222222-2222-2222-2222-222222222222",
  priceQuoteId: "33333333-3333-3333-3333-333333333333",
  status: "CONFIRMED",
  vehicleTypeId: "44444444-4444-4444-4444-444444444444",
  categoryId: "55555555-5555-5555-5555-555555555555",
  pickupAddress: "Sultanahmet, İstanbul",
  dropoffAddress: "Beşiktaş, İstanbul",
  eventStartAt: "2026-08-15T14:00:00.000Z",
  eventEndAt: "2026-08-15T22:00:00.000Z",
  totalAmount: "6877.00",
  currency: "TRY",
  confirmedAt: "2026-05-06T10:00:00.000Z",
  driverAssignedAt: null,
  startedAt: null,
  completedAt: null,
  cancelledAt: null,
  expiredAt: null,
  cancellationReason: null,
  driverId: null,
  vehicleId: null,
  version: 1,
  createdAt: "2026-05-06T10:00:00.000Z",
};

describe("BookingCard", () => {
  it("renders the formatted total amount", () => {
    const { getByText } = render(<BookingCard booking={baseBooking} onPress={jest.fn()} />);
    expect(getByText(/6\.877,00/)).toBeTruthy();
  });

  it("renders the pickup → dropoff line", () => {
    const { getByText } = render(<BookingCard booking={baseBooking} onPress={jest.fn()} />);
    expect(getByText(/Sultanahmet.*Beşiktaş/)).toBeTruthy();
  });

  it("renders the status label for CONFIRMED", () => {
    const { getByText } = render(<BookingCard booking={baseBooking} onPress={jest.fn()} />);
    expect(getByText("Onaylandı")).toBeTruthy();
  });

  it("fires onPress when the card is tapped", () => {
    const onPress = jest.fn();
    const { getByRole } = render(<BookingCard booking={baseBooking} onPress={onPress} />);
    fireEvent.press(getByRole("button"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe("statusDisplay", () => {
  it("returns the visual triple for every BookingStatus value", () => {
    // Cheap drift guard — if the API adds a new status the switch
    // returns undefined and this throws on access.
    const statuses = [
      "DRAFT",
      "CONFIRMED",
      "DRIVER_ASSIGNED",
      "IN_PROGRESS",
      "COMPLETED",
      "CANCELLED_BY_CUSTOMER",
      "CANCELLED_BY_DRIVER",
      "EXPIRED",
      "DISPUTED",
    ] as const;
    for (const s of statuses) {
      const v = statusDisplay(s);
      expect(v.label.length).toBeGreaterThan(0);
      expect(v.tone.startsWith("text-")).toBe(true);
      expect(v.bg.startsWith("bg-")).toBe(true);
      expect(v.iconColor.startsWith("#")).toBe(true);
      expect(v.icon.length).toBeGreaterThan(0);
    }
  });
});
