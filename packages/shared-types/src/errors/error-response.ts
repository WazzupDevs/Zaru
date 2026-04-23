import { z } from "zod";

/**
 * Canonical error response shape produced by the API's DomainExceptionFilter.
 * Every non-2xx response from the API conforms to this contract.
 */
export const ErrorResponseSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.record(z.unknown()).optional(),
  requestId: z.string(),
});
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
