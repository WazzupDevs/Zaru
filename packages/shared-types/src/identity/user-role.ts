import { z } from "zod";

export const UserRoleSchema = z.enum(["CUSTOMER", "DRIVER", "ADMIN", "SUPPORT"]);
export type UserRole = z.infer<typeof UserRoleSchema>;
