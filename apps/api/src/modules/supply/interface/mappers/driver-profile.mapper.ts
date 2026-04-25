import type {
  DocumentResponse,
  DriverProfileResponse,
  VehicleResponse,
} from "@event-fleet/shared-types";

import type { DocumentRecord } from "../../application/ports/document.repository.port";
import type { DriverProfileRecord } from "../../application/ports/driver-profile.repository.port";
import type { VehicleRecord } from "../../application/ports/vehicle.repository.port";

/** PII never crosses this boundary. Hashes/plaintext stay server-side only. */
export function toDriverProfileResponse(rec: DriverProfileRecord): DriverProfileResponse {
  return {
    id: rec.id,
    userId: rec.userId,
    firstName: rec.firstName,
    lastName: rec.lastName,
    ibanLast4: rec.ibanLast4,
    status: rec.status,
    rejectionReason: rec.rejectionReason,
    approvedAt: rec.approvedAt ? rec.approvedAt.toISOString() : null,
    commissionRate: rec.commissionRate,
    createdAt: rec.createdAt.toISOString(),
  };
}

export function toVehicleResponse(rec: VehicleRecord): VehicleResponse {
  return {
    id: rec.id,
    driverProfileId: rec.driverProfileId,
    vehicleTypeId: rec.vehicleTypeId,
    plateNumber: rec.plateNumber,
    brand: rec.brand,
    model: rec.model,
    year: rec.year,
    color: rec.color,
    attributes: rec.attributes,
    photoKeys: rec.photoKeys,
    status: rec.status,
    version: rec.version,
    createdAt: rec.createdAt.toISOString(),
  };
}

export function toDocumentResponse(rec: DocumentRecord): DocumentResponse {
  return {
    id: rec.id,
    driverProfileId: rec.driverProfileId,
    vehicleId: rec.vehicleId,
    type: rec.type,
    fileName: rec.fileName,
    fileSize: rec.fileSize,
    mimeType: rec.mimeType,
    status: rec.status,
    rejectionReason: rec.rejectionReason,
    issuedAt: rec.issuedAt ? rec.issuedAt.toISOString().slice(0, 10) : null,
    expiresAt: rec.expiresAt ? rec.expiresAt.toISOString().slice(0, 10) : null,
    reviewedAt: rec.reviewedAt ? rec.reviewedAt.toISOString() : null,
    createdAt: rec.createdAt.toISOString(),
  };
}
