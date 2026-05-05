import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Post,
  Query,
  ServiceUnavailableException,
} from "@nestjs/common";

import { Public } from "../../../../common/auth/public.decorator";
import { SMS_SENDER_PORT, type SmsSenderPort } from "../../application/ports/sms-sender.port";
import { MockSmsSender } from "../../infrastructure/senders/mock-sms-sender";

/**
 * Dev/test SMS inbox endpoint. Mirrors the A4b /auth/_test/last-otp
 * pattern: NODE_ENV guard inside the handler + module-level conditional
 * registration (defense in depth — production builds neither mount the
 * controller nor would handle the request if reached).
 *
 * Smoke scripts and integration suites use this to assert SMS delivery
 * without scraping logs or running `docker exec psql` against the
 * notifications table.
 */
@Controller("notifications/_test")
export class NotificationsTestController {
  constructor(@Inject(SMS_SENDER_PORT) private readonly smsSender: SmsSenderPort) {}

  @Public()
  @Get("last-sms")
  getLastSms(@Query("phone") phone: string): {
    phone: string;
    message: string;
    providerMessageId: string;
    sentAt: string;
  } {
    if (process.env.NODE_ENV === "production") {
      throw new NotFoundException();
    }
    if (!phone || phone.trim() === "") {
      throw new BadRequestException("phone query param required");
    }
    if (!(this.smsSender instanceof MockSmsSender)) {
      throw new ServiceUnavailableException(
        "Mock SMS inbox is only available with MockSmsSender (dummy NETGSM_USERCODE).",
      );
    }
    const last = this.smsSender.getLastFor(phone);
    if (!last) throw new NotFoundException("no recent sms for this phone");
    return {
      phone: last.phone,
      message: last.message,
      providerMessageId: last.providerMessageId,
      sentAt: last.sentAt.toISOString(),
    };
  }

  @Public()
  @Get("inbox")
  getInbox(): {
    sms: readonly {
      phone: string;
      message: string;
      providerMessageId: string;
      sentAt: string;
    }[];
  } {
    if (process.env.NODE_ENV === "production") {
      throw new NotFoundException();
    }
    if (!(this.smsSender instanceof MockSmsSender)) {
      throw new ServiceUnavailableException();
    }
    return {
      sms: this.smsSender.getInbox().map((r) => ({
        phone: r.phone,
        message: r.message,
        providerMessageId: r.providerMessageId,
        sentAt: r.sentAt.toISOString(),
      })),
    };
  }

  @Public()
  @Post("clear")
  clearInbox(): { cleared: boolean } {
    if (process.env.NODE_ENV === "production") {
      throw new NotFoundException();
    }
    if (this.smsSender instanceof MockSmsSender) {
      this.smsSender.clear();
    }
    return { cleared: true };
  }
}
