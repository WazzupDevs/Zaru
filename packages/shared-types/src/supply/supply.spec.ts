import { describe, expect, it } from "vitest";

import {
  CreateDriverProfileInputSchema,
  RegisterVehicleInputSchema,
  RequestDocumentUploadInputSchema,
  ReviewDocumentInputSchema,
} from "./index.js";

describe("CreateDriverProfileInputSchema", () => {
  const VALID = {
    firstName: "Ahmet",
    lastName: "Yılmaz",
    nationalId: "10000000146",
    birthDate: "1990-06-15",
    iban: "TR330006100519786457841326",
  };

  it("accepts a valid payload", () => {
    expect(CreateDriverProfileInputSchema.parse(VALID)).toEqual(VALID);
  });

  it("rejects non-11-digit nationalId", () => {
    const r = CreateDriverProfileInputSchema.safeParse({ ...VALID, nationalId: "1234567890" });
    expect(r.success).toBe(false);
  });

  it("rejects non-TR IBAN", () => {
    const r = CreateDriverProfileInputSchema.safeParse({
      ...VALID,
      iban: "DE89370400440532013000",
    });
    expect(r.success).toBe(false);
  });

  it("rejects malformed birthDate", () => {
    expect(
      CreateDriverProfileInputSchema.safeParse({ ...VALID, birthDate: "15/06/1990" }).success,
    ).toBe(false);
  });
});

describe("RegisterVehicleInputSchema", () => {
  const VALID = {
    vehicleTypeId: "01890d8e-3b9c-7000-8000-000000000001",
    plateNumber: "34 ABC 1234",
    brand: "Mercedes",
    model: "E200",
    year: 2022,
    color: "Beyaz",
    attributes: { trim_color: "white", has_air_conditioning: true },
  };

  it("accepts a valid payload", () => {
    expect(RegisterVehicleInputSchema.parse(VALID)).toMatchObject({
      brand: "Mercedes",
    });
  });

  it("rejects year below 1980", () => {
    expect(RegisterVehicleInputSchema.safeParse({ ...VALID, year: 1979 }).success).toBe(false);
  });

  it("rejects empty brand", () => {
    expect(RegisterVehicleInputSchema.safeParse({ ...VALID, brand: "" }).success).toBe(false);
  });
});

describe("RequestDocumentUploadInputSchema", () => {
  const VALID = {
    type: "DRIVER_LICENSE" as const,
    fileName: "license.pdf",
    fileSize: 234_567,
    mimeType: "application/pdf" as const,
  };

  it("accepts a valid payload", () => {
    expect(RequestDocumentUploadInputSchema.parse(VALID)).toEqual(VALID);
  });

  it("rejects unknown mime type", () => {
    expect(
      RequestDocumentUploadInputSchema.safeParse({ ...VALID, mimeType: "image/heic" }).success,
    ).toBe(false);
  });

  it("rejects zero / negative file size", () => {
    expect(RequestDocumentUploadInputSchema.safeParse({ ...VALID, fileSize: 0 }).success).toBe(
      false,
    );
  });
});

describe("ReviewDocumentInputSchema", () => {
  it("APPROVE without reason is OK", () => {
    expect(ReviewDocumentInputSchema.parse({ decision: "APPROVE" })).toEqual({
      decision: "APPROVE",
    });
  });

  it("REJECT requires rejectionReason", () => {
    expect(ReviewDocumentInputSchema.safeParse({ decision: "REJECT" }).success).toBe(false);
  });

  it("REJECT with reason is OK", () => {
    expect(
      ReviewDocumentInputSchema.parse({
        decision: "REJECT",
        rejectionReason: "Belge bulanık",
      }),
    ).toMatchObject({ decision: "REJECT" });
  });
});
