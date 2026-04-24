import { Injectable } from "@nestjs/common";

import type { ClockPort } from "./clock.port";

@Injectable()
export class SystemClock implements ClockPort {
  now(): Date {
    return new Date();
  }
  nowMs(): number {
    return Date.now();
  }
}
