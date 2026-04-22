import { Injectable, PipeTransform } from "@nestjs/common";
import { ZodSchema } from "zod";

import { ValidationError } from "../errors/domain-error";

/**
 * Per-endpoint Zod validation pipe.
 * Usage: `@Body(new ZodValidationPipe(MyDto)) body: MyDtoType`
 */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new ValidationError("Request body failed schema validation", {
        issues: result.error.issues.map((i) => ({
          path: i.path,
          message: i.message,
          code: i.code,
        })),
      });
    }
    return result.data;
  }
}
