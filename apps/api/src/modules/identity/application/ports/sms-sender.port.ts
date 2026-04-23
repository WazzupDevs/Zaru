export const SMS_SENDER_PORT = Symbol("SMS_SENDER_PORT");

export interface SmsMessage {
  to: string;
  body: string;
}

export interface SmsSenderPort {
  send(message: SmsMessage): Promise<void>;
}
