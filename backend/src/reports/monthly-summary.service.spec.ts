import type { PrismaService } from '../prisma/prisma.service.js';
import type { EmailService } from '../email/email.service.js';
import type { AccountsService } from '../accounts/accounts.service.js';
import { MonthlySummaryService } from './monthly-summary.service.js';

describe('Correo de resumen mensual', () => {
  it('separa monedas y escapa los nombres sin enviar un correo real', async () => {
    const send = vi.fn(async () => true);
    const prisma = {
      user: { findMany: vi.fn(async () => [{ id: 'u', email: 'u@example.com', name: '<b>Usuario</b>', lastMonthlySummaryFor: null }]), update: vi.fn() },
      transaction: { groupBy: vi.fn().mockResolvedValueOnce([
        { type: 'INCOME', currency: 'COP', _sum: { amount: 100 } },
        { type: 'INCOME', currency: 'USD', _sum: { amount: 100 } },
      ]).mockResolvedValueOnce([{ categoryId: 'cat', currency: 'USD', _sum: { amount: 10 } }]) },
      category: { findMany: vi.fn(async () => [{ id: 'cat', name: '<b>Comida</b>' }]) },
      budget: { findMany: vi.fn(async () => []) },
      savingsGoal: { findMany: vi.fn(async () => []) },
    };
    const service = new MonthlySummaryService(
      prisma as unknown as PrismaService,
      { send } as unknown as EmailService,
      { findAll: async () => [{ name: '<b>Cuenta</b>', currency: 'USD', balance: 100 }] } as unknown as AccountsService,
    );
    await expect(service.run()).resolves.toEqual({ checked: 1, sent: 1 });
    for (const [query] of prisma.transaction.groupBy.mock.calls) expect(query.where.transferId).toBeNull();
    const html = (send.mock.calls[0] as unknown as [string, string, string])[2];
    expect(html).toContain('100 COP');
    expect(html).toContain('100 USD');
    expect(html).not.toContain('200');
    for (const name of ['Usuario', 'Comida', 'Cuenta']) {
      expect(html).toContain(`&lt;b&gt;${name}&lt;/b&gt;`);
      expect(html).not.toContain(`<b>${name}</b>`);
    }
  });
});
