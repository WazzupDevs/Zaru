import { beforeEach, describe, expect, it, vi } from "vitest";

import { RequestOtpUseCase } from "./request-otp.use-case";
import { InvalidPhoneError } from "../../domain/errors/invalid-phone.error";

import type { ClockPort } from "../ports/clock.port";
import type {
  OtpRequestRecord,
  OtpRequestRepositoryPort,
} from "../ports/otp-request.repository.port";
import type { SmsSenderPort } from "../ports/sms-sender.port";

const FIXED_NOW = new Date("2026-04-23T10:00:00.000Z");

function buildHarness() {
  const repo: OtpRequestRepositoryPort = {
    createWithOutbox: vi.fn(
      async (input) =>
        ({
          id: "req-test-id",
          phoneE164: input.phoneE164,
          channel: input.channel,
          purpose: input.purpose,
          expiresAt: input.expiresAt,
          createdAt: FIXED_NOW,
        }) satisfies OtpRequestRecord,
    ),
    countByPhoneSince: vi.fn(async () => 0),
    countByIpSince: vi.fn(async () => 0),
    // Verify-side methods aren't exercised in this suite, but the port
    // requires them for type compatibility.
    findByIdAndPhone: vi.fn(async () => null),
    incrementAttempt: vi.fn(async () => 1),
    consume: vi.fn(async () => undefined),
  };
  const sms: SmsSenderPort = { send: vi.fn(async () => undefined) };
  const clock: ClockPort = { now: () => FIXED_NOW };

  const useCase = new RequestOtpUseCase(repo, sms, clock);
  return { useCase, repo, sms, clock };
}

describe("RequestOtpUseCase", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("happy path: creates OTP, hashes code, persists, sends SMS, returns id+expiry", async () => {
    const { useCase, repo, sms } = buildHarness();
    const result = await useCase.execute({
      phone: "+905551234567",
      ipAddress: "1.2.3.4",
      userAgent: "vitest",
    });

    expect(result.requestId).toBe("req-test-id");
    expect(result.expiresAt.getTime()).toBe(FIXED_NOW.getTime() + 5 * 60_000);

    expect(repo.createWithOutbox).toHaveBeenCalledOnce();
    const createArg = vi.mocked(repo.createWithOutbox).mock.calls[0]![0];
    expect(createArg.phoneE164).toBe("+905551234567");
    expect(createArg.channel).toBe("SMS");
    expect(createArg.purpose).toBe("LOGIN");
    expect(createArg.codeHash).toMatch(/^\$argon2/);
    expect(createArg.codeHash).not.toMatch(/\d{6}/);
    expect(createArg.ipAddress).toBe("1.2.3.4");

    expect(sms.send).toHaveBeenCalledOnce();
    const smsArg = vi.mocked(sms.send).mock.calls[0]![0];
    expect(smsArg.to).toBe("+905551234567");
    expect(smsArg.body).toMatch(/\d{6}/);
  });

  it("throws InvalidPhoneError for non-TR-mobile numbers", async () => {
    const { useCase } = buildHarness();
    await expect(
      useCase.execute({ phone: "+15551234567", ipAddress: "1.2.3.4" }),
    ).rejects.toBeInstanceOf(InvalidPhoneError);
  });

  it("rate limits: same phone in last 60 seconds → OtpRateLimitedError(per_minute)", async () => {
    const { useCase, repo } = buildHarness();
    vi.mocked(repo.countByPhoneSince).mockImplementation(async (_, since) => {
      const windowMs = FIXED_NOW.getTime() - since.getTime();
      return windowMs <= 60_000 + 1 ? 1 : 0;
    });

    await expect(
      useCase.execute({ phone: "+905551234567", ipAddress: "1.2.3.4" }),
    ).rejects.toMatchObject({
      code: "OTP_RATE_LIMITED",
      scope: "per_minute",
    });
  });

  it("rate limits: 5+ requests in last hour for same phone → per_hour", async () => {
    const { useCase, repo } = buildHarness();
    vi.mocked(repo.countByPhoneSince).mockImplementation(async (_, since) => {
      const windowMs = FIXED_NOW.getTime() - since.getTime();
      if (windowMs <= 60_000 + 1) return 0;
      if (windowMs <= 3_600_000 + 1) return 5;
      return 0;
    });

    await expect(
      useCase.execute({ phone: "+905551234567", ipAddress: "1.2.3.4" }),
    ).rejects.toMatchObject({
      code: "OTP_RATE_LIMITED",
      scope: "per_hour",
    });
  });

  it("rate limits: 3+ requests in last minute from same IP → per_ip_minute", async () => {
    const { useCase, repo } = buildHarness();
    vi.mocked(repo.countByIpSince).mockResolvedValue(3);

    await expect(
      useCase.execute({ phone: "+905551234567", ipAddress: "1.2.3.4" }),
    ).rejects.toMatchObject({
      code: "OTP_RATE_LIMITED",
      scope: "per_ip_minute",
    });
  });

  it("never persists the plaintext code", async () => {
    const { useCase, repo } = buildHarness();
    await useCase.execute({ phone: "+905551234567", ipAddress: "1.2.3.4" });
    const createArg = vi.mocked(repo.createWithOutbox).mock.calls[0]![0];
    // The plain code is 6 digits; the hash must not equal that pattern alone.
    expect(createArg.codeHash.length).toBeGreaterThan(20);
    expect(createArg.codeHash).toMatch(/^\$argon2/);
  });
});
