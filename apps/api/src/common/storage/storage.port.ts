export const STORAGE_PORT = Symbol("STORAGE_PORT");

export interface PresignedUploadInput {
  /** Object key (e.g. "drivers/<id>/documents/<doc>.pdf"). */
  key: string;
  /** Required content type — signed into the URL. */
  contentType: string;
  /**
   * Hard upper bound. The PUT presign signs Content-Length so a client cannot
   * upload a larger file by lying — S3 rejects with 400. Echoed back to the
   * client so it can pre-flight reject before issuing the upload.
   */
  maxSizeBytes: number;
  expiresInSeconds: number;
}

export interface PresignedUploadResult {
  uploadUrl: string;
  publicUrl: string;
  expiresAt: Date;
  maxSizeBytes: number;
}

export interface PresignedDownloadInput {
  key: string;
  expiresInSeconds: number;
}

export interface PresignedDownloadResult {
  downloadUrl: string;
  expiresAt: Date;
}

export interface ObjectMetadata {
  size: number;
  contentType: string;
  lastModified: Date;
}

/**
 * S3-compatible object storage. Dev = MinIO (docker compose), prod = R2.
 * Same SDK, only endpoint + credentials change. ADR 0013.
 */
export interface StoragePort {
  createPresignedUploadUrl(input: PresignedUploadInput): Promise<PresignedUploadResult>;
  createPresignedDownloadUrl(input: PresignedDownloadInput): Promise<PresignedDownloadResult>;
  getObjectMetadata(key: string): Promise<ObjectMetadata | null>;
  deleteObject(key: string): Promise<void>;
  /** Fast bucket-reachability check for /readyz. */
  healthCheck(): Promise<boolean>;
  /**
   * Idempotent bucket bootstrap. No-op if the bucket already exists.
   * Used by `StorageBootstrapService` on app startup in dev/test so a fresh
   * `pnpm db:nuke && pnpm db:up` doesn't require a manual `mc mb` step.
   * Production skips this — buckets are pre-provisioned by DevOps.
   */
  ensureBucket(): Promise<void>;
}
