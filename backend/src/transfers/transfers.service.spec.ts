import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service.js';
import { AccountsService } from '../accounts/accounts.service.js';
import { TransfersService } from './transfers.service.js';

const ALICE = 'alice';

const ACCOUNTS = [
  { id: 'bank', userId: ALICE, currency: 'COP', initialBalance: '1000000' },
  { id: 'card', userId: ALICE, currency: 'COP', initialBalance: '0' },
  { id: 'usd', userId: ALICE, currency: 'USD', initialBalance: '0' },
  { id: 'bob-bank', userId: 'bob', currency: 'COP', initialBalance: '0' },
];

describe('TransfersService', () => {
  let prisma: {
    account: { findMany: ReturnType<typeof vi.fn> };
    transfer: { create: ReturnType<typeof vi.fn> };
  };
  let service: TransfersService;
  const base = { amount: 300000, date: '2026-09-15' };

  beforeEach(() => {
    prisma = {
      account: {
        findMany: vi.fn(({ where }: { where: { id: { in: string[] }; userId: string } }) =>
          Promise.resolve(ACCOUNTS.filter((a) => where.id.in.includes(a.id) && a.userId === where.userId)),
        ),
      },
      transfer: { create: vi.fn((args: unknown) => Promise.resolve(args)) },
    };
    service = new TransfersService(prisma as unknown as PrismaService);
  });

  it('crea una transferencia entre cuentas propias de la misma moneda', async () => {
    await service.create(ALICE, { ...base, fromAccountId: 'bank', toAccountId: 'card' });
    expect(prisma.transfer.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: ALICE, fromAccountId: 'bank', toAccountId: 'card', amount: 300000 }),
      }),
    );
  });

  it('rechaza transferir a la misma cuenta', async () => {
    await expect(service.create(ALICE, { ...base, fromAccountId: 'bank', toAccountId: 'bank' })).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.transfer.create).not.toHaveBeenCalled();
  });

  it('rechaza una cuenta de otro usuario', async () => {
    await expect(service.create(ALICE, { ...base, fromAccountId: 'bank', toAccountId: 'bob-bank' })).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.transfer.create).not.toHaveBeenCalled();
  });

  it('rechaza cuentas de distinta moneda', async () => {
    await expect(service.create(ALICE, { ...base, fromAccountId: 'bank', toAccountId: 'usd' })).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.transfer.create).not.toHaveBeenCalled();
  });
});

describe('AccountsService: saldos con transferencias', () => {
  // Banco: saldo inicial 1.000.000, ingreso de 500.000 y paga 300.000 de la tarjeta.
  // Tarjeta: gasto de 400.000 y recibe el pago de 300.000.
  const transactions = [
    { accountId: 'bank', type: 'INCOME', amount: 500000, date: new Date('2026-08-05T00:00:00Z') },
    { accountId: 'card', type: 'EXPENSE', amount: 400000, date: new Date('2026-08-10T00:00:00Z') },
  ];
  const transfers = [
    { fromAccountId: 'bank', toAccountId: 'card', amount: 300000, date: new Date('2026-09-01T00:00:00Z') },
  ];

  const prisma = {
    account: {
      findMany: () => Promise.resolve(ACCOUNTS.filter((a) => a.id === 'bank' || a.id === 'card')),
      findUnique: ({ where }: { where: { id: string } }) => Promise.resolve(ACCOUNTS.find((a) => a.id === where.id)),
    },
    transaction: {
      groupBy: () =>
        Promise.resolve(
          transactions.map((t) => ({ accountId: t.accountId, type: t.type, _sum: { amount: t.amount } })),
        ),
      findMany: ({ where }: { where: { accountId: string } }) =>
        Promise.resolve(transactions.filter((t) => t.accountId === where.accountId)),
    },
    transfer: {
      groupBy: ({ by }: { by: string[] }) => {
        const key = by[0] as 'fromAccountId' | 'toAccountId';
        return Promise.resolve(transfers.map((t) => ({ [key]: t[key], _sum: { amount: t.amount } })));
      },
      findMany: ({ where }: { where: { OR: { fromAccountId?: string; toAccountId?: string }[] } }) => {
        const id = where.OR[0].fromAccountId;
        return Promise.resolve(transfers.filter((t) => t.fromAccountId === id || t.toAccountId === id));
      },
    },
  };
  const service = new AccountsService(prisma as unknown as PrismaService);

  it('la transferencia resta del origen y suma al destino', async () => {
    const accounts = await service.findAll(ALICE);
    expect(accounts.find((a) => a.id === 'bank')?.balance).toBe(1_200_000);
    expect(accounts.find((a) => a.id === 'card')?.balance).toBe(-100_000);
  });

  it('el historial mensual incluye la transferencia', async () => {
    await expect(service.getBalanceHistory(ALICE, 'bank')).resolves.toEqual([
      { month: '2026-08', balance: 1_500_000 },
      { month: '2026-09', balance: 1_200_000 },
    ]);
    await expect(service.getBalanceHistory(ALICE, 'card')).resolves.toEqual([
      { month: '2026-08', balance: -400_000 },
      { month: '2026-09', balance: -100_000 },
    ]);
  });
});
