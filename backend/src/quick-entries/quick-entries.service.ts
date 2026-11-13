import { createHash } from 'node:crypto';
import { BadRequestException, ConflictException, GoneException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { QuickEntryDto } from './quick-entry.dto.js';
@Injectable()
export class QuickEntriesService {
  constructor(private readonly prisma: PrismaService) {}
  async create(userId: string, dto: QuickEntryDto) {
    const data = { accountId: dto.accountId, categoryId: dto.categoryId || null, type: dto.type, amount: new Prisma.Decimal(dto.amount).toFixed(2), currency: dto.currency,
      date: dto.date, merchant: dto.merchant?.trim() || null, description: dto.description?.trim() || null, notes: dto.notes?.trim() || null };
    const contentHash = createHash('sha256').update(JSON.stringify(data)).digest('hex');
    const where = { userId_requestId: { userId, requestId: dto.requestId } };
    const result = (request: { contentHash: string; transactionId: string | null; createdAt: Date }) => {
      if (request.contentHash !== contentHash) throw new ConflictException('La clave de registro ya se usó con otros datos');
      if (!request.transactionId) throw new GoneException('Este movimiento fue eliminado; inicia un registro nuevo');
      return { transactionId: request.transactionId, createdAt: request.createdAt };
    };
    const previous = await this.prisma.quickEntryRequest.findUnique({ where });
    if (previous) return result(previous);
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.prisma.$transaction(async tx => {
          await tx.quickEntryRequest.create({ data: { userId, requestId: dto.requestId, contentHash } });
          const account = await tx.account.findFirst({ where: { id: dto.accountId, userId, archived: false } });
          if (!account) throw new BadRequestException('La cuenta ya no está disponible. Elige una cuenta activa.');
          if (account.currency !== dto.currency) throw new BadRequestException('La moneda de la cuenta cambió. Revisa el importe antes de guardar.');
          if (dto.categoryId && !await tx.category.findFirst({ where: { id: dto.categoryId, userId, type: dto.type } })) throw new BadRequestException('La categoría no está disponible para este tipo de movimiento');
          const transaction = await tx.transaction.create({ data: { ...data, userId, amount: dto.amount, date: new Date(dto.date) } });
          return result(await tx.quickEntryRequest.update({ where, data: { transactionId: transaction.id } }));
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2034'].includes(error.code)) {
          const existing = await this.prisma.quickEntryRequest.findUnique({ where });
          if (existing) return result(existing);
          if (attempt < 2) continue;
          throw new ConflictException('Otro proceso cambió los datos. Reintenta el mismo registro.');
        }
        throw error;
      }
    }
    throw new ConflictException('No se pudo confirmar el registro');
  }
}
