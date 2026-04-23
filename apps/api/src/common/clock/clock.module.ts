import { Global, Module } from "@nestjs/common";

import { CLOCK_PORT } from "./clock.port";
import { SystemClock } from "./system-clock";

/**
 * Global clock provider. Tests override CLOCK_PORT in their TestingModule
 * with a FrozenClock. Production always binds SystemClock here.
 */
@Global()
@Module({
  providers: [SystemClock, { provide: CLOCK_PORT, useExisting: SystemClock }],
  exports: [CLOCK_PORT],
})
export class ClockModule {}
