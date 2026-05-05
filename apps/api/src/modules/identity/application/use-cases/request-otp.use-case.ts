import { randomInt } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";
import * as argon2 from "argon2";

import { CLOCK_PORT, type ClockPort } from "../../../../common/clock/clock.port";
import {
  RATE_LIMITER_PORT,
  type RateLimiterPort,
} from "../../../../common/rate-limit/rate-limiter.port";
import {
  SMS_SENDER_PORT,
  type SmsSenderPort,
} from "../../../notifications/application/ports/sms-sender.port";
import {
  TEMPLATE_RENDERER_PORT,
  type TemplateRendererPort,
} from "../../../notifications/application/ports/template-renderer.port";
import { OtpRateLimitedError } from "../../domain/errors/otp-rate-limited.error";
import { PhoneVO } from "../../domain/value-objects/phone.vo";
import {
  OTP_REQUEST_REPOSITORY_PORT,
  type OtpRequestRepositoryPort,
} from "../ports/otp-request.repository.port";
import { TEST_OTP_CACHE_PORT, type TestOtpCachePort } from "../ports/test-otp-cache.port";

const OTP_TTL_MS = 5 * 60_000;

// Limit / window pairs — see development-notes "Rate limiter anahtarlama disiplini".
const PHONE_MINUTE_LIMIT = 1;
const PHONE_MINUTE_WINDOW_S = 60;
const PHONE_HOUR_LIMIT = 5;
const PHONE_HOUR_WINDOW_S = 3600;
const IP_MINUTE_LIMIT = 3;
const IP_MINUTE_WINDOW_S = 60;

export interface RequestOtpInput {
  phone: string;
  ipAddress: string;
  userAgent?: string;
}

export interface RequestOtpResult {
  requestId: string;
  expiresAt: Date;
}

@Injectable()
export class RequestOtpUseCase {
  constructor(
    @Inject(OTP_REQUEST_REPOSITORY_PORT)
    private readonly repo: OtpRequestRepositoryPort,
    @Inject(SMS_SENDER_PORT)
    private readonly sms: SmsSenderPort,
    @Inject(CLOCK_PORT)
    private readonly clock: ClockPort,
    @Inject(RATE_LIMITER_PORT)
    private readonly rateLimiter: RateLimiterPort,
    @Inject(TEST_OTP_CACHE_PORT)
    private readonly testOtpCache: TestOtpCachePort,
    @Inject(TEMPLATE_RENDERER_PORT)
    private readonly templates: TemplateRendererPort,
  ) {}

  async execute(input: RequestOtpInput): Promise<RequestOtpResult> {
    const phone = PhoneVO.create(input.phone);
    const now = this.clock.now();

    await this.enforceRateLimits(phone.value, input.ipAddress);

    const code = generateOtpCode();
    const codeHash = await argon2.hash(code, { type: argon2.argon2id });
    const expiresAt = new Date(now.getTime() + OTP_TTL_MS);

    const record = await this.repo.createWithOutbox({
      phoneE164: phone.value,
      codeHash,
      channel: "SMS",
      purpose: "LOGIN",
      expiresAt,
      ipAddress: input.ipAddress,
      ...(input.userAgent ? { userAgent: input.userAgent } : {}),
    });

    const message = await this.templates.render("identity.otp_request", "tr", { code });
    await this.sms.send({
      phone: phone.value,
      message,
      sourceId: record.id,
    });

    // Dev/test only — adapter is NoopTestOtpCache in production.
    this.testOtpCache.record(phone.value, code);

    return { requestId: record.id, expiresAt: record.expiresAt };
  }

  private async enforceRateLimits(phoneE164: string, ipAddress: string): Promise<void> {
    const phoneMinute = await this.rateLimiter.check({
      key: `rl:otp:request:phone:${phoneE164}`,
      limit: PHONE_MINUTE_LIMIT,
      windowSeconds: PHONE_MINUTE_WINDOW_S,
    });
    if (!phoneMinute.allowed) {
      throw new OtpRateLimitedError("per_minute", phoneMinute.retryAfterSeconds ?? 60);
    }

    const phoneHour = await this.rateLimiter.check({
      key: `rl:otp:request:phone:${phoneE164}:hour`,
      limit: PHONE_HOUR_LIMIT,
      windowSeconds: PHONE_HOUR_WINDOW_S,
    });
    if (!phoneHour.allowed) {
      throw new OtpRateLimitedError("per_hour", phoneHour.retryAfterSeconds ?? 3600);
    }

    const ipMinute = await this.rateLimiter.check({
      key: `rl:otp:request:ip:${ipAddress}`,
      limit: IP_MINUTE_LIMIT,
      windowSeconds: IP_MINUTE_WINDOW_S,
    });
    if (!ipMinute.allowed) {
      throw new OtpRateLimitedError("per_ip_minute", ipMinute.retryAfterSeconds ?? 60);
    }
  }
}

function generateOtpCode(): string {
  return randomInt(100000, 1000000).toString();
}
