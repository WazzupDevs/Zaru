import { beforeEach, describe, expect, it } from "vitest";

import { BlockAvailabilityUseCase } from "./block-availability.use-case";
import { FrozenClock } from "../../../../../test/fakes/frozen-clock";
import {
  AvailabilityConflictError,
  InvalidAvailabilityRangeError,
  PastDateError,
  VehicleNotActiveError,
} from "../../domain/errors/availability-errors";
import { VehicleNotFoundError } from "../../domain/errors/vehicle-not-found.error";

import type {
  OutboxEventInput,
  OutboxWriterPort,
} from "../../../../common/persistence/outbox-writer.port";
import type { TxClient } from "../../../../common/persistence/tx-client";
import type { TxRunnerPort } from "../../../../common/persistence/tx-runner.port";
import type {
  DriverProfileRecord,
  DriverProfileRepositoryPort,
} from "../ports/driver-profile.repository.port";
import type {
  AvailabilityRecord,
  CreateAvailabilityRow,
  VehicleAvailabilityRepositoryPort,
} from "../ports/vehicle-availability.repository.port";
import type { VehicleRecord, VehicleRepositoryPort } from "../ports/vehicle.repository.port";

const NOW = new Date("2026-04-25T08:00:00.000Z");
const TOMORROW_10 = new Date("2026-04-26T10:00:00.000Z");
const TOMORROW_12 = new Date("2026-04-26T12:00:00.000Z");
const TOMORROW_11 = new Date("2026-04-26T11:00:00.000Z");
const TOMORROW_13 = new Date("2026-04-26T13:00:00.000Z");
const TOMORROW_14 = new Date("2026-04-26T14:00:00.000Z");
const YESTERDAY = new Date("2026-04-24T10:00:00.000Z");

const VEHICLE_ID = "01890d8e-3b9c-7000-8000-000000000010";
const DRIVER_ID = "01890d8e-3b9c-7000-8000-000000000020";
const USER_ID = "01890d8e-3b9c-7000-8000-000000000030";

class FakeTxRunner implements TxRunnerPort {
  async run<T>(fn: (tx: TxClient) => Promise<T>): Promise<T> {
    return fn({} as TxClient);
  }
}

class FakeProfileRepo implements Partial<DriverProfileRepositoryPort> {
  profile: DriverProfileRecord = {
    id: DRIVER_ID,
    userId: USER_ID,
    firstName: "A",
    lastName: "Y",
    nationalIdHash: "x",
    birthDate: new Date("1990-01-01"),
    ibanHash: "x",
    ibanLast4: "1234",
    status: "APPROVED",
    rejectionReason: null,
    approvedAt: NOW,
    approvedByUserId: null,
    commissionRate: "0.1500",
    version: 0,
    createdAt: NOW,
  };
  async findActiveByUserId(): Promise<DriverProfileRecord | null> {
    return this.profile;
  }
}

class FakeVehicleRepo implements Partial<VehicleRepositoryPort> {
  vehicle: VehicleRecord = {
    id: VEHICLE_ID,
    driverProfileId: DRIVER_ID,
    vehicleTypeId: "vt-1",
    plateNumber: "34ABC1234",
    brand: "Mercedes",
    model: "E200",
    year: 2022,
    color: "Beyaz",
    attributes: {},
    photoKeys: [],
    status: "ACTIVE",
    version: 0,
    createdAt: NOW,
  };
  async findActiveById(): Promise<VehicleRecord | null> {
    return this.vehicle;
  }
}

class FakeAvailRepo implements Partial<VehicleAvailabilityRepositoryPort> {
  existing: AvailabilityRecord[] = [];
  createdRows: CreateAvailabilityRow[] = [];

  async findOverlapping(
    _tx: TxClient,
    vehicleId: string,
    startAt: Date,
    endAt: Date,
  ): Promise<AvailabilityRecord[]> {
    // Half-open `[)` overlap mirrors the Prisma repo.
    return this.existing.filter(
      (e) =>
        e.vehicleId === vehicleId &&
        e.startAt.getTime() < endAt.getTime() &&
        e.endAt.getTime() > startAt.getTime(),
    );
  }

  async create(_tx: TxClient, input: CreateAvailabilityRow): Promise<AvailabilityRecord> {
    this.createdRows.push(input);
    const rec: AvailabilityRecord = {
      id: `av-${this.createdRows.length.toString()}`,
      vehicleId: input.vehicleId,
      driverProfileId: input.driverProfileId,
      startAt: input.startAt,
      endAt: input.endAt,
      type: input.type,
      bookingId: null,
      reason: input.reason ?? null,
      createdAt: NOW,
    };
    this.existing.push(rec);
    return rec;
  }
}

