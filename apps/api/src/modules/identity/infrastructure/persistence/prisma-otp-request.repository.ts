import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";

import { PrismaService } from "../../../../common/prisma/prisma.service";
import {
  OTP_REQUESTED_EVENT_TYPE,
  type OtpRequestedEventPayload,
} from "../../domain/events/otp-requested.event";

import type {
  CreateOtpRequestInput,
  OtpRequestFullRecord,
  OtpRequestRecord,
  OtpRequestRepositoryPort,
} from "../../application/ports/otp-request.repository.port";
import type { TxClient } from "../../application/ports/user.repository.port";

/**
 * Prisma-backed implementation. The `createWithOutbox` method writes the OTP row
 * AND the OtpRequested outbox event in a single transaction (ADR 0004).
 */
@Injectable()
export class PrismaOtpRequestRepository implements OtpRequestRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async createWithOutbox(input: CreateOtpRequestInput): Promise<OtpRequestRecord> {
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.otpRequest.create({
        data: {
          phoneE164: input.phoneE164,
          codeHash: input.codeHash,
          channel: input.channel,
          purpose: input.purpose,
          expiresAt: input.expiresAt,
          ...(input.ipAddress !== undefined ? { ipAddress: input.ipAddress } : {}),
          ...(input.userAgent !== undefined ? { userAgent: input.userAgent } : {}),
        },
      });

      const eventPayload: OtpRequestedEventPayload = {
        requestId: created.id,
        phoneE164: created.phoneE164,
        channel: "SMS",
        purpose: "LOGIN",
        expiresAt: created.expiresAt.toISOString(),
        ...(input.ipAddress !== undefined ? { ipAddress: input.ipAddress } : {}),
      };

      await tx.outboxEvent.create({
        data: {
          aggregateType: "OtpRequest",
          aggregateId: created.id,
          eventType: OTP_REQUESTED_EVENT_TYPE,
          payload: eventPayload as unknown as Prisma.InputJsonValue,
        },
      });

      return {
        id: created.id,
        phoneE164: created.phoneE164,
        channel: "SMS",
        purpose: "LOGIN",
        expiresAt: created.expiresAt,
        createdAt: created.createdAt,
      };
    });
  }

  async findByIdAndPhone(
    tx: TxClient,
    id: string,
    phoneE164: string,
  ): Promise<OtpRequestFullRecord | null> {
    const row = await tx.otpRequest.findFirst({
      where: { id, phoneE164, deletedAt: null },
    });
    if (!row) return null;
    return {
      id: row.id,
      phoneE164: row.phoneE164,
      channel: "SMS",
      purpose: "LOGIN",
      codeHash: row.codeHash,
      expiresAt: row.expiresAt,
      consumedAt: row.consumedAt,
      attemptCount: row.attemptCount,
      createdAt: row.createdAt,
    };
  }

  async incrementAttempt(tx: TxClient, id: string): Promise<number> {
    const updated = await tx.otpRequest.update({
      where: { id },
      data: { attemptCount: { increment: 1 } },
      select: { attemptCount: true },
    });
    return updated.attemptCount;
  }

  async consume(tx: TxClient, id: string, consumedAt: Date): Promise<void> {
    await tx.otpRequest.update({
      where: { id },
      data: { consumedAt },
    });
  }
}
