import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { EmailService } from '../email/email.service.js';
import { TransactionsService } from '../transactions/transactions.service.js';
import { RecurringPaymentsService } from '../recurring-payments/recurring-payments.service.js';
import { CategoriesService } from '../categories/categories.service.js';

const ALICE = 'alice';
const BOB = 'bob';

// Prisma falso: cada usuario tiene una cuenta y una categoría propias.
function createPrismaMock() {
  const accounts = [
    { id: 'acc-alice', userId: ALICE },
    { id: 'acc-bob', userId: BOB },
  ];
  const categories = [
    { id: 'cat-alice', userId: ALICE },
    { id: 'cat-bob', userId: BOB },
  ];
  const findOwned =
    (rows: { id: string; userId: string }[]) =>
    ({ where }: { where: { id: string; userId: string } }) =>
      Promise.resolve(rows.find((r) => r.id === where.id && r.userId === where.userId) ?? null);

  return {
    account: { findFirst: vi.fn(findOwned(accounts)) },
    category: {
      findFirst: vi.fn(findOwned(categories)),
      findUnique: vi.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(categories.find((c) => c.id === where.id) ?? null),
      ),
      create: vi.fn((args: unknown) => Promise.resolve(args)),
      update: vi.fn((args: unknown) => Promise.resolve(args)),
    },
    transaction: {
      findUnique: vi.fn(() => Promise.resolve({ id: 'tx-alice', userId: ALICE })),
      create: vi.fn((args: unknown) => Promise.resolve(args)),
      update: vi.fn((args: unknown) => Promise.resolve(args)),
    },
    recurringPayment: {
      findUnique: vi.fn(() => Promise.resolve({ id: 'rp-alice', userId: ALICE })),
      create: vi.fn((args: unknown) => Promise.resolve(args)),
      update: vi.fn((args: unknown) => Promise.resolve(args)),
    },
  };
}

describe('Propiedad de cuentas y categorías referenciadas', () => {
  let prisma: ReturnType<typeof createPrismaMock>;

  beforeEach(() => {
    prisma = createPrismaMock();
  });

  describe('TransactionsService', () => {
    let service: TransactionsService;
    const base = { type: 'EXPENSE' as const, amount: 1000, date: '2026-09-01' };

    beforeEach(() => {
      service = new TransactionsService(prisma as unknown as PrismaService);
    });

    it('crea la transacción con cuenta y categoría propias', async () => {
      await service.create(ALICE, { ...base, accountId: 'acc-alice', categoryId: 'cat-alice' });
      expect(prisma.transaction.create).toHaveBeenCalled();
    });

    it('rechaza crear en una cuenta de otro usuario', async () => {
      await expect(service.create(ALICE, { ...base, accountId: 'acc-bob' })).rejects.toThrow(NotFoundException);
      expect(prisma.transaction.create).not.toHaveBeenCalled();
    });

    it('rechaza crear con una categoría de otro usuario', async () => {
      await expect(
        service.create(ALICE, { ...base, accountId: 'acc-alice', categoryId: 'cat-bob' }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.transaction.create).not.toHaveBeenCalled();
    });

    it('rechaza mover una transacción a una cuenta de otro usuario', async () => {
      await expect(service.update(ALICE, 'tx-alice', { accountId: 'acc-bob' })).rejects.toThrow(NotFoundException);
      expect(prisma.transaction.update).not.toHaveBeenCalled();
    });

    it('rechaza asignar una categoría de otro usuario al editar', async () => {
      await expect(service.update(ALICE, 'tx-alice', { categoryId: 'cat-bob' })).rejects.toThrow(NotFoundException);
      expect(prisma.transaction.update).not.toHaveBeenCalled();
    });

    it('permite quitar la categoría al editar', async () => {
      await service.update(ALICE, 'tx-alice', { categoryId: null });
      expect(prisma.transaction.update).toHaveBeenCalled();
    });
  });

  describe('RecurringPaymentsService', () => {
    let service: RecurringPaymentsService;
    const base = { name: 'Netflix', amount: 40000, dueDay: 5 };

    beforeEach(() => {
      service = new RecurringPaymentsService(prisma as unknown as PrismaService, {} as EmailService);
    });

    it('crea el pago con cuenta propia', async () => {
      await service.create(ALICE, { ...base, accountId: 'acc-alice', categoryId: 'cat-alice' });
      expect(prisma.recurringPayment.create).toHaveBeenCalled();
    });

    it('rechaza crear en una cuenta de otro usuario', async () => {
      await expect(service.create(ALICE, { ...base, accountId: 'acc-bob' })).rejects.toThrow(NotFoundException);
      expect(prisma.recurringPayment.create).not.toHaveBeenCalled();
    });

    it('rechaza crear con una categoría de otro usuario', async () => {
      await expect(
        service.create(ALICE, { ...base, accountId: 'acc-alice', categoryId: 'cat-bob' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('rechaza mover el pago a una cuenta de otro usuario', async () => {
      await expect(service.update(ALICE, 'rp-alice', { accountId: 'acc-bob' })).rejects.toThrow(NotFoundException);
      expect(prisma.recurringPayment.update).not.toHaveBeenCalled();
    });
  });

  describe('CategoriesService', () => {
    let service: CategoriesService;

    beforeEach(() => {
      service = new CategoriesService(prisma as unknown as PrismaService);
    });

    it('crea una subcategoría bajo una categoría propia', async () => {
      await service.create(ALICE, { name: 'Cine', type: 'EXPENSE', parentId: 'cat-alice' });
      expect(prisma.category.create).toHaveBeenCalled();
    });

    it('rechaza colgar una subcategoría de una categoría de otro usuario', async () => {
      await expect(
        service.create(ALICE, { name: 'Cine', type: 'EXPENSE', parentId: 'cat-bob' }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.category.create).not.toHaveBeenCalled();
    });

    it('rechaza mover una categoría bajo una de otro usuario', async () => {
      await expect(service.update(ALICE, 'cat-alice', { parentId: 'cat-bob' })).rejects.toThrow(NotFoundException);
      expect(prisma.category.update).not.toHaveBeenCalled();
    });

    it('rechaza que una categoría sea su propia padre', async () => {
      await expect(service.update(ALICE, 'cat-alice', { parentId: 'cat-alice' })).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
