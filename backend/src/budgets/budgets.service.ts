import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { dateKey, monthRange } from '../common/dates.js';
import { EmailService } from '../email/email.service.js';
import { CreateBudgetDto } from './dto/create-budget.dto.js';
import { UpdateBudgetDto } from './dto/update-budget.dto.js';

const ALERT_THRESHOLDS = [100, 80];

@Injectable()
export class BudgetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) {}

  async create(userId: string, dto: CreateBudgetDto) {
    const category = await this.prisma.category.findUnique({ where: { id: dto.categoryId } });
    if (!category || category.userId !== userId) {
      throw new NotFoundException('Categoría no encontrada');
    }
    if (category.type !== 'EXPENSE') {
      throw new BadRequestException('Solo se pueden crear presupuestos para categorías de gasto');
    }

    try {
      return await this.prisma.budget.create({
        data: { userId, categoryId: dto.categoryId, amount: dto.amount },
        include: { category: true },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Ya existe un presupuesto para esta categoría');
      }
      throw error;
    }
  }

  async findAll(userId: string) {
    const budgets = await this.prisma.budget.findMany({
      where: { userId },
      include: { category: true },
      orderBy: { createdAt: 'asc' },
    });

    if (budgets.length === 0) return [];

    const spentMap = await this.spentThisMonthByCategory(
      userId,
      budgets.map((b) => b.categoryId),
    );

    return budgets.map((budget) => this.withProgress(budget, spentMap));
  }

  private withProgress<T extends { categoryId: string; amount: unknown }>(budget: T, spentMap: Map<string, number>) {
    const spent = spentMap.get(budget.categoryId) ?? 0;
    const amount = Number(budget.amount);
    return {
      ...budget,
      spent,
      remaining: amount - spent,
      percentage: amount > 0 ? Math.round((spent / amount) * 100) : 0,
    };
  }

  private async spentThisMonthByCategory(userId: string, categoryIds: string[]): Promise<Map<string, number>> {
    const { start: monthStart, end: monthEnd } = monthRange();

    const spentByCategory = await this.prisma.transaction.groupBy({
      by: ['categoryId'],
      where: { userId, type: 'EXPENSE', categoryId: { in: categoryIds }, date: { gte: monthStart, lt: monthEnd } },
      _sum: { amount: true },
    });
    return new Map(
      spentByCategory
        .filter((s): s is typeof s & { categoryId: string } => s.categoryId !== null)
        .map((s) => [s.categoryId, Number(s._sum.amount ?? 0)]),
    );
  }

  async checkAndSendAlerts() {
    const budgets = await this.prisma.budget.findMany({ include: { category: true, user: true } });
    if (budgets.length === 0) return { checked: 0, sent: 0 };

    const spentByUser = new Map<string, Map<string, number>>();
    for (const userId of new Set(budgets.map((b) => b.userId))) {
      const categoryIds = budgets.filter((b) => b.userId === userId).map((b) => b.categoryId);
      spentByUser.set(userId, await this.spentThisMonthByCategory(userId, categoryIds));
    }

    const monthKey = dateKey(monthRange().start);

    let sent = 0;
    for (const budget of budgets) {
      const spentMap = spentByUser.get(budget.userId)!;
      const { spent, percentage } = this.withProgress(budget, spentMap);

      const threshold = ALERT_THRESHOLDS.find((t) => percentage >= t);
      if (!threshold) continue;

      const lastAlertMonth = budget.lastAlertMonth?.toISOString().slice(0, 10) ?? null;
      const alreadyAlerted = lastAlertMonth === monthKey && (budget.lastAlertPercentage ?? 0) >= threshold;
      if (alreadyAlerted) continue;

      const amount = Number(budget.amount).toLocaleString('es-CO');
      const spentLabel = spent.toLocaleString('es-CO');
      const subject =
        threshold >= 100
          ? `Presupuesto superado: ${budget.category.name}`
          : `Presupuesto de ${budget.category.name} al ${percentage}%`;
      const html = `
        <p>Hola ${budget.user.name},</p>
        <p>Tu presupuesto de <strong>${budget.category.name}</strong> lleva <strong>$${spentLabel}</strong> de <strong>$${amount}</strong> este mes (<strong>${percentage}%</strong>).</p>
        <p>— MisFinanzas</p>
      `;

      const success = await this.emailService.send(budget.user.email, subject, html);
      if (success) {
        await this.prisma.budget.update({
          where: { id: budget.id },
          data: { lastAlertMonth: new Date(monthKey), lastAlertPercentage: threshold },
        });
        sent += 1;
      }
    }

    return { checked: budgets.length, sent };
  }

  private async findOwned(userId: string, id: string) {
    const budget = await this.prisma.budget.findUnique({ where: { id } });
    if (!budget) throw new NotFoundException('Presupuesto no encontrado');
    if (budget.userId !== userId) throw new ForbiddenException();
    return budget;
  }

  async update(userId: string, id: string, dto: UpdateBudgetDto) {
    await this.findOwned(userId, id);
    return this.prisma.budget.update({
      where: { id },
      data: { amount: dto.amount },
      include: { category: true },
    });
  }

  async remove(userId: string, id: string) {
    await this.findOwned(userId, id);
    await this.prisma.budget.delete({ where: { id } });
  }
}
