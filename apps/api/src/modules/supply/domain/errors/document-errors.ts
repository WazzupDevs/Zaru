import { DomainError } from "../../../../common/errors/domain-error";

export class DocumentNotFoundError extends DomainError {
  readonly code = "SUPPLY_DOCUMENT_NOT_FOUND";
  readonly httpStatus = 404;
  constructor() {
    super("Document not found.");
  }
}

export class FileTooLargeError extends DomainError {
  readonly code = "SUPPLY_FILE_TOO_LARGE";
  readonly httpStatus = 400;
  constructor(maxBytes: number, actualBytes: number) {
    super(`File exceeds the ${String(maxBytes)} byte limit (was ${String(actualBytes)}).`, {
      maxBytes,
      actualBytes,
    });
  }
}

export class UnsupportedFileTypeError extends DomainError {
  readonly code = "SUPPLY_UNSUPPORTED_FILE_TYPE";
  readonly httpStatus = 400;
  constructor(mimeType: string) {
    super(`File type ${mimeType} is not supported.`, { mimeType });
  }
}

export class UploadNotCompletedError extends DomainError {
  readonly code = "SUPPLY_UPLOAD_NOT_COMPLETED";
  readonly httpStatus = 409;
  constructor() {
    super("The upload was not completed — object was not found in storage.");
  }
}

export class UploadSizeMismatchError extends DomainError {
  readonly code = "SUPPLY_UPLOAD_SIZE_MISMATCH";
  readonly httpStatus = 409;
  constructor(expected: number, actual: number) {
    super(`Uploaded size ${String(actual)} did not match the expected ${String(expected)} bytes.`, {
      expected,
      actual,
    });
  }
}

export class DocumentAlreadyReviewedError extends DomainError {
  readonly code = "SUPPLY_DOCUMENT_ALREADY_REVIEWED";
  readonly httpStatus = 409;
  constructor() {
    super("Document has already been reviewed.");
  }
}
