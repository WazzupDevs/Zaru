import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Query,
} from "@nestjs/common";

import { Public } from "../../../../common/auth/public.decorator";
import {
  TEST_OTP_CACHE_PORT,
  type TestOtpCachePort,
} from "../../application/ports/test-otp-cache.port";

/**
 * Dev/test smoke helper. Mounted ONLY when NODE_ENV !== production
 * (see IdentityModule.controllers wiring). Lets smoke scripts and e2e
 * tests fetch the latest plaintext OTP for a given phone without
 * scraping logs or stubbing the SMS adapter.
 *
 * Defense in depth — the route returns 404 even if reached, but the
 * primary guard is "do not register the controller in production".
 */
@Controller("auth/_test")
export class TestOnlyController {
  constructor(
    @Inject(TEST_OTP_CACHE_PORT)
    private readonly cache: TestOtpCachePort,
  ) {}

  @Public()
  @Get("last-otp")
  getLastOtp(@Query("phone") phone: string): { code: string; issuedAt: string } {
    if (process.env.NODE_ENV === "production") {
      throw new NotFoundException();
    }
    if (!phone || phone.trim() === "") {
      throw new BadRequestException("phone query param required");
    }
    const entry = this.cache.getLast(phone);
    if (!entry) {
      throw new NotFoundException("no recent otp for this phone");
    }
    return { code: entry.code, issuedAt: entry.issuedAt.toISOString() };
  }
}
