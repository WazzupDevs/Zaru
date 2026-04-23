import { Injectable } from "@nestjs/common";

import type { SmsSenderPort } from "../../application/ports/sms-sender.port";

/**
 * Skeleton for the production Netgsm SMS adapter.
 * Real implementation lands in A2c+: HTTP client, signed request, error mapping,
 * circuit breaker, and İleti Merkezi failover (per CLAUDE.md).
 */
@Injectable()
export class NetgsmSmsSender implements SmsSenderPort {
  send(): Promise<void> {
    // Argument intentionally elided in the skeleton — interface signature is
    // satisfied via subtype variance until the real implementation lands.
    throw new Error("NetgsmSmsSender not implemented yet (A2c+ work).");
  }
}
