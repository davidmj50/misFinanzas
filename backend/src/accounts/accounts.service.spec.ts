import { BadRequestException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service.js';
import { AccountsService } from './accounts.service.js';

describe('Moneda de una cuenta', () => {
  it.each([[1, 0], [0, 1]])('impide reinterpretar el saldo si existen movimientos o pagos (%i/%i)', async (transactions, payments) => {
    const prisma = {
      account: { findUnique: async () => ({ id: 'acc', userId: 'u', currency: 'COP' }), update: vi.fn() },
      transaction: { count: async () => transactions },
      recurringPayment: { count: async () => payments },
    };
    const service = new AccountsService(prisma as unknown as PrismaService);
    await expect(service.update('u', 'acc', { currency: 'USD' })).rejects.toThrow(BadRequestException);
    expect(prisma.account.update).not.toHaveBeenCalled();
  });
});
