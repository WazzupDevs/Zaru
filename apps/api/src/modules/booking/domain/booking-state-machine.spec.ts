import { describe, expect, it } from "vitest";

import { BookingStateMachine } from "./booking-state-machine";
import { InvalidBookingTransitionError } from "./errors/booking-errors";

describe("BookingStateMachine.canTransition", () => {
  // From DRAFT
  it("DRAFT → CONFIRMED is allowed", () => {
    expect(BookingStateMachine.canTransition("DRAFT", "CONFIRMED")).toBe(true);
  });
  it("DRAFT → EXPIRED is allowed (worker)", () => {
    expect(BookingStateMachine.canTransition("DRAFT", "EXPIRED")).toBe(true);
  });
  it("DRAFT → CANCELLED_BY_CUSTOMER is allowed", () => {
    expect(BookingStateMachine.canTransition("DRAFT", "CANCELLED_BY_CUSTOMER")).toBe(true);
  });
  it("DRAFT → IN_PROGRESS is rejected (skipping confirm + dispatch)", () => {
    expect(BookingStateMachine.canTransition("DRAFT", "IN_PROGRESS")).toBe(false);
  });

  // From CONFIRMED
  it("CONFIRMED → DRIVER_ASSIGNED is allowed", () => {
    expect(BookingStateMachine.canTransition("CONFIRMED", "DRIVER_ASSIGNED")).toBe(true);
  });
  it("CONFIRMED → IN_PROGRESS is rejected (driver must be assigned first)", () => {
    expect(BookingStateMachine.canTransition("CONFIRMED", "IN_PROGRESS")).toBe(false);
  });
  it("CONFIRMED → CANCELLED_BY_CUSTOMER is allowed", () => {
    expect(BookingStateMachine.canTransition("CONFIRMED", "CANCELLED_BY_CUSTOMER")).toBe(true);
  });

  // From DRIVER_ASSIGNED
  it("DRIVER_ASSIGNED → IN_PROGRESS is allowed", () => {
    expect(BookingStateMachine.canTransition("DRIVER_ASSIGNED", "IN_PROGRESS")).toBe(true);
  });
  it("DRIVER_ASSIGNED → CANCELLED_BY_CUSTOMER is allowed", () => {
    expect(BookingStateMachine.canTransition("DRIVER_ASSIGNED", "CANCELLED_BY_CUSTOMER")).toBe(
      true,
    );
  });
  it("DRIVER_ASSIGNED → CANCELLED_BY_DRIVER is allowed", () => {
    expect(BookingStateMachine.canTransition("DRIVER_ASSIGNED", "CANCELLED_BY_DRIVER")).toBe(true);
  });

  // From IN_PROGRESS
  it("IN_PROGRESS → COMPLETED is allowed", () => {
    expect(BookingStateMachine.canTransition("IN_PROGRESS", "COMPLETED")).toBe(true);
  });
  it("IN_PROGRESS → DISPUTED is allowed", () => {
    expect(BookingStateMachine.canTransition("IN_PROGRESS", "DISPUTED")).toBe(true);
  });
  it("IN_PROGRESS → CANCELLED_BY_CUSTOMER is rejected (event already started)", () => {
    expect(BookingStateMachine.canTransition("IN_PROGRESS", "CANCELLED_BY_CUSTOMER")).toBe(false);
  });

  // Terminal states
  it("COMPLETED → anything is rejected", () => {
    expect(BookingStateMachine.canTransition("COMPLETED", "DISPUTED")).toBe(false);
    expect(BookingStateMachine.canTransition("COMPLETED", "CANCELLED_BY_CUSTOMER")).toBe(false);
  });
  it("EXPIRED → anything is rejected", () => {
    expect(BookingStateMachine.canTransition("EXPIRED", "CONFIRMED")).toBe(false);
  });
  it("CANCELLED_BY_CUSTOMER → anything is rejected", () => {
    expect(BookingStateMachine.canTransition("CANCELLED_BY_CUSTOMER", "DRAFT")).toBe(false);
  });
});

describe("BookingStateMachine.assertTransition", () => {
  it("returns silently for valid transitions", () => {
    expect(() => {
      BookingStateMachine.assertTransition("DRAFT", "CONFIRMED");
    }).not.toThrow();
  });

  it("throws InvalidBookingTransitionError for invalid transitions", () => {
    expect(() => {
      BookingStateMachine.assertTransition("COMPLETED", "DRAFT");
    }).toThrow(InvalidBookingTransitionError);
  });

  it("error carries the from/to context", () => {
    try {
      BookingStateMachine.assertTransition("EXPIRED", "CONFIRMED");
      expect.fail("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(InvalidBookingTransitionError);
      const e = err as InvalidBookingTransitionError;
      expect(e.from).toBe("EXPIRED");
      expect(e.to).toBe("CONFIRMED");
    }
  });
});

describe("BookingStateMachine.isTerminal", () => {
  it.each([
    "COMPLETED",
    "EXPIRED",
    "CANCELLED_BY_CUSTOMER",
    "CANCELLED_BY_DRIVER",
    "DISPUTED",
  ] as const)("%s is terminal", (s) => {
    expect(BookingStateMachine.isTerminal(s)).toBe(true);
  });

  it.each(["DRAFT", "CONFIRMED", "DRIVER_ASSIGNED", "IN_PROGRESS"] as const)(
    "%s is non-terminal",
    (s) => {
      expect(BookingStateMachine.isTerminal(s)).toBe(false);
    },
  );
});

describe("BookingStateMachine.isCancellable", () => {
  it.each(["DRAFT", "CONFIRMED", "DRIVER_ASSIGNED"] as const)("%s is cancellable", (s) => {
    expect(BookingStateMachine.isCancellable(s)).toBe(true);
  });

  it.each([
    "IN_PROGRESS",
    "COMPLETED",
    "EXPIRED",
    "CANCELLED_BY_CUSTOMER",
    "CANCELLED_BY_DRIVER",
    "DISPUTED",
  ] as const)("%s is NOT cancellable", (s) => {
    expect(BookingStateMachine.isCancellable(s)).toBe(false);
  });
});
