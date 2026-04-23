import { beforeEach, describe, expect, it, vi } from "vitest";

import { RequestOtpUseCase } from "./request-otp.use-case";
import { FrozenClock } from "../../../../../test/fakes/frozen-clock";
import { InMemoryRateLimiter } from "../../../../../test/fakes/in-memory-rate-limiter";
import { InvalidPhoneError } from "../../domain/errors/invalid-phone.error";

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
    findByIdAndPhone: vi.fn(async () => null),
    incrementAttempt: vi.fn(async () => 1),
    consume: vi.fn(async () => undefined),
  };
  const sms: SmsSenderPort = { send: vi.fn(async () => undefined) };
  const clock = new FrozenClock(FIXED_NOW);
  // Real in-memory limiter — exercises the same contract as Redis impl.
  const rateLimiter = new InMemoryRateLimiter(() => FIXED_NOW.getTime());

  const useCase = new RequestOtpUseCase(repo, sms, clock, rateLimiter);
  return { useCase, repo, sms, clock, rateLimiter };
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

  it("rate limits: second request from same phone within 60s → per_minute", async () => {
    const { useCase } = buildHarness();
    await useCase.execute({ phone: "+905551234567", ipAddress: "1.2.3.4" });
    await expect(
      useCase.execute({ phone: "+905551234567", ipAddress: "1.2.3.5" }),
    ).rejects.toMatchObject({
      code: "OTP_RATE_LIMITED",
      scope: "per_minute",
    });
  });

  it("rate limits: 4th request from same IP in a minute → per_ip_minute", async () => {
    const { useCase } = buildHarness();
    // Use 4 distinct phones to bypass the per-phone limit and isolate the IP rule.
    await useCase.execute({ phone: "+905551111111", ipAddress: "1.2.3.4" });
    await useCase.execute({ phone: "+905552222222", ipAddress: "1.2.3.4" });
    await useCase.execute({ phone: "+905553333333", ipAddress: "1.2.3.4" });
    await expect(
      useCase.execute({ phone: "+905554444444", ipAddress: "1.2.3.4" }),
    ).rejects.toMatchObject({
      code: "OTP_RATE_LIMITED",
      scope: "per_ip_minute",
    });
  });

  it("never persists the plaintext code", async () => {
    const { useCase, repo } = buildHarness();
    await useCase.execute({ phone: "+905551234567", ipAddress: "1.2.3.4" });
    const createArg = vi.mocked(repo.createWithOutbox).mock.calls[0]![0];
    expect(createArg.codeHash.length).toBeGreaterThan(20);
    expect(createArg.codeHash).toMatch(/^\$argon2/);
  });
});
