import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseInterceptors,
} from "@nestjs/common";

import {
  RequestDocumentUploadInputSchema,
  type DocumentResponse,
  type RequestDocumentUploadInput,
  type RequestDocumentUploadResponse,
} from "@event-fleet/shared-types";

import { CurrentUser, type AuthUser } from "../../../../common/auth/current-user.decorator";
import { IdempotencyInterceptor } from "../../../../common/idempotency/idempotency.interceptor";
import { ZodValidationPipe } from "../../../../common/pipes/zod-validation.pipe";
import { ConfirmDocumentUploadUseCase } from "../../application/use-cases/confirm-document-upload.use-case";
import { ListMyDocumentsUseCase } from "../../application/use-cases/list-my-documents.use-case";
import { RequestDocumentUploadUseCase } from "../../application/use-cases/request-document-upload.use-case";
import { toDocumentResponse } from "../mappers/driver-profile.mapper";

@Controller("supply/driver-profiles/me/documents")
export class DocumentController {
  constructor(
    private readonly request: RequestDocumentUploadUseCase,
    private readonly confirm: ConfirmDocumentUploadUseCase,
    private readonly listMine: ListMyDocumentsUseCase,
  ) {}

  @Post("upload-url")
  @UseInterceptors(IdempotencyInterceptor)
  async upload(
    @Body(new ZodValidationPipe(RequestDocumentUploadInputSchema))
    body: RequestDocumentUploadInput,
    @CurrentUser() user: AuthUser,
  ): Promise<RequestDocumentUploadResponse> {
    const result = await this.request.execute(
      {
        type: body.type,
        fileName: body.fileName,
        fileSize: body.fileSize,
        mimeType: body.mimeType,
        vehicleId: body.vehicleId,
        ...(body.issuedAt ? { issuedAt: new Date(`${body.issuedAt}T00:00:00Z`) } : {}),
        ...(body.expiresAt ? { expiresAt: new Date(`${body.expiresAt}T00:00:00Z`) } : {}),
      },
      { userId: user.id },
    );
    return {
      documentId: result.documentId,
      uploadUrl: result.uploadUrl,
      publicUrl: result.publicUrl,
      expiresAt: result.expiresAt.toISOString(),
      maxSizeBytes: result.maxSizeBytes,
    };
  }

  @Post(":id/confirm")
  @HttpCode(HttpStatus.OK)
  async confirmUpload(
    @Param("id") id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<DocumentResponse> {
    const doc = await this.confirm.execute(id, { userId: user.id });
    return toDocumentResponse(doc);
  }

  @Get()
  async list(@CurrentUser() user: AuthUser): Promise<DocumentResponse[]> {
    const docs = await this.listMine.execute({ userId: user.id });
    return docs.map(toDocumentResponse);
  }
}
