import { describe, expect, it } from "vitest";

import { DriverOfferStateMachine } from "./driver-offer-state-machine";
import { OfferStateTransitionError } from "./errors/dispatch-errors";

import type { DriverOfferStatus } from "./driver-offer-types";

const VALID: readonly [DriverOfferStatus, DriverOfferStatus][] = [
  ["PENDING", "ACCEPTED"],
  ["PENDING", "REJECTED"],
  ["PENDING", "EXPIRED"],
  ["PENDING", "CANCELLED"],
  ["ACCEPTED", "ON_THE_WAY"],
  ["ACCEPTED", "CANCELLED"],
  ["ON_THE_WAY", "ARRIVED"],
  ["ON_THE_WAY", "CANCELLED"],
  ["ARRIVED", "IN_PROGRESS"],
  ["ARRIVED", "CANCELLED"],
  ["IN_PROGRESS", "COMPLETED"],
  ["IN_PROGRESS", "CANCELLED"],
];

const INVALID_SAMPLE: readonly [DriverOfferStatus, DriverOfferStatus][] = [
  // Skipping accept
  ["PENDING", "ON_THE_WAY"],
  ["PENDING", "ARRIVED"],
  ["PENDING", "IN_PROGRESS"],
  ["PENDING", "COMPLETED"],
  // Skipping forward inside the active chain
  ["ACCEPTED", "ARRIVED"],
  ["ACCEPTED", "IN_PROGRESS"],
  ["ACCEPTED", "COMPLETED"],
  ["ON_THE_WAY", "IN_PROGRESS"],
  ["ARRIVED", "COMPLETED"],
  // Walking the chain backwards — driver cannot un-tap a status.
  ["ON_THE_WAY", "ACCEPTED"],
  ["ARRIVED", "ON_THE_WAY"],
  ["IN_PROGRESS", "ARRIVED"],
  // Terminal escapes
  ["COMPLETED", "IN_PROGRESS"],
  ["REJECTED", "PENDING"],
  ["EXPIRED", "PENDING"],
  ["CANCELLED", "PENDING"],
  // No driver-side reject after accept
  ["ACCEPTED", "REJECTED"],
  ["ON_THE_WAY", "REJECTED"],
  ["IN_PROGRESS", "REJECTED"],
];

describe("DriverOfferStateMachine.canTransition", () => {
  it.each(VALID)("allows %s → %s", (from, to) => {
    expect(DriverOfferStateMachine.canTransition(from, to)).toBe(true);
  });

  it.each(INVALID_SAMPLE)("rejects %s → %s", (from, to) => {
    expect(DriverOfferStateMachine.canTransition(from, to)).toBe(false);
  });
});

describe("DriverOfferStateMachine.assertTransition", () => {
  it("returns void on a valid transition", () => {
    expect(() => {
      DriverOfferStateMachine.assertTransition("PENDING", "ACCEPTED");
    }).not.toThrow();
  });

  it("throws OfferStateTransitionError on an invalid transition", () => {
    expect(() => {
      DriverOfferStateMachine.assertTransition("PENDING", "COMPLETED");
    }).toThrow(OfferStateTransitionError);
  });

  it("includes the from/to pair on the thrown error for diagnostics", () => {
    try {
      DriverOfferStateMachine.assertTransition("COMPLETED", "PENDING");
      expect.fail("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(OfferStateTransitionError);
      const e = err as OfferStateTransitionError;
      expect(e.from).toBe("COMPLETED");
      expect(e.to).toBe("PENDING");
    }
  });
});

describe("DriverOfferStateMachine.isTerminal", () => {
  it.each(["COMPLETED", "REJECTED", "EXPIRED", "CANCELLED"] as const)(
    "%s is terminal",
    (status) => {
      expect(DriverOfferStateMachine.isTerminal(status)).toBe(true);
    },
  );

  it.each(["PENDING", "ACCEPTED", "ON_THE_WAY", "ARRIVED", "IN_PROGRESS"] as const)(
    "%s is NOT terminal",
    (status) => {
      expect(DriverOfferStateMachine.isTerminal(status)).toBe(false);
    },
  );
});

describe("DriverOfferStateMachine.isDriverDriven", () => {
  // Statuses the driver app can request via PATCH /status. ACCEPTED
  // is NOT driver-driven (acceptance uses POST /accept which has its
  // own concurrency + expiry guards); REJECTED is its own POST too.
  it.each(["ON_THE_WAY", "ARRIVED", "IN_PROGRESS", "COMPLETED"] as const)(
    "%s is reachable via PATCH /status",
    (status) => {
      expect(DriverOfferStateMachine.isDriverDriven(status)).toBe(true);
    },
  );

  it.each(["PENDING", "ACCEPTED", "REJECTED", "EXPIRED", "CANCELLED"] as const)(
    "%s is NOT reachable via PATCH /status",
    (status) => {
      expect(DriverOfferStateMachine.isDriverDriven(status)).toBe(false);
    },
  );
});
