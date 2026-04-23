import { DomainError } from "../../../../common/errors/domain-error";

import type { ZodIssue } from "zod";

export class InvalidAttributesError extends DomainError {
  readonly code = "SUPPLY_INVALID_ATTRIBUTES";
  readonly httpStatus = 400;

  constructor(issues: ZodIssue[]) {
    super("Vehicle attributes failed validation against the category definition.", {
      issues: issues.map((i) => ({ path: i.path, message: i.message, code: i.code })),
    });
  }
}
