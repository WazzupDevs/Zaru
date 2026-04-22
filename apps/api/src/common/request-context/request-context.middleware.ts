import { Injectable, NestMiddleware } from "@nestjs/common";
import { NextFunction, Request, Response } from "express";

import { RequestContextService } from "./request-context.service";

/**
 * Wraps each request in an AsyncLocalStorage scope keyed by the
 * pino-generated request id (set on `req.id`).
 */
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  constructor(private readonly ctx: RequestContextService) {}

  use(req: Request, _res: Response, next: NextFunction): void {
    const requestId = (req as Request & { id: string }).id;
    this.ctx.run({ requestId }, () => {
      next();
    });
  }
}
