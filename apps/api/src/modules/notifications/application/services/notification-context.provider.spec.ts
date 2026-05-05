import { describe, expect, it, vi } from "vitest";

import { NotificationContextProvider } from "./notification-context.provider";

import type { TxClient } from "../../../../common/persistence/tx-client";
import type { TxRunnerPort } from "../../../../common/persistence/tx-runner.port";
import type { BookingEntity } from "../../../booking/domain/booking-types";
import type { BookingRepositoryPort } from "../../../booking/domain/ports/booking.repository.port";
import type {
  UserRecord,
  UserRepositoryPort,
} from "../../../identity/application/ports/user.repository.port";
import type {
  DriverProfileRecord,
  DriverProfileRepositoryPort,
} from "../../../supply/application/ports/driver-profile.repository.port";
import type {
  VehicleRecord,
  VehicleRepositoryPort,
} from "../../../supply/application/ports/vehicle.repository.port";

class FakeTxRunner implements TxRunnerPort {
  async run<T>(fn: (tx: TxClient) => Promise<T>): Promise<T> {
    return fn({} as TxClient);
  }
}

function buildUser(overrides: Partial<UserRecord> = {}): UserRecord {
  return {
    id: "u-1",
    phoneE164: "+905551112233",
    displayName: "Ahmet",
    role: "CUSTOMER",
    phoneVerifiedAt: new Date(),
    lastLoginAt: null,
    createdAt: new Date(),
    ...overrides,
  };
}

function buildBooking(): BookingEntity {
  return {
    id: "b1234567abcdef",
    customerId: "u-1",
    priceQuoteId: "q-1",
    status: "CONFIRMED",
    vehicleTypeId: "vt",
    categoryId: "cat",
    pickupLat: "0" as never,
    pickupLng: "0" as never,
    pickupAddress: "Sultanahmet Mahallesi, Fatih, İstanbul",
    dropoffLat: "0" as never,
    dropoffLng: "0" as never,
    dropoffAddress: "Beşiktaş Merkez, Beşiktaş, İstanbul",
    eventStartAt: new Date("2026-08-15T14:00:00Z"),
    eventEndAt: new Date("2026-08-15T22:00:00Z"),
    totalAmount: "6877.00" as never,
    currency: "TRY",
    confirmedAt: new Date(),
    driverAssignedAt: null,
    startedAt: null,
    completedAt: null,
    cancelledAt: null,
    expiredAt: null,
    cancellationReason: null,
    cancelledByUserId: null,
    driverId: null,
    vehicleId: null,
    dispatchAttempts: 0,
    lastDispatchAt: null,
    dispatchFailedReason: null,
    version: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function buildDriver(overrides: Partial<DriverProfileRecord> = {}): DriverProfileRecord {
  return {
    id: "dp-1",
    userId: "u-driver",
    firstName: "Mehmet",
    lastName: "Yılmaz",
    nationalIdHash: "h",
    birthDate: new Date(),
    ibanHash: "h",
    ibanLast4: "0000",
    status: "APPROVED",
    rejectionReason: null,
    approvedAt: new Date(),
    approvedByUserId: null,
    commissionRate: "0.15",
    version: 0,
    createdAt: new Date(),
    ...overrides,
  };
}

function buildVehicle(overrides: Partial<VehicleRecord> = {}): VehicleRecord {
  return {
    id: "v-1",
    driverProfileId: "dp-1",
    vehicleTypeId: "vt",
    plateNumber: "34SMOKE01",
    brand: "Renault",
    model: "Symbol",
    year: 2022,
    color: "ivory",
    attributes: {},
    photoKeys: [],
    status: "ACTIVE",
    version: 0,
    createdAt: new Date(),
    ...overrides,
  };
}

function build({
  user = buildUser(),
  driverUser = buildUser({ id: "u-driver", phoneE164: "+905551112299", displayName: "Mehmet" }),
  booking = buildBooking(),
  driver = buildDriver(),
  vehicles = [buildVehicle()],
}: {
  user?: UserRecord | null;
  driverUser?: UserRecord | null;
  booking?: BookingEntity | null;
  driver?: DriverProfileRecord | null;
  vehicles?: VehicleRecord[];
} = {}) {
  const userRepo: UserRepositoryPort = {
    findActiveById: vi.fn(async (_tx, id) => {
      if (id === "u-driver") return driverUser;
      if (user && id === user.id) return user;
      return null;
    }),
  } as unknown as UserRepositoryPort;
  const bookingRepo: BookingRepositoryPort = {
    findById: vi.fn(async (_tx, id) => (booking && booking.id === id ? booking : null)),
  } as unknown as BookingRepositoryPort;
  const driverRepo: DriverProfileRepositoryPort = {
    findActiveById: vi.fn(async (_tx, id) => (driver && driver.id === id ? driver : null)),
  } as unknown as DriverProfileRepositoryPort;
  const vehicleRepo: VehicleRepositoryPort = {
    listByDriver: vi.fn(async () => vehicles),
  } as unknown as VehicleRepositoryPort;

  const provider = new NotificationContextProvider(
    userRepo,
    bookingRepo,
    driverRepo,
    vehicleRepo,
    new FakeTxRunner(),
  );
  return { provider };
}

describe("NotificationContextProvider", () => {
  it("getCustomerContext returns mapped user data", async () => {
    const { provider } = build();
    const ctx = await provider.getCustomerContext("u-1");
    expect(ctx).toEqual({
      userId: "u-1",
      displayName: "Ahmet",
      phoneE164: "+905551112233",
    });
  });

  it("getCustomerContext returns null when user is missing", async () => {
    const { provider } = build({ user: null });
    expect(await provider.getCustomerContext("missing")).toBeNull();
  });

  it("getBookingContext maps + shortens addresses", async () => {
    const { provider } = build();
    const ctx = await provider.getBookingContext("b1234567abcdef");
    expect(ctx?.pickupArea).toBe("Sultanahmet Mahallesi, Fatih");
    expect(ctx?.dropoffArea).toBe("Beşiktaş Merkez, Beşiktaş");
    expect(ctx?.bookingShortId).toBe("B1234567");
    expect(ctx?.totalAmount).toBe("6877.00");
  });

  it("getBookingContext returns null when booking is missing", async () => {
    const { provider } = build({ booking: null });
    expect(await provider.getBookingContext("missing")).toBeNull();
  });

  it("getDriverContext composes driver + user + first vehicle info", async () => {
    const { provider } = build();
    const ctx = await provider.getDriverContext("dp-1");
    expect(ctx).toMatchObject({
      driverProfileId: "dp-1",
      userId: "u-driver",
      displayName: "Mehmet",
      phoneE164: "+905551112299",
      vehicleInfo: "Renault Symbol - ivory",
      plateNumber: "34SMOKE01",
    });
  });

  it("getDriverContext falls back to placeholder when driver has no vehicle", async () => {
    const { provider } = build({ vehicles: [] });
    const ctx = await provider.getDriverContext("dp-1");
    expect(ctx?.vehicleInfo).toBe("Belirtilmemiş");
    expect(ctx?.plateNumber).toBe("Belirtilmemiş");
  });

  it("getDriverContext returns null when driver missing", async () => {
    const { provider } = build({ driver: null });
    expect(await provider.getDriverContext("missing")).toBeNull();
  });

  it("getDriverContext returns null when driver's user missing", async () => {
    const { provider } = build({ driverUser: null });
    expect(await provider.getDriverContext("dp-1")).toBeNull();
  });
});
