import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Res, StreamableFile, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser, type AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';
import { MAX_DOCUMENT_SIZE, MAX_DOCUMENTS, type UploadedDocument } from './document-files.js';
import { CreateDocumentExpenseDto, parseMetadata, UploadDocumentsDto } from './document.dto.js';
import { ExpenseDocumentsService } from './expense-documents.service.js';
const upload = () => FilesInterceptor('files', MAX_DOCUMENTS, { limits: { fileSize: MAX_DOCUMENT_SIZE, files: MAX_DOCUMENTS, fields: 1, fieldSize: 16384, parts: MAX_DOCUMENTS + 1 } });
@Controller('expense-documents')
@UseGuards(JwtAuthGuard)
export class ExpenseDocumentsController {
  constructor(private readonly documents: ExpenseDocumentsService) {}
  @Post('expenses') @Throttle({ default: { limit: 10, ttl: 60000 } }) @UseInterceptors(upload())
  create(@CurrentUser() user: AuthenticatedUser, @UploadedFiles() files: UploadedDocument[], @Body('metadata') metadata: unknown) {
    const dto = parseMetadata(CreateDocumentExpenseDto, metadata);
    return this.documents.upload(user.userId, files, dto.requestId, dto);
  }
  @Get('expenses/:id') list(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) { return this.documents.list(user.userId, id); }
  @Post('expenses/:id') @Throttle({ default: { limit: 10, ttl: 60000 } }) @UseInterceptors(upload())
  attach(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @UploadedFiles() files: UploadedDocument[], @Body('metadata') metadata: unknown) {
    const dto = parseMetadata(UploadDocumentsDto, metadata);
    return this.documents.upload(user.userId, files, dto.requestId, undefined, id);
  }
  @Get(':id/file') async download(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Res({ passthrough: true }) response: Response) {
    const document = await this.documents.download(user.userId, id);
    response.set({ 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "sandbox; default-src 'none'" });
    return new StreamableFile(Buffer.from(document.data), { type: document.mimeType, disposition: `attachment; filename="comprobante"; filename*=UTF-8''${encodeURIComponent(document.fileName).replace(/['()]/g, c => '%' + c.charCodeAt(0).toString(16))}`, length: document.size });
  }
  @Delete(':id') @HttpCode(204) remove(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) { return this.documents.remove(user.userId, id); }
}
