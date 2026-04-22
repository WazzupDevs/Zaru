import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Request, Response } from "express";
import { InjectPinoLogger, PinoLogger } from "nestjs-pino";

import { DomainError } from "../errors/domain-error";
import { RequestContextService } from "../request-context/request-context.service";

import type { Env } from "../../config/env";

interface ErrorResponseBody {
  code: string;
  message: string;
  requestId: string | undefined;
  details?: Record<string, unknown>;
}

/**
 * Global exception filter. Maps:
 *  - DomainError → { code, message, details?, requestId }
 *  - HttpException → preserve status, normalize body
 *  - Unknown Error → 500 INTERNAL_ERROR (message hidden in production)
 */
@Catch()
export class DomainExceptionFilter implements ExceptionFilter {
  constructor(
    @InjectPinoLogger(DomainExceptionFilter.name)
    private readonly logger: PinoLogger,
    private readonly ctx: RequestContextService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const httpHost = host.switchToHttp();
    const res = httpHost.getResponse<Response>();
    const req = httpHost.getRequest<Request>();
    const requestId = this.ctx.getRequestId();
    const isDev = this.config.get("NODE_ENV", { infer: true }) !== "production";

    if (exception instanceof DomainError) {
      const body: ErrorResponseBody = {
        code: exception.code,
        message: exception.message,
        requestId,
        ...(exception.details ? { details: exception.details } : {}),
      };
      this.logger.warn(
        { err: exception, code: exception.code, path: req.url, method: req.method },
        "DomainError",
      );
      res.status(exception.httpStatus).json(body);
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const raw = exception.getResponse();
      const message =
        typeof raw === "string"
          ? raw
          : ((raw as { message?: string }).message ?? exception.message);
      const body: ErrorResponseBody = {
        code: this.codeFromStatus(status),
        message,
        requestId,
      };
      this.logger.warn(
        { err: exception, status, path: req.url, method: req.method },
        "HttpException",
      );
      res.status(status).json(body);
      return;
    }

    const err = exception instanceof Error ? exception : new Error(String(exception));
    this.logger.error({ err, path: req.url, method: req.method }, "Unhandled exception");
    const body: ErrorResponseBody = {
      code: "INTERNAL_ERROR",
      message: isDev ? err.message : "Internal server error",
      requestId,
    };
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json(body);
  }

  private codeFromStatus(status: number): string {
    switch (status) {
      case 400:
        return "BAD_REQUEST";
      case 401:
        return "UNAUTHORIZED";
      case 403:
        return "FORBIDDEN";
      case 404:
        return "NOT_FOUND";
      case 409:
        return "CONFLICT";
      case 422:
        return "UNPROCESSABLE_ENTITY";
      case 429:
        return "TOO_MANY_REQUESTS";
      default:
        return status >= 500 ? "INTERNAL_ERROR" : "HTTP_ERROR";
    }
  }
}
