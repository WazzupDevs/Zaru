import { Body, Controller, HttpCode, HttpStatus, Patch } from "@nestjs/common";

import { CurrentUser, type AuthUser } from "../../../../common/auth/current-user.decorator";
import { ZodValidationPipe } from "../../../../common/pipes/zod-validation.pipe";
import { UpdatePushTokenUseCase } from "../../application/use-cases/update-push-token.use-case";
import { UpdatePushTokenDto, type UpdatePushTokenDtoType } from "../dtos/update-push-token.dto";

/**
 * /users/me — current-user controller. Today only the push-token write
 * endpoint lives here; future read/update of profile fields (display
 * name, locale, etc.) will land here too rather than carving a separate
 * `profile.controller`.
 */
@Controller("users/me")
export class UsersController {
  constructor(private readonly updatePushToken: UpdatePushTokenUseCase) {}

  @Patch("push-token")
  @HttpCode(HttpStatus.NO_CONTENT)
  async patchPushToken(
    @Body(new ZodValidationPipe(UpdatePushTokenDto)) body: UpdatePushTokenDtoType,
    @CurrentUser() user: AuthUser,
  ): Promise<void> {
    await this.updatePushToken.execute({
      userId: user.id,
      expoPushToken: body.expoPushToken,
    });
  }
}
