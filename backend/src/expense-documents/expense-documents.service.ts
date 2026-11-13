import { createHash } from 'node:crypto';
import { BadRequestException, ConflictException, GoneException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateDocumentExpenseDto } from './document.dto.js';
import { MAX_DOCUMENTS, prepareDocuments, type UploadedDocument } from './document-files.js';
type Db = Prisma.TransactionClient;
const metadataSelect = { id: true, fileName: true, mimeType: true, size: true, sha256: true, createdAt: true } as const;
@Injectable()
export class ExpenseDocumentsService {
  constructor(private readonly prisma: PrismaService) {}
  private async expense(db: Db, userId: string, id: string) {
    const expense = await db.transaction.findFirst({ where: { id, userId, type: 'EXPENSE', transferId: null } });
    if (!expense) throw new NotFoundException('Gasto no encontrado');
    return expense;
  }
  async list(userId: string, id: string) {
    await this.expense(this.prisma, userId, id);
    return this.prisma.expenseDocument.findMany({ where: { userId, transactionId: id }, select: metadataSelect, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
  }
  async download(userId: string, id: string) {
    const document = await this.prisma.expenseDocument.findFirst({ where: { id, userId, transaction: { userId, type: 'EXPENSE', transferId: null } } });
    if (!document) throw new NotFoundException('Documento no encontrado');
    return document;
  }
  async remove(userId: string, id: string) {
    const removed = await this.prisma.expenseDocument.deleteMany({ where: { id, userId, transaction: { userId } } });
    if (!removed.count) throw new NotFoundException('Documento no encontrado');
  }
  async upload(userId: string, files: UploadedDocument[], requestId: string, dto?: CreateDocumentExpenseDto, transactionId?: string) {
    const prepared = prepareDocuments(files);
    const input = dto ? { accountId: dto.accountId, categoryId: dto.categoryId || null, date: dto.date, amount: new Prisma.Decimal(dto.amount).toFixed(2),
      merchant: dto.merchant?.trim() || null, description: dto.description?.trim() || null, notes: dto.notes?.trim() || null } : null;
    const contentHash = createHash('sha256').update(JSON.stringify([transactionId ?? 'NEW', input, prepared.map(f => [f.fileName, f.mimeType, f.sha256])])).digest('hex');
    const where = { userId_requestId: { userId, requestId } };
    const result = (upload: { contentHash: string; transactionId: string | null; documentIds: string[]; createdAt: Date }) => {
      if (upload.contentHash !== contentHash) throw new ConflictException('La clave de envío ya se usó con otros datos');
      if (!upload.transactionId) throw new GoneException('El gasto de este envío fue eliminado; inicia un registro nuevo');
      return { transactionId: upload.transactionId, documentIds: upload.documentIds, createdAt: upload.createdAt };
    };
    const previous = await this.prisma.documentUpload.findUnique({ where });
    if (previous) return result(previous);
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.prisma.$transaction(async tx => {
          // This unique row and all files/ledger writes commit together; retries never create a second expense.
          await tx.documentUpload.create({ data: { userId, requestId, contentHash, documentIds: [] } });
          let id = transactionId;
          if (dto && input) {
            const account = await tx.account.findFirst({ where: { id: dto.accountId, userId, archived: false } });
            if (!account) throw new BadRequestException('Cuenta activa no disponible');
            if (dto.categoryId && !await tx.category.findFirst({ where: { id: dto.categoryId, userId, type: 'EXPENSE' } })) throw new BadRequestException('Categoría de gasto no disponible');
            const expense = await tx.transaction.create({ data: { userId, accountId: account.id, categoryId: input.categoryId, type: 'EXPENSE', amount: dto.amount,
              currency: account.currency, date: new Date(dto.date), merchant: input.merchant, description: input.description, notes: input.notes } });
            id = expense.id;
          } else if (id) await this.expense(tx, userId, id);
          else throw new BadRequestException('Falta el gasto de destino');
          const existing = await tx.expenseDocument.findMany({ where: { transactionId: id }, select: { sha256: true } });
          if (existing.length + prepared.length > MAX_DOCUMENTS) throw new BadRequestException('Cada gasto admite hasta 3 documentos; elimina uno antes de adjuntar otro');
          if (prepared.some(f => existing.some(e => e.sha256 === f.sha256))) throw new ConflictException('Este documento ya está adjunto al gasto');
          const documentIds: string[] = [];
          for (const file of prepared) {
            const document = await tx.expenseDocument.create({ data: { ...file, userId, transactionId: id! }, select: { id: true } });
            documentIds.push(document.id);
          }
          return result(await tx.documentUpload.update({ where, data: { transactionId: id!, documentIds } }));
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20000 });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2034'].includes(error.code)) {
          const existing = await this.prisma.documentUpload.findUnique({ where });
          if (existing) return result(existing);
          if (attempt < 2) continue;
          throw new ConflictException('Otro proceso cambió los adjuntos. Actualiza la lista y reintenta.');
        }
        throw error;
      }
    }
    throw new ConflictException('No se pudo completar el envío');
  }
}
