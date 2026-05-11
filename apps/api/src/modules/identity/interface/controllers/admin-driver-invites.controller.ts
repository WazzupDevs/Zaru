import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Inject,
} from "@nestjs/common";

import {
  CreateDriverInviteInputSchema,
  ListDriverInvitesQuerySchema,
  type CreateDriverInviteInput,
  type DriverInviteResponse,
  type ListDriverInvitesQuery,
} from "@event-fleet/shared-types";

import { CurrentUser, type AuthUser } from "../../../../common/auth/current-user.decorator";
import { Roles } from "../../../../common/auth/roles.decorator";
import { TX_RUNNER_PORT, type TxRunnerPort } from "../../../../common/persistence/tx-runner.port";
import { ZodValidationPipe } from "../../../../common/pipes/zod-validation.pipe";
import {
  DRIVER_INVITE_REPOSITORY_PORT,
  type DriverInviteRecord,
  type DriverInviteRepositoryPort,
} from "../../application/ports/driver-invite.repository.port";
import { CreateDriverInviteUseCase } from "../../application/use-cases/create-driver-invite.use-case";
import { RevokeDriverInviteUseCase } from "../../application/use-cases/revoke-driver-invite.use-case";

/**
 * /admin/driver-invites — A4f-1's whitelist management surface. The
 * driver app's auth flow gates on these rows; admins use this controller
 * to add (POST), browse (GET), and revoke (PATCH /:id/revoke) invites.
 *
 * RolesGuard is wired globally via the AppModule's Reflector pattern —
 * the @Roles("ADMIN") decorator is enough; no @UseGuards needed locally.
 */
@Controller("admin/driver-invites")
@Roles("ADMIN")
export class AdminDriverInvitesController {
  constructor(
    private readonly createUseCase: CreateDriverInviteUseCase,
    private readonly revokeUseCase: RevokeDriverInviteUseCase,
    @Inject(DRIVER_INVITE_REPOSITORY_PORT)
    private readonly repo: DriverInviteRepositoryPort,
    @Inject(TX_RUNNER_PORT)
    private readonly tx: TxRunnerPort,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body(new ZodValidationPipe(CreateDriverInviteInputSchema))
    body: CreateDriverInviteInput,
    @CurrentUser() admin: AuthUser,
  ): Promise<DriverInviteResponse> {
    const invite = await this.createUseCase.execute(
      { phone: body.phone, notes: body.notes ?? null },
      { userId: admin.id, role: admin.role },
    );
    return toResponse(invite);
  }

  @Get()
  async list(
    @Query(new ZodValidationPipe(ListDriverInvitesQuerySchema))
    query: ListDriverInvitesQuery,
  ): Promise<DriverInviteResponse[]> {
    const items = await this.tx.run((tx) =>
      this.repo.list(tx, {
        ...(query.status ? { status: query.status } : {}),
        ...(query.cursor ? { cursor: query.cursor } : {}),
        ...(query.limit ? { limit: query.limit } : {}),
      }),
    );
    return items.map(toResponse);
  }

  @Patch(":id/revoke")
  @HttpCode(HttpStatus.NO_CONTENT)
  async revoke(
    @Param("id", new ParseUUIDPipe()) id: string,
    @CurrentUser() admin: AuthUser,
  ): Promise<void> {
    await this.revokeUseCase.execute({ inviteId: id }, { role: admin.role });
  }
}

function toResponse(invite: DriverInviteRecord): DriverInviteResponse {
  return {
    id: invite.id,
    phoneE164: invite.phoneE164,
    status: invite.status,
    invitedAt: invite.invitedAt.toISOString(),
    acceptedAt: invite.acceptedAt ? invite.acceptedAt.toISOString() : null,
    acceptedUserId: invite.acceptedUserId,
    invitedByAdminId: invite.invitedByAdminId,
    notes: invite.notes,
  };
}
