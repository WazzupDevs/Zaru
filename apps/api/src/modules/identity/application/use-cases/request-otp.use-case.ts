import { randomInt } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";
import * as argon2 from "argon2";

import { OtpRateLimitedError } from "../../domain/errors/otp-rate-limited.error";
import { PhoneVO } from "../../domain/value-objects/phone.vo";
import { CLOCK_PORT, type ClockPort } from "../ports/clock.port";
import {
  OTP_REQUEST_REPOSITORY_PORT,
  type OtpRequestRepositoryPort,
} from "../ports/otp-request.repository.port";
import { SMS_SENDER_PORT, type SmsSenderPort } from "../ports/sms-sender.port";

const OTP_TTL_MS = 5 * 60_000;
const PER_MINUTE_WINDOW_MS = 60_000;
const PER_HOUR_WINDOW_MS = 60 * 60_000;
const PER_HOUR_LIMIT = 5;
const PER_IP_MINUTE_LIMIT = 3;

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
  ) {}

  async execute(input: RequestOtpInput): Promise<RequestOtpResult> {
    const phone = PhoneVO.create(input.phone);
    const now = this.clock.now();

    await this.enforceRateLimits(phone.value, input.ipAddress, now);

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

    await this.sms.send({
      to: phone.value,
      body: `Event Fleet doğrulama kodunuz: ${code}. 5 dakika geçerlidir.`,
    });

    return { requestId: record.id, expiresAt: record.expiresAt };
  }

  private async enforceRateLimits(phoneE164: string, ipAddress: string, now: Date): Promise<void> {
    const perMinute = await this.repo.countByPhoneSince(
      phoneE164,
      new Date(now.getTime() - PER_MINUTE_WINDOW_MS),
    );
    if (perMinute > 0) {
      throw new OtpRateLimitedError("per_minute", 60);
    }

    const perHour = await this.repo.countByPhoneSince(
      phoneE164,
      new Date(now.getTime() - PER_HOUR_WINDOW_MS),
    );
    if (perHour >= PER_HOUR_LIMIT) {
      throw new OtpRateLimitedError("per_hour", 3600);
    }

    const perIp = await this.repo.countByIpSince(
      ipAddress,
      new Date(now.getTime() - PER_MINUTE_WINDOW_MS),
    );
    if (perIp >= PER_IP_MINUTE_LIMIT) {
      throw new OtpRateLimitedError("per_ip_minute", 60);
    }
  }
}

function generateOtpCode(): string {
  return randomInt(100000, 1000000).toString();
}
