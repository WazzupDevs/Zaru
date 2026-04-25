import type { DocumentType } from "@event-fleet/shared-types";

import { DomainError } from "../../../../common/errors/domain-error";

export class IncompleteDocumentsError extends DomainError {
  readonly code = "SUPPLY_INCOMPLETE_DOCUMENTS";
  readonly httpStatus = 400;

  constructor(missingTypes: DocumentType[]) {
    super(`Missing required documents: ${missingTypes.join(", ")}.`, { missingTypes });
  }
}
