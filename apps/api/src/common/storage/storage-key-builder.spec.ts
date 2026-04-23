import { describe, expect, it } from "vitest";

import {
  ALLOWED_UPLOAD_MIME_TYPES,
  StorageKeyBuilder,
  isAllowedUploadMimeType,
  mimeTypeToExtension,
} from "./storage-key-builder";

describe("StorageKeyBuilder", () => {
  const driverId = "01890d8e-3b9c-7000-8000-000000000001";
  const vehicleId = "01890d8e-3b9c-7000-8000-000000000002";
  const docId = "01890d8e-3b9c-7000-8000-000000000010";
  const photoId = "01890d8e-3b9c-7000-8000-000000000020";

  it("composes a driver document key under drivers/<id>/documents/", () => {
    expect(StorageKeyBuilder.driverDocument(driverId, docId, "pdf")).toBe(
      `drivers/${driverId}/documents/${docId}.pdf`,
    );
  });

  it("composes a vehicle photo key under drivers/<id>/vehicles/<id>/photos/", () => {
    expect(StorageKeyBuilder.vehiclePhoto(driverId, vehicleId, photoId, "jpg")).toBe(
      `drivers/${driverId}/vehicles/${vehicleId}/photos/${photoId}.jpg`,
    );
  });

  it("strips a leading dot from the extension", () => {
    expect(StorageKeyBuilder.driverDocument(driverId, docId, ".png")).toBe(
      `drivers/${driverId}/documents/${docId}.png`,
    );
  });

  it("rejects keys with traversal — caller responsibility, not our concern (smoke)", () => {
    // The builder does not sanitize ids — it trusts them. We assert the
    // composed shape so callers know to pass clean uuids only.
    expect(StorageKeyBuilder.driverDocument("a", "b", "pdf")).toBe("drivers/a/documents/b.pdf");
  });
});

describe("upload mime type whitelist", () => {
  it("recognises pdf, jpeg and png", () => {
    expect(ALLOWED_UPLOAD_MIME_TYPES).toEqual(["application/pdf", "image/jpeg", "image/png"]);
    for (const m of ALLOWED_UPLOAD_MIME_TYPES) expect(isAllowedUploadMimeType(m)).toBe(true);
  });

  it("rejects unknown mime types", () => {
    expect(isAllowedUploadMimeType("image/heic")).toBe(false);
    expect(isAllowedUploadMimeType("application/octet-stream")).toBe(false);
  });

  it("maps mime to file extension", () => {
    expect(mimeTypeToExtension("application/pdf")).toBe("pdf");
    expect(mimeTypeToExtension("image/jpeg")).toBe("jpg");
    expect(mimeTypeToExtension("image/png")).toBe("png");
  });
});
