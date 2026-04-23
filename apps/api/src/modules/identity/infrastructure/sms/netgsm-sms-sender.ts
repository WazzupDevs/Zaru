import { Injectable } from "@nestjs/common";
import { InjectPinoLogger, PinoLogger } from "nestjs-pino";

import type { SmsMessage, SmsSenderPort } from "../../application/ports/sms-sender.port";

/**
 * Production Netgsm SMS adapter — skeleton.
 *
 * The real implementation (A3 scope) needs:
 *   - HTTP client (axios or undici) with timeouts and retries
 *   - Netgsm "/get/json" v2 request envelope (usercode, password, header, msg, gsmno)
 *   - Response code → DomainError mapping (00=ok, 20=missing, 30=auth-fail, …)
 *   - Circuit breaker (opossum) with half-open probes
 *   - İleti Merkezi as a fallback adapter wired through PrimaryFallbackSmsSender
 *   - Per-tenant sender header (`Event Fleet`) + cost telemetry
 *
 * Until then this throws — the SMS_DRIVER env defaults to "mock", so the
 * factory in IdentityModule never picks this class outside an explicit
 * SMS_DRIVER=netgsm (intentional gate).
 */
@Injectable()
export class NetgsmSmsSender implements SmsSenderPort {
  constructor(
    @InjectPinoLogger(NetgsmSmsSender.name)
    private readonly logger: PinoLogger,
  ) {}

  send(message: SmsMessage): Promise<void> {
    this.logger.error(
      { to: message.to },
      "NetgsmSmsSender.send invoked but real Netgsm integration is not wired (A3 scope).",
    );
    throw new Error("NetgsmSmsSender not implemented yet — wire SMS_DRIVER=mock until A3.");
  }
}
