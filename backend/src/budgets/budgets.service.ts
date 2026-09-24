import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateBudgetDto } from './dto/create-budget.dto.js';
import { UpdateBudgetDto } from './dto/update-budget.dto.js';

@Injectable()
export class BudgetsService {
  constructor(private readonly prisma: PrismaService) {}

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

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const spentByCategory = await this.prisma.transaction.groupBy({
      by: ['categoryId'],
      where: {
        userId,
        type: 'EXPENSE',
        categoryId: { in: budgets.map((b) => b.categoryId) },
        date: { gte: monthStart, lt: monthEnd },
      },
      _sum: { amount: true },
    });
    const spentMap = new Map(spentByCategory.map((s) => [s.categoryId, Number(s._sum.amount ?? 0)]));

    return budgets.map((budget) => {
      const spent = spentMap.get(budget.categoryId) ?? 0;
      const amount = Number(budget.amount);
      return {
        ...budget,
        spent,
        remaining: amount - spent,
        percentage: amount > 0 ? Math.round((spent / amount) * 100) : 0,
      };
    });
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
