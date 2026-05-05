import { DomainError } from "../../../../common/errors/domain-error";

export class UnknownTemplateError extends DomainError {
  readonly code = "NOTIFICATION_UNKNOWN_TEMPLATE";
  readonly httpStatus = 500;
  constructor(templateKey: string, locale: string) {
    super(`Template not found: ${locale}/${templateKey}`, { templateKey, locale });
  }
}

export class TemplateVariableMissingError extends DomainError {
  readonly code = "NOTIFICATION_TEMPLATE_VARIABLE_MISSING";
  readonly httpStatus = 500;
  constructor(templateKey: string, variable: string) {
    super(`Template ${templateKey} requires variable {{${variable}}} which was not provided.`, {
      templateKey,
      variable,
    });
  }
}

export class NotificationSendFailedError extends DomainError {
  readonly code = "NOTIFICATION_SEND_FAILED";
  readonly httpStatus = 502;
  constructor(reason: string) {
    super(`SMS provider call failed: ${reason}`, { reason });
  }
}

export class NotificationNotFoundError extends DomainError {
  readonly code = "NOTIFICATION_NOT_FOUND";
  readonly httpStatus = 404;
  constructor() {
    super("Notification not found.");
  }
}

export class InvalidRecipientError extends DomainError {
  readonly code = "NOTIFICATION_INVALID_RECIPIENT";
  readonly httpStatus = 400;
  constructor(reason: string) {
    super(`Invalid notification recipient: ${reason}`, { reason });
  }
}
