export const SMS_SENDER_PORT = Symbol("SMS_SENDER_PORT");

export interface SmsSendInput {
  /** TR mobile in E.164 (+90 5XX XXXXXXX). Provider gets this clear-text. */
  phone: string;
  /** Rendered body — already past TemplateRenderer. */
  message: string;
  /** Notification id (or other correlation id) for adapter logging. */
  sourceId?: string;
}

export interface SmsSendResult {
  /** Provider message id — Netgsm returns one in the success response. */
  providerMessageId: string;
  sentAt: Date;
}

/**
 * SMS provider abstraction (ADR 0018, ADR 0021). Two adapters:
 *   - MockSmsSender — dev/test, in-memory inbox + masked log
 *   - NetgsmSmsSender — prod, XML POST to Netgsm REST
 *
 * Selection is env-driven by the factory in notifications.module.ts:
 *   `NETGSM_USERCODE` starting with `DUMMY_` → MockSmsSender.
 *
 * Replaces the former `identity.SmsSenderPort` (single-method
 * `send({to, body})`); identity now consumes this richer port.
 */
export interface SmsSenderPort {
  send(input: SmsSendInput): Promise<SmsSendResult>;
}
