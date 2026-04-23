import { OtpRequestSchema } from "@event-fleet/shared-types";

export const RequestOtpDto = OtpRequestSchema;
export type RequestOtpDtoType = ReturnType<typeof RequestOtpDto.parse>;
