import type { ClockPort } from "../../src/common/clock/clock.port";

/**
 * Test-only deterministic clock. Set or advance time explicitly; nothing
 * moves on its own. Use in TestingModule overrides:
 *
 *   const clock = new FrozenClock(new Date("2026-04-23T10:00:00Z"));
 *   const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
 *     .overrideProvider(CLOCK_PORT).useValue(clock).compile();
 *   ...
 *   clock.advance(2 * 60 * 60 * 1000); // +2h
 */
export class FrozenClock implements ClockPort {
  private current: Date;

  constructor(initial: Date) {
    this.current = new Date(initial);
  }

  now(): Date {
    return new Date(this.current);
  }

  nowMs(): number {
    return this.current.getTime();
  }

  set(date: Date): void {
    this.current = new Date(date);
  }

  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}