interface CapturedOutbox {
  events: OutboxEventInput[];
}
function buildOutbox(captured: CapturedOutbox): OutboxWriterPort {
  return {
    write(_tx: TxClient, event: OutboxEventInput) {
      captured.events.push(event);
      return Promise.resolve();
    },
  };
}

describe("BlockAvailabilityUseCase", () => {
  let profileRepo: FakeProfileRepo;
  let vehicleRepo: FakeVehicleRepo;
  let availRepo: FakeAvailRepo;
  let outbox: CapturedOutbox;
  let useCase: BlockAvailabilityUseCase;

  beforeEach(() => {
    profileRepo = new FakeProfileRepo();
    vehicleRepo = new FakeVehicleRepo();
    availRepo = new FakeAvailRepo();
    outbox = { events: [] };
    useCase = new BlockAvailabilityUseCase(
      vehicleRepo as unknown as VehicleRepositoryPort,
      availRepo as unknown as VehicleAvailabilityRepositoryPort,
      profileRepo as unknown as DriverProfileRepositoryPort,
      new FakeTxRunner(),
      buildOutbox(outbox),
      new FrozenClock(NOW),
    );
  });

  it("creates a BLOCKED row and emits AvailabilityBlocked on the happy path", async () => {
    const result = await useCase.execute(
      { vehicleId: VEHICLE_ID, startAt: TOMORROW_10, endAt: TOMORROW_12 },
      { userId: USER_ID },
    );
    expect(result.type).toBe("BLOCKED");
    expect(availRepo.createdRows).toHaveLength(1);
    expect(outbox.events).toHaveLength(1);
    expect(outbox.events[0]?.eventType).toBe("supply.AvailabilityBlocked");
  });

  it("rejects when endAt <= startAt", async () => {
    await expect(
      useCase.execute(
        { vehicleId: VEHICLE_ID, startAt: TOMORROW_12, endAt: TOMORROW_10 },
        { userId: USER_ID },
      ),
    ).rejects.toBeInstanceOf(InvalidAvailabilityRangeError);
  });

  it("rejects when the range starts in the past", async () => {
    await expect(
      useCase.execute(
        { vehicleId: VEHICLE_ID, startAt: YESTERDAY, endAt: TOMORROW_10 },
        { userId: USER_ID },
      ),
    ).rejects.toBeInstanceOf(PastDateError);
  });

  it("rejects when the vehicle is not ACTIVE", async () => {
    vehicleRepo.vehicle.status = "DRAFT";
    await expect(
      useCase.execute(
        { vehicleId: VEHICLE_ID, startAt: TOMORROW_10, endAt: TOMORROW_12 },
        { userId: USER_ID },
      ),
    ).rejects.toBeInstanceOf(VehicleNotActiveError);
  });

  it("rejects when the vehicle belongs to another driver", async () => {
    vehicleRepo.vehicle.driverProfileId = "someone-else";
    await expect(
      useCase.execute(
        { vehicleId: VEHICLE_ID, startAt: TOMORROW_10, endAt: TOMORROW_12 },
        { userId: USER_ID },
      ),
    ).rejects.toBeInstanceOf(VehicleNotFoundError);
  });

  it("detects a fully overlapping conflict", async () => {
    await useCase.execute(
      { vehicleId: VEHICLE_ID, startAt: TOMORROW_10, endAt: TOMORROW_12 },
      { userId: USER_ID },
    );
    await expect(
      useCase.execute(
        { vehicleId: VEHICLE_ID, startAt: TOMORROW_10, endAt: TOMORROW_12 },
        { userId: USER_ID },
      ),
    ).rejects.toBeInstanceOf(AvailabilityConflictError);
  });

  it("detects a partially overlapping conflict", async () => {
    await useCase.execute(
      { vehicleId: VEHICLE_ID, startAt: TOMORROW_10, endAt: TOMORROW_12 },
      { userId: USER_ID },
    );
    await expect(
      useCase.execute(
        { vehicleId: VEHICLE_ID, startAt: TOMORROW_11, endAt: TOMORROW_13 },
        { userId: USER_ID },
      ),
    ).rejects.toBeInstanceOf(AvailabilityConflictError);
  });

  it("allows adjacent ranges (half-open [start, end) interval)", async () => {
    await useCase.execute(
      { vehicleId: VEHICLE_ID, startAt: TOMORROW_10, endAt: TOMORROW_12 },
      { userId: USER_ID },
    );
    const result = await useCase.execute(
      { vehicleId: VEHICLE_ID, startAt: TOMORROW_12, endAt: TOMORROW_14 },
      { userId: USER_ID },
    );
    expect(result.type).toBe("BLOCKED");
    expect(availRepo.createdRows).toHaveLength(2);
  });
});
