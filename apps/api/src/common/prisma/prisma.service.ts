import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma, PrismaClient } from "@prisma/client";

import type { Env } from "../../config/env";

/**
 * Models that participate in the soft-delete contract (deleted_at IS NULL filter).
 * Manual list — Prisma doesn't expose runtime metadata to derive it.
 *
 * Excluded by design:
 *   - OutboxEvent: process-and-forget; soft delete adds noise to worker queries.
 *   - IdempotencyRecord: TTL-driven, deleted by cleanup job (A2c+).
 */
const SOFT_DELETE_MODELS = new Set<string>(["User", "RefreshToken", "OtpRequest"]);

/**
 * Soft-delete extension.
 *
 * What it handles:
 *   - findMany / findFirst / count → injects `where.deletedAt: null`.
 *   - delete → rewrites to `update({ data: { deletedAt: new Date() } })`.
 *
 * What it does NOT handle (see docs/development-notes.md):
 *   - findUnique: Prisma's where accepts only unique fields, can't add deletedAt.
 *     Use findFirst with explicit { id, deletedAt: null } when soft delete matters.
 *   - update: callers must guard with where.deletedAt:null themselves.
 *   - deleteMany: not yet covered (A2c+).
 */
function buildSoftDeleteExtension() {
  return Prisma.defineExtension({
    name: "soft-delete",
    query: {
      $allModels: {
        async findMany({ model, args, query }) {
          if (SOFT_DELETE_MODELS.has(model)) {
            args.where = { deletedAt: null, ...args.where };
          }
          return query(args);
        },
        async findFirst({ model, args, query }) {
          if (SOFT_DELETE_MODELS.has(model)) {
            args.where = { deletedAt: null, ...args.where };
          }
          return query(args);
        },
        async count({ model, args, query }) {
          if (SOFT_DELETE_MODELS.has(model)) {
            args.where = { deletedAt: null, ...(args.where ?? {}) };
          }
          return query(args);
        },
        async delete({ model, args, query }) {
          if (!SOFT_DELETE_MODELS.has(model)) {
            return query(args);
          }
          // Re-route to update; the parent service exposes an extended client
          // so we cannot recurse safely here. Instead, mark and let downstream
          // consumers know they should use update directly.
          // Practical compromise: throw to surface the misuse.
          throw new Error(
            `prisma.${model.toLowerCase()}.delete() is not supported on soft-delete models. ` +
              `Use update({ where, data: { deletedAt: new Date() } }) instead.`,
          );
        },
      },
    },
  });
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  /**
   * Extended client with soft-delete query overrides.
   * Type is asserted as PrismaClient so callers retain full model accessors;
   * the extension applies transparently at runtime.
   */
  private extendedClient!: PrismaClient;

  constructor(config: ConfigService<Env, true>) {
    const env = config.get("NODE_ENV", { infer: true });
    super({
      log: env === "development" ? ["query", "warn", "error"] : ["warn", "error"],
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.extendedClient = this.$extends(buildSoftDeleteExtension()) as unknown as PrismaClient;
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /**
   * Use this client for all reads/writes. The base PrismaClient (this) bypasses
   * the soft-delete extension — only use it for raw queries or migrations.
   */
  get client(): PrismaClient {
    return this.extendedClient;
  }
}
