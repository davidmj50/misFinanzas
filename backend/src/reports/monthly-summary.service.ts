import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { EmailService } from '../email/email.service.js';
import { AccountsService } from '../accounts/accounts.service.js';

const money = (n: number) => `$${Math.round(n).toLocaleString('es-CO')}`;

@Injectable()
export class MonthlySummaryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly accountsService: AccountsService,
  ) {}

  async run() {
    const now = new Date();
    const targetStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const targetEnd = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthKey = targetStart.toISOString().slice(0, 10);
    const monthLabel = targetStart.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });

    const users = await this.prisma.user.findMany();
    if (users.length === 0) return { checked: 0, sent: 0 };

    let sent = 0;
    for (const user of users) {
      const lastSent = user.lastMonthlySummaryFor?.toISOString().slice(0, 10) ?? null;
      if (lastSent === monthKey) continue;

      const html = await this.buildSummaryHtml(user, targetStart, targetEnd, monthLabel);
      const success = await this.emailService.send(user.email, `Tu resumen financiero de ${monthLabel}`, html);
      if (success) {
        await this.prisma.user.update({ where: { id: user.id }, data: { lastMonthlySummaryFor: targetStart } });
        sent += 1;
      }
    }

    return { checked: users.length, sent };
  }

  private async buildSummaryHtml(
    user: { id: string; name: string },
    targetStart: Date,
    targetEnd: Date,
    monthLabel: string,
  ): Promise<string> {
    const userId = user.id;

    const totals = await this.prisma.transaction.groupBy({
      by: ['type'],
      where: { userId, date: { gte: targetStart, lt: targetEnd } },
      _sum: { amount: true },
    });
    const totalIncome = Number(totals.find((t) => t.type === 'INCOME')?._sum.amount ?? 0);
    const totalExpense = Number(totals.find((t) => t.type === 'EXPENSE')?._sum.amount ?? 0);
    const net = totalIncome - totalExpense;

    const byCategory = await this.prisma.transaction.groupBy({
      by: ['categoryId'],
      where: { userId, type: 'EXPENSE', date: { gte: targetStart, lt: targetEnd } },
      _sum: { amount: true },
    });
    const categoryIds = byCategory.map((c) => c.categoryId).filter((id): id is string => id !== null);
    const categories = categoryIds.length
      ? await this.prisma.category.findMany({ where: { id: { in: categoryIds } } })
      : [];
    const categoryNameMap = new Map(categories.map((c) => [c.id, c.name]));
    const topCategories = byCategory
      .map((c) => ({
        name: (c.categoryId && categoryNameMap.get(c.categoryId)) || 'Sin categoría',
        total: Number(c._sum.amount ?? 0),
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);

    const budgets = await this.prisma.budget.findMany({ where: { userId }, include: { category: true } });
    let budgetSpentMap = new Map<string, number>();
    if (budgets.length > 0) {
      const budgetSpent = await this.prisma.transaction.groupBy({
        by: ['categoryId'],
        where: {
          userId,
          type: 'EXPENSE',
          categoryId: { in: budgets.map((b) => b.categoryId) },
          date: { gte: targetStart, lt: targetEnd },
        },
        _sum: { amount: true },
      });
      budgetSpentMap = new Map(
        budgetSpent
          .filter((s): s is typeof s & { categoryId: string } => s.categoryId !== null)
          .map((s) => [s.categoryId, Number(s._sum.amount ?? 0)]),
      );
    }

    const goals = await this.prisma.savingsGoal.findMany({
      where: { userId, archived: false },
      include: { contributions: true },
    });

    const accounts = await this.accountsService.findAll(userId);

    const rows = (items: string[]) => (items.length ? items.join('') : '<tr><td colspan="3">Sin datos.</td></tr>');

    const topCategoriesRows = rows(
      topCategories.map((c) => `<tr><td>${c.name}</td><td align="right">${money(c.total)}</td></tr>`),
    );

    const budgetRows = rows(
      budgets.map((b) => {
        const spent = budgetSpentMap.get(b.categoryId) ?? 0;
        const amount = Number(b.amount);
        const pct = amount > 0 ? Math.round((spent / amount) * 100) : 0;
        return `<tr><td>${b.category.name}</td><td align="right">${money(spent)} / ${money(amount)}</td><td align="right">${pct}%</td></tr>`;
      }),
    );

    const goalRows = rows(
      goals.map((g) => {
        const totalSaved = g.contributions.reduce((sum, c) => sum + Number(c.amount), 0);
        const contributedThisMonth = g.contributions
          .filter((c) => c.date >= targetStart && c.date < targetEnd)
          .reduce((sum, c) => sum + Number(c.amount), 0);
        const targetAmount = Number(g.targetAmount);
        const pct = targetAmount > 0 ? Math.round((totalSaved / targetAmount) * 100) : 0;
        const monthDelta = contributedThisMonth !== 0 ? money(contributedThisMonth) : '-';
        return `<tr><td>${g.name}</td><td align="right">${monthDelta}</td><td align="right">${money(totalSaved)} / ${money(targetAmount)} (${pct}%)</td></tr>`;
      }),
    );

    const accountRows = rows(
      accounts.map((a) => `<tr><td>${a.name}</td><td align="right">${money(a.balance ?? 0)}</td></tr>`),
    );

    return `
      <h2>Resumen de ${monthLabel}</h2>
      <p>Hola ${user.name}, así te fue el mes pasado:</p>
      <p>
        Ingresos: <strong>${money(totalIncome)}</strong><br/>
        Gastos: <strong>${money(totalExpense)}</strong><br/>
        Balance: <strong>${money(net)}</strong>
      </p>

      <h3>Principales categorías de gasto</h3>
      <table cellpadding="4">${topCategoriesRows}</table>

      <h3>Presupuestos</h3>
      <table cellpadding="4">${budgetRows}</table>

      <h3>Metas de ahorro</h3>
      <table cellpadding="4">${goalRows}</table>

      <h3>Saldo actual por cuenta</h3>
      <table cellpadding="4">${accountRows}</table>

      <p>— MisFinanzas</p>
    `;
  }
}
