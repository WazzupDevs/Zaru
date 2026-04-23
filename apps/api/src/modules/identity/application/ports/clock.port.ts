/**
 * Time source abstraction. Application code reads time through this port
 * so tests can install a fake clock without freezing the real one.
 */
export const CLOCK_PORT = Symbol("CLOCK_PORT");

export interface ClockPort {
  now(): Date;
}
