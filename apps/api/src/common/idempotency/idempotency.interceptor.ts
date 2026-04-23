import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { Request } from "express";
import { InjectPinoLogger, PinoLogger } from "nestjs-pino";
import { Observable, catchError, concatMap, from, mergeMap, of, throwError } from "rxjs";

import { computeRequestHash } from "./request-hash";
import { ConflictError } from "../errors/domain-error";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";
import { RequestContextService } from "../request-context/request-context.service";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH"]);
const HEADER = "idempotency-key";
const LOCK_TTL_SECONDS = 30;
const RECORD_TTL_DAYS = 7;

/**
 * Idempotency interceptor: opt-in per endpoint via @UseInterceptors(IdempotencyInterceptor).
 *
 * Behaviour:
 *   - Skip non-mutating methods.
 *   - Skip when no Idempotency-Key header is provided.
 *   - On replay (same key + same body hash) → return cached response body.
 *   - On collision (same key + different body) → 409 Conflict.
 *   - On concurrent in-flight (Redis SETNX lock) → 409 Conflict.
 *   - On success → persist response in Postgres for RECORD_TTL_DAYS.
 *   - On error → don't persist (so retries can succeed).
 *
 * NOTE: status code preservation is left to the endpoint's @HttpCode decorator;
 * replay uses the SAME endpoint, hence the SAME @HttpCode value applies.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    @InjectPinoLogger(IdempotencyInterceptor.name)
    private readonly logger: PinoLogger,
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
    private readonly ctx: RequestContextService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    const method = req.method.toUpperCase();

    if (!MUTATING_METHODS.has(method)) {
      return next.handle();
    }

    const key = req.header(HEADER);
    if (!key || key.length === 0) {
      this.logger.debug({ method, path: req.url }, "no idempotency key, proceeding without dedup");
      return next.handle();
    }

    this.ctx.setIdempotencyKey(key);
    const requestHash = computeRequestHash(method, req.url, req.body);

    // Flatten Promise<Observable<unknown>> → Observable<unknown> so the inner
    // observable's persist + release pipeline actually runs.
    return from(this.handleWithIdempotency(key, requestHash, next)).pipe(
      mergeMap((inner) => inner),
    );
  }

  private async handleWithIdempotency(
    key: string,
    requestHash: string,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    // 1) Look for an existing record before locking — replay path is read-only.
    const existing = await this.prisma.client.idempotencyRecord.findUnique({
      where: { key },
    });
    if (existing && existing.expiresAt > new Date()) {
      if (existing.requestHash === requestHash) {
        this.logger.info({ key }, "idempotency key replayed");
        return of(existing.responseBody as unknown);
      }
      this.logger.warn(
        { key, expectedHash: existing.requestHash, gotHash: requestHash },
        "idempotency key reused with different payload",
      );
      throw new ConflictError("Idempotency-Key reused with different payload", { key });
    }

    // 2) Acquire short-lived Redis lock for in-flight dedup.
    const lockKey = `idem:lock:${key}`;
    const acquired = await this.redis.client.set(lockKey, "1", "EX", LOCK_TTL_SECONDS, "NX");
    if (!acquired) {
      this.logger.warn({ key }, "concurrent request with same idempotency key");
      throw new ConflictError("Concurrent request with same Idempotency-Key", { key });
    }

    // 3) Run handler; persist response AND release lock BEFORE returning so
    //    a follow-up request sees the record and an unlocked key.
    return next.handle().pipe(
      concatMap(async (body: unknown) => {
        await this.persistRecord(key, requestHash, body);
        await this.releaseLock(lockKey);
        return body;
      }),
      catchError((err: unknown) =>
        from(this.releaseLock(lockKey)).pipe(concatMap(() => throwError(() => err))),
      ),
    );
  }

  private async persistRecord(key: string, requestHash: string, body: unknown): Promise<void> {
    const expiresAt = new Date(Date.now() + RECORD_TTL_DAYS * 24 * 60 * 60 * 1000);
    await this.prisma.client.idempotencyRecord.create({
      data: {
        key,
        requestHash,
        responseCode: 200,
        responseBody: body ?? Prisma.JsonNull,
        expiresAt,
      },
    });
  }

  private async releaseLock(lockKey: string): Promise<void> {
    try {
      await this.redis.client.del(lockKey);
    } catch (err) {
      this.logger.error({ err, lockKey }, "failed to release idempotency lock");
    }
  }
}
