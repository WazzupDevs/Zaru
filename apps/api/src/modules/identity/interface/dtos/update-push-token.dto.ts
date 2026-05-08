import { UpdatePushTokenInputSchema } from "@event-fleet/shared-types";

import type { z } from "zod";

export const UpdatePushTokenDto = UpdatePushTokenInputSchema;
export type UpdatePushTokenDtoType = z.infer<typeof UpdatePushTokenInputSchema>;
