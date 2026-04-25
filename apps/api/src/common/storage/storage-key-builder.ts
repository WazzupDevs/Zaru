/**
 * Canonical object-key layout. Centralized so future cleanup / migration /
 * access-control work has a single shape to grep against. Driver subtree
 * groups every artifact (documents + vehicle photos) under one driver id —
 * makes "delete everything for driver X" a single prefix-delete.
 */
export const StorageKeyBuilder = {
  driverDocument(driverProfileId: string, documentId: string, ext: string): string {
    return `drivers/${driverProfileId}/documents/${documentId}.${stripDot(ext)}`;
  },
  vehiclePhoto(driverProfileId: string, vehicleId: string, photoId: string, ext: string): string {
    return `drivers/${driverProfileId}/vehicles/${vehicleId}/photos/${photoId}.${stripDot(ext)}`;
  },
} as const;

function stripDot(ext: string): string {
  return ext.startsWith(".") ? ext.slice(1) : ext;
}

/** Whitelist of upload mime types → file extension. */
export const ALLOWED_UPLOAD_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png"] as const;
export type AllowedUploadMimeType = (typeof ALLOWED_UPLOAD_MIME_TYPES)[number];

const MIME_TO_EXT: Record<AllowedUploadMimeType, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
};

export function isAllowedUploadMimeType(mime: string): mime is AllowedUploadMimeType {
  return (ALLOWED_UPLOAD_MIME_TYPES as readonly string[]).includes(mime);
}

export function mimeTypeToExtension(mime: AllowedUploadMimeType): string {
  return MIME_TO_EXT[mime];
}
