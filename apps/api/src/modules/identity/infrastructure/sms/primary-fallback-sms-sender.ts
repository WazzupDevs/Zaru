import { InjectPinoLogger, PinoLogger } from "nestjs-pino";

import type { SmsMessage, SmsSenderPort } from "../../application/ports/sms-sender.port";

/**
 * Decorator wrapper: try `primary`; on failure, log and fall back to
 * `secondary`. Used in production to chain Netgsm → İleti Merkezi.
 *
 * Not currently registered in IdentityModule — A3 will pick it up once
 * NetgsmSmsSender is real and the İleti Merkezi adapter exists. Lives here
 * already so use cases never need to know there's a fallback.
 */
export class PrimaryFallbackSmsSender implements SmsSenderPort {
  constructor(
    private readonly primary: SmsSenderPort,
    private readonly secondary: SmsSenderPort,
    private readonly logger: PinoLogger,
  ) {}

  static inject(
    primary: SmsSenderPort,
    secondary: SmsSenderPort,
    @InjectPinoLogger(PrimaryFallbackSmsSender.name) logger: PinoLogger,
  ): PrimaryFallbackSmsSender {
    return new PrimaryFallbackSmsSender(primary, secondary, logger);
  }

  async send(message: SmsMessage): Promise<void> {
    try {
      await this.primary.send(message);
    } catch (err) {
      this.logger.warn(
        { to: message.to, err },
        "Primary SMS sender failed, falling back to secondary",
      );
      await this.secondary.send(message);
    }
  }
}
