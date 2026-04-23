import { Global, Module } from "@nestjs/common";
import { EventEmitterModule } from "@nestjs/event-emitter";

/**
 * In-process pub/sub bus. Outbox worker calls `eventEmitter.emitAsync(...)`
 * after committing `processed_at`; downstream subscribers (analytics,
 * notifications, fraud) hook in via `@OnEvent("identity.OtpVerified", ...)`.
 *
 * Wildcard + dot delimiter so we can subscribe to namespaces:
 *   @OnEvent("identity.*")  -> matches OtpRequested, OtpVerified, ...
 */
@Global()
@Module({
  imports: [
    EventEmitterModule.forRoot({
      wildcard: true,
      delimiter: ".",
      maxListeners: 20,
      verboseMemoryLeak: true,
    }),
  ],
})
export class EventBusModule {}
