import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateTransferDto } from './dto/create-transfer.dto.js';
import { QueryTransferDto } from './dto/query-transfer.dto.js';

const ACCOUNT_SUMMARY = { select: { id: true, name: true, type: true, currency: true } } as const;

@Injectable()
export class TransfersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateTransferDto) {
    if (dto.fromAccountId === dto.toAccountId) {
      throw new BadRequestException('La cuenta de origen y la de destino deben ser distintas');
    }

    const accounts = await this.prisma.account.findMany({
      where: { id: { in: [dto.fromAccountId, dto.toAccountId] }, userId },
      select: { id: true, currency: true },
    });
    // 404 (y no 403) para no revelar si la cuenta existe y es de otro usuario.
    if (accounts.length !== 2) throw new NotFoundException('Cuenta no encontrada');
    if (accounts[0].currency !== accounts[1].currency) {
      throw new BadRequestException('Solo se puede transferir entre cuentas de la misma moneda');
    }

    return this.prisma.transfer.create({
      data: {
        userId,
        fromAccountId: dto.fromAccountId,
        toAccountId: dto.toAccountId,
        amount: dto.amount,
        date: new Date(dto.date),
        description: dto.description,
      },
      include: { fromAccount: ACCOUNT_SUMMARY, toAccount: ACCOUNT_SUMMARY },
    });
  }

  findAll(userId: string, query: QueryTransferDto) {
    return this.prisma.transfer.findMany({
      where: {
        userId,
        ...(query.accountId ? { OR: [{ fromAccountId: query.accountId }, { toAccountId: query.accountId }] } : {}),
      },
      include: { fromAccount: ACCOUNT_SUMMARY, toAccount: ACCOUNT_SUMMARY },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async remove(userId: string, id: string) {
    const transfer = await this.prisma.transfer.findUnique({ where: { id } });
    if (!transfer) throw new NotFoundException('Transferencia no encontrada');
    if (transfer.userId !== userId) throw new ForbiddenException();
    await this.prisma.transfer.delete({ where: { id } });
  }
}
