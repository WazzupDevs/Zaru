import {
  DeleteObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  GetObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Inject, Injectable, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { CLOCK_PORT, type ClockPort } from "../clock/clock.port";

import type {
  ObjectMetadata,
  PresignedDownloadInput,
  PresignedDownloadResult,
  PresignedUploadInput,
  PresignedUploadResult,
  StoragePort,
} from "./storage.port";
import type { Env } from "../../config/env";

@Injectable()
export class S3Storage implements StoragePort, OnModuleDestroy {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicUrl: string;

  constructor(
    config: ConfigService<Env, true>,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
  ) {
    this.bucket = config.get("STORAGE_BUCKET", { infer: true });
    this.publicUrl = stripTrailingSlash(config.get("STORAGE_PUBLIC_URL", { infer: true }));

    this.client = new S3Client({
      endpoint: config.get("STORAGE_ENDPOINT", { infer: true }),
      region: config.get("STORAGE_REGION", { infer: true }),
      credentials: {
        accessKeyId: config.get("STORAGE_ACCESS_KEY_ID", { infer: true }),
        secretAccessKey: config.get("STORAGE_SECRET_ACCESS_KEY", { infer: true }),
      },
      // MinIO requires path-style addressing; R2 accepts both.
      forcePathStyle: config.get("STORAGE_FORCE_PATH_STYLE", { infer: true }),
    });
  }

  async createPresignedUploadUrl(input: PresignedUploadInput): Promise<PresignedUploadResult> {
    // ContentLength signed into the URL — client cannot upload more bytes
    // than maxSizeBytes; S3 rejects with 400 if Content-Length doesn't match.
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: input.key,
      ContentType: input.contentType,
      ContentLength: input.maxSizeBytes,
    });
    const uploadUrl = await getSignedUrl(this.client, command, {
      expiresIn: input.expiresInSeconds,
    });
    const expiresAt = new Date(this.clock.nowMs() + input.expiresInSeconds * 1000);
    return {
      uploadUrl,
      publicUrl: `${this.publicUrl}/${input.key}`,
      expiresAt,
      maxSizeBytes: input.maxSizeBytes,
    };
  }

  async createPresignedDownloadUrl(
    input: PresignedDownloadInput,
  ): Promise<PresignedDownloadResult> {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: input.key });
    const downloadUrl = await getSignedUrl(this.client, command, {
      expiresIn: input.expiresInSeconds,
    });
    const expiresAt = new Date(this.clock.nowMs() + input.expiresInSeconds * 1000);
    return { downloadUrl, expiresAt };
  }

  async getObjectMetadata(key: string): Promise<ObjectMetadata | null> {
    try {
      const head = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return {
        size: head.ContentLength ?? 0,
        contentType: head.ContentType ?? "application/octet-stream",
        lastModified: head.LastModified ?? new Date(0),
      };
    } catch (err) {
      if (isNotFound(err)) return null;
      throw err;
    }
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      return true;
    } catch {
      return false;
    }
  }

  onModuleDestroy(): void {
    this.client.destroy();
  }
}

function stripTrailingSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

function isNotFound(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
  return e.name === "NotFound" || e.$metadata?.httpStatusCode === 404;
}
