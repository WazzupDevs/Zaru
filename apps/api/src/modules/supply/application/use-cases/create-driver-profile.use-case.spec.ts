import { type ConfigService } from "@nestjs/config";
import { beforeEach, describe, expect, it } from "vitest";

import { CreateDriverProfileUseCase } from "./create-driver-profile.use-case";
import { FrozenClock } from "../../../../../test/fakes/frozen-clock";
import { PiiHasher } from "../../../../common/security/pii-hasher";
import { DriverProfileAlreadyExistsError } from "../../domain/errors/driver-profile-already-exists.error";
import { DriverUnderageError } from "../../domain/errors/driver-underage.error";
import { InvalidIbanError } from "../../domain/errors/invalid-iban.error";
import { InvalidNationalIdError } from "../../domain/errors/invalid-national-id.error";
import { NationalIdAlreadyRegisteredError } from "../../domain/errors/national-id-already-registered.error";

import type {
  OutboxEventInput,
  OutboxWriterPort,
} from "../../../../common/persistence/outbox-writer.port";
import type { TxClient } from "../../../../common/persistence/tx-client";
import type { TxRunnerPort } from "../../../../common/persistence/tx-runner.port";
import type { Env } from "../../../../config/env";
import type {
  CreateDriverProfileRow,
  DriverProfileRecord,
  DriverProfileRepositoryPort,
} from "../ports/driver-profile.repository.port";

const NOW = new Date("2026-04-24T08:00:00.000Z");
const VALID_TCKN = "10000000146";
const VALID_IBAN = "TR330006100519786457841326";

