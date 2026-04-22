import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { Request } from "express";
import { InjectPinoLogger, PinoLogger } from "nestjs-pino";
import { Observable } from "rxjs";

import { RequestContextService } from "../request-context/request-context.service";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const HEADER = "idempotency-key";

/**
 * Idempotency-Key skeleton.
 *
 * Captures the `Idempotency-Key` header on mutating requests and stashes
 * it in RequestContext so downstream handlers/audit logs can reference it.
 *
 * TODO(A2b): wire to Redis (24h TTL) + persistent Postgres dedup table
 * (`idempotency_keys` with id + method + path + request_hash + response_snapshot).
 * Until then this is observability only — no actual dedup happens.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    @InjectPinoLogger(IdempotencyInterceptor.name)
    private readonly logger: PinoLogger,
    private readonly ctx: RequestContextService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    const method = req.method.toUpperCase();

    if (!MUTATING_METHODS.has(method)) {
      return next.handle();
    }

    const key = req.header(HEADER);
    if (typeof key === "string" && key.length > 0) {
      this.ctx.setIdempotencyKey(key);
      this.logger.debug({ method, path: req.url, key }, "idempotency key captured");
    } else {
      this.logger.debug(
        { method, path: req.url },
        "idempotency key not provided, proceeding without dedup",
      );
    }

    return next.handle();
  }
}
