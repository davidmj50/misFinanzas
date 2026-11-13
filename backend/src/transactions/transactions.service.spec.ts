import { BadRequestException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service.js';
import { TransactionsService } from './transactions.service.js';

describe('Moneda y categoría de los movimientos', () => {
  const userId = 'owner';
  const input = { accountId: 'usd', categoryId: 'food', type: 'EXPENSE' as const, amount: 10, date: '2026-11-12' };
  const createMock = () => ({
    account: { findFirst: vi.fn(async () => ({ id: 'usd', currency: 'USD' })) },
    category: { findFirst: vi.fn(async () => ({ id: 'food', type: 'EXPENSE' })) },
    expenseDocument: { count: vi.fn(async () => 0) },
    transaction: {
      create: vi.fn(async (args) => args.data),
      update: vi.fn(async (args) => args.data),
      findUnique: vi.fn(async () => ({ id: 'tx', userId, accountId: 'usd', categoryId: 'food', type: 'EXPENSE' })),
    },
  });

  it('hereda USD sin requerir que el cliente lo envíe', async () => {
    const prisma = createMock();
    const service = new TransactionsService(prisma as unknown as PrismaService);
    await expect(service.create(userId, input)).resolves.toMatchObject({ currency: 'USD' });
  });

  it('rechaza una moneda distinta a la cuenta', async () => {
    const prisma = createMock();
    const service = new TransactionsService(prisma as unknown as PrismaService);
    await expect(service.create(userId, { ...input, currency: 'COP' })).rejects.toThrow(BadRequestException);
    expect(prisma.transaction.create).not.toHaveBeenCalled();
  });

  it('rechaza una categoría de ingreso en un gasto', async () => {
    const prisma = createMock();
    prisma.category.findFirst.mockResolvedValue({ id: 'salary', type: 'INCOME' });
    const service = new TransactionsService(prisma as unknown as PrismaService);
    await expect(service.create(userId, input)).rejects.toThrow(BadRequestException);
    expect(prisma.transaction.create).not.toHaveBeenCalled();
  });

  it('revalida la categoría existente si solo se cambia el tipo', async () => {
    const prisma = createMock();
    const service = new TransactionsService(prisma as unknown as PrismaService);
    await expect(service.update(userId, 'tx', { type: 'INCOME' })).rejects.toThrow(BadRequestException);
    expect(prisma.transaction.update).not.toHaveBeenCalled();
  });

  it('permite quitar la categoría al cambiar de tipo', async () => {
    const prisma = createMock();
    const service = new TransactionsService(prisma as unknown as PrismaService);
    await expect(service.update(userId, 'tx', { type: 'INCOME', categoryId: null })).resolves.toMatchObject({
      type: 'INCOME', currency: 'USD', category: { disconnect: true },
    });
  });

  it('filtra todas las agregaciones del resumen por moneda', async () => {
    const prisma = {
      transaction: {
        groupBy: vi.fn().mockResolvedValueOnce([{ type: 'INCOME', _sum: { amount: 100 } }]).mockResolvedValueOnce([]),
        findMany: vi.fn(async () => [{ amount: 100, type: 'INCOME', date: new Date('2026-11-12') }]),
      },
      category: { findMany: vi.fn(async () => []) },
    };
    const service = new TransactionsService(prisma as unknown as PrismaService);
    const summary = await service.summary(userId, undefined, undefined, 'USD');
    expect(summary).toMatchObject({ currency: 'USD', totalIncome: 100, totalExpense: 0 });
    for (const [args] of prisma.transaction.groupBy.mock.calls) expect(args.where).toMatchObject({ userId, currency: 'USD' });
    expect(prisma.transaction.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId, currency: 'USD', transferId: null } }));
  });
});