class FakeTxRunner implements TxRunnerPort {
  async run<T>(fn: (tx: TxClient) => Promise<T>): Promise<T> {
    return fn({} as TxClient);
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

class FakeRepo implements DriverProfileRepositoryPort {
  byUserId = new Map<string, DriverProfileRecord>();
  byNationalIdHash = new Map<string, DriverProfileRecord>();
  byId = new Map<string, DriverProfileRecord>();
  createdRows: CreateDriverProfileRow[] = [];

  async create(_tx: TxClient, input: CreateDriverProfileRow): Promise<DriverProfileRecord> {
    this.createdRows.push(input);
    const rec: DriverProfileRecord = {
      id: `dp-${this.createdRows.length.toString()}`,
      userId: input.userId,
      firstName: input.firstName,
      lastName: input.lastName,
      nationalIdHash: input.nationalIdHash,
      birthDate: input.birthDate,
      ibanHash: input.ibanHash,
      ibanLast4: input.ibanLast4,
      status: "DRAFT",
      rejectionReason: null,
      approvedAt: null,
      approvedByUserId: null,
      commissionRate: "0.1500",
      version: 0,
      createdAt: NOW,
    };
    this.byUserId.set(input.userId, rec);
    this.byNationalIdHash.set(input.nationalIdHash, rec);
    this.byId.set(rec.id, rec);
    return rec;
  }
  async findActiveByUserId(_tx: TxClient, userId: string) {
    return this.byUserId.get(userId) ?? null;
  }
  async findActiveById(_tx: TxClient, id: string) {
    return this.byId.get(id) ?? null;
  }
  async findByNationalIdHash(_tx: TxClient, hash: string) {
    return this.byNationalIdHash.get(hash) ?? null;
  }
  async updateBasics() {
    /* noop */
  }
  async setStatus() {
    /* noop */
  }
  async listPending() {
    return { items: [], nextCursor: null };
  }
}

function buildHasher(): PiiHasher {
  const config = {
    get: (key: string) => (key === "PII_HMAC_SECRET" ? "0".repeat(64) : undefined),
  } as unknown as ConfigService<Env, true>;
  return new PiiHasher(config);
}

describe("CreateDriverProfileUseCase", () => {
  let repo: FakeRepo;
  let outbox: CapturedOutbox;
  let useCase: CreateDriverProfileUseCase;

  beforeEach(() => {
    repo = new FakeRepo();
    outbox = { events: [] };
    useCase = new CreateDriverProfileUseCase(
      repo,
      new FakeTxRunner(),
      buildOutbox(outbox),
      new FrozenClock(NOW),
      buildHasher(),
    );
  });

  it("creates a DRAFT profile and emits DriverProfileCreated", async () => {
    const result = await useCase.execute(
      {
        firstName: "Ahmet",
        lastName: "Yılmaz",
        nationalId: VALID_TCKN,
        birthDate: new Date("1990-06-15T00:00:00Z"),
        iban: VALID_IBAN,
      },
      { userId: "u-1" },
    );
    expect(result.status).toBe("DRAFT");
    expect(result.firstName).toBe("Ahmet");
    expect(result.ibanLast4).toBe("1326");
    expect(repo.createdRows).toHaveLength(1);
    expect(repo.createdRows[0]?.nationalIdHash).toMatch(/^[0-9a-f]{64}$/);
    expect(repo.createdRows[0]?.ibanHash).toMatch(/^\$argon2id\$/);
    expect(outbox.events).toHaveLength(1);
    expect(outbox.events[0]?.eventType).toBe("supply.DriverProfileCreated");
    // PII never appears in the event payload.
    const payloadJson = JSON.stringify(outbox.events[0]?.payload);
    expect(payloadJson).not.toContain(VALID_TCKN);
    expect(payloadJson).not.toContain(VALID_IBAN);
  });

  it("rejects when the user already has a profile", async () => {
    await useCase.execute(
      {
        firstName: "Ahmet",
        lastName: "Yılmaz",
        nationalId: VALID_TCKN,
        birthDate: new Date("1990-06-15T00:00:00Z"),
        iban: VALID_IBAN,
      },
      { userId: "u-1" },
    );
    await expect(
      useCase.execute(
        {
          firstName: "Ahmet",
          lastName: "Yılmaz",
          nationalId: "11111111110",
          birthDate: new Date("1990-06-15T00:00:00Z"),
          iban: VALID_IBAN,
        },
        { userId: "u-1" },
      ),
    ).rejects.toBeInstanceOf(DriverProfileAlreadyExistsError);
  });

  it("rejects when the same TCKN is already registered for another user", async () => {
    await useCase.execute(
      {
        firstName: "A",
        lastName: "Y",
        nationalId: VALID_TCKN,
        birthDate: new Date("1990-06-15T00:00:00Z"),
        iban: VALID_IBAN,
      },
      { userId: "u-1" },
    );
    await expect(
      useCase.execute(
        {
          firstName: "B",
          lastName: "Z",
          nationalId: VALID_TCKN,
          birthDate: new Date("1990-06-15T00:00:00Z"),
          iban: VALID_IBAN,
        },
        { userId: "u-2" },
      ),
    ).rejects.toBeInstanceOf(NationalIdAlreadyRegisteredError);
  });

  it("rejects underage (< 18) drivers", async () => {
    await expect(
      useCase.execute(
        {
          firstName: "Ç",
          lastName: "K",
          nationalId: VALID_TCKN,
          birthDate: new Date("2010-01-01T00:00:00Z"),
          iban: VALID_IBAN,
        },
        { userId: "u-3" },
      ),
    ).rejects.toBeInstanceOf(DriverUnderageError);
  });

  it("rejects invalid TCKN before touching the repo", async () => {
    await expect(
      useCase.execute(
        {
          firstName: "X",
          lastName: "Y",
          nationalId: "12345678901",
          birthDate: new Date("1990-06-15T00:00:00Z"),
          iban: VALID_IBAN,
        },
        { userId: "u-4" },
      ),
    ).rejects.toBeInstanceOf(InvalidNationalIdError);
    expect(repo.createdRows).toHaveLength(0);
  });

  it("rejects invalid IBAN before touching the repo", async () => {
    await expect(
      useCase.execute(
        {
          firstName: "X",
          lastName: "Y",
          nationalId: VALID_TCKN,
          birthDate: new Date("1990-06-15T00:00:00Z"),
          iban: "DE89370400440532013000",
        },
        { userId: "u-5" },
      ),
    ).rejects.toBeInstanceOf(InvalidIbanError);
    expect(repo.createdRows).toHaveLength(0);
  });
});
