import { OtpVerifySchema, RefreshTokensRequestSchema } from "@event-fleet/shared-types";

export const VerifyOtpDto = OtpVerifySchema;
export type VerifyOtpDtoType = ReturnType<typeof VerifyOtpDto.parse>;

export const RefreshTokensDto = RefreshTokensRequestSchema;
export type RefreshTokensDtoType = ReturnType<typeof RefreshTokensDto.parse>;
