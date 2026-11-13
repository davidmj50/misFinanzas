import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { monthKey } from '../common/dates.js';
import { CreateTransactionDto } from './dto/create-transaction.dto.js';
import { UpdateTransactionDto } from './dto/update-transaction.dto.js';
import { QueryTransactionDto } from './dto/query-transaction.dto.js';
import { assertAccountOwned, assertCategoryOwned } from '../common/ownership.js';

@Injectable()
export class TransactionsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateTransactionDto) {
    const { accountId, categoryId, ...rest } = dto;
    const account = await assertAccountOwned(this.prisma, userId, accountId);
    if (dto.currency && dto.currency !== account.currency) throw new BadRequestException('La moneda debe coincidir con la cuenta');
    if (categoryId) await assertCategoryOwned(this.prisma, userId, categoryId, dto.type);
    return this.prisma.transaction.create({
      data: {
        ...rest,
        currency: account.currency,
        date: new Date(dto.date),
        user: { connect: { id: userId } },
        account: { connect: { id: accountId } },
        ...(categoryId ? { category: { connect: { id: categoryId } } } : {}),
      },
      include: { account: true, category: true, _count: { select: { expenseDocuments: true } } },
    });
  }

  async findAll(userId: string, query: QueryTransactionDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;

    const where: Prisma.TransactionWhereInput = {
      userId,
      ...(query.accountId ? { accountId: query.accountId } : {}),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.type === 'TRANSFER' ? { transferId: { not: null } } : query.type ? { type: query.type, transferId: null } : {}),
      ...(query.dateFrom || query.dateTo
        ? {
            date: {
              ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
              ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
            },
          }
        : {}),
      ...(query.search
        ? {
            OR: [
              { merchant: { contains: query.search, mode: 'insensitive' } },
              { description: { contains: query.search, mode: 'insensitive' } },
              { notes: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.transaction.findMany({
        where,
        include: { account: true, category: true, _count: { select: { expenseDocuments: true } } },
        orderBy: { date: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.transaction.count({ where }),
    ]);

    return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async findOne(userId: string, id: string) {
    const transaction = await this.prisma.transaction.findUnique({
      where: { id },
      include: { account: true, category: true, _count: { select: { expenseDocuments: true } } },
    });
    if (!transaction) throw new NotFoundException('Transacción no encontrada');
    if (transaction.userId !== userId) throw new ForbiddenException();
    return transaction;
  }

  async update(userId: string, id: string, dto: UpdateTransactionDto) {
    const current = await this.findOne(userId, id);
    if (current.externalRef?.startsWith('recurring:')) throw new BadRequestException('Elimina este pago recurrente y regístralo de nuevo desde Planificación para corregirlo');
    if (current.transferId) throw new BadRequestException('Gestiona la operación completa desde Transferencias');
    if (dto.type && dto.type !== current.type && await this.prisma.expenseDocument.count({ where: { transactionId: id } })) throw new BadRequestException('Elimina los comprobantes antes de cambiar el gasto a ingreso');
    const { accountId, categoryId, date, ...rest } = dto;
    const account = await assertAccountOwned(this.prisma, userId, accountId ?? current.accountId);
    if (dto.currency && dto.currency !== account.currency) throw new BadRequestException('La moneda debe coincidir con la cuenta');
    const effectiveCategoryId = categoryId === undefined ? current.categoryId : categoryId;
    if (effectiveCategoryId) await assertCategoryOwned(this.prisma, userId, effectiveCategoryId, dto.type ?? current.type);
    return this.prisma.transaction.update({
      where: { id },
      data: {
        ...rest,
        currency: account.currency,
        ...(date ? { date: new Date(date) } : {}),
        ...(accountId ? { account: { connect: { id: accountId } } } : {}),
        ...(categoryId !== undefined
          ? categoryId
            ? { category: { connect: { id: categoryId } } }
            : { category: { disconnect: true } }
          : {}),
      },
      include: { account: true, category: true, _count: { select: { expenseDocuments: true } } },
    });
  }

  async remove(userId: string, id: string) {
    const current = await this.findOne(userId, id);
    if (current.transferId) throw new BadRequestException('Gestiona la operación completa desde Transferencias');
    return this.prisma.transaction.delete({ where: { id } });
  }

  async summary(userId: string, dateFrom?: string, dateTo?: string, currency = 'COP') {
    const where: Prisma.TransactionWhereInput = {
      userId,
      currency,
      transferId: null,
      ...(dateFrom || dateTo
        ? {
            date: {
              ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
              ...(dateTo ? { lte: new Date(dateTo) } : {}),
            },
          }
        : {}),
    };

    const totalsByType = await this.prisma.transaction.groupBy({
      by: ['type'],
      where,
      _sum: { amount: true },
    });
    const byCategory = await this.prisma.transaction.groupBy({
      by: ['categoryId', 'type'],
      where,
      _sum: { amount: true },
    });
    const transactions = await this.prisma.transaction.findMany({
      where,
      select: { amount: true, type: true, date: true },
      orderBy: { date: 'asc' },
    });

    const categoryIds = byCategory.map((c) => c.categoryId).filter((id): id is string => Boolean(id));
    const categories = await this.prisma.category.findMany({ where: { id: { in: categoryIds } } });
    const categoryMap = new Map(categories.map((c) => [c.id, c]));

    const byMonth = new Map<string, { income: number; expense: number }>();
    for (const t of transactions) {
      const key = monthKey(t.date);
      const entry = byMonth.get(key) ?? { income: 0, expense: 0 };
      const amount = Number(t.amount);
      if (t.type === 'INCOME') entry.income += amount;
      else entry.expense += amount;
      byMonth.set(key, entry);
    }

    return {
      currency,
      totalIncome: Number(totalsByType.find((t) => t.type === 'INCOME')?._sum.amount ?? 0),
      totalExpense: Number(totalsByType.find((t) => t.type === 'EXPENSE')?._sum.amount ?? 0),
      byCategory: byCategory.map((c) => ({
        categoryId: c.categoryId,
        categoryName: c.categoryId ? (categoryMap.get(c.categoryId)?.name ?? 'Sin categoría') : 'Sin categoría',
        type: c.type,
        total: Number(c._sum.amount ?? 0),
      })),
      byMonth: Array.from(byMonth.entries())
        .map(([month, totals]) => ({ month, ...totals }))
        .sort((a, b) => a.month.localeCompare(b.month)),
    };
  }
}
