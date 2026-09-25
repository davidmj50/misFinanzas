import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { daysBetween, today } from '../common/dates.js';
import { CreateSavingsGoalDto } from './dto/create-savings-goal.dto.js';
import { UpdateSavingsGoalDto } from './dto/update-savings-goal.dto.js';
import { CreateContributionDto } from './dto/create-contribution.dto.js';

@Injectable()
export class SavingsGoalsService {
  constructor(private readonly prisma: PrismaService) {}

  create(userId: string, dto: CreateSavingsGoalDto) {
    return this.prisma.savingsGoal.create({
      data: { ...dto, userId, targetDate: dto.targetDate ? new Date(dto.targetDate) : undefined },
    });
  }

  async findAll(userId: string) {
    const goals = await this.prisma.savingsGoal.findMany({
      where: { userId },
      include: { contributions: { orderBy: { date: 'desc' } } },
      orderBy: { createdAt: 'asc' },
    });

    return goals.map((goal) => this.withProgress(goal));
  }

  private async findOwned(userId: string, id: string) {
    const goal = await this.prisma.savingsGoal.findUnique({ where: { id } });
    if (!goal) throw new NotFoundException('Meta de ahorro no encontrada');
    if (goal.userId !== userId) throw new ForbiddenException();
    return goal;
  }

  async update(userId: string, id: string, dto: UpdateSavingsGoalDto) {
    await this.findOwned(userId, id);
    const goal = await this.prisma.savingsGoal.update({
      where: { id },
      data: { ...dto, targetDate: dto.targetDate ? new Date(dto.targetDate) : undefined },
      include: { contributions: { orderBy: { date: 'desc' } } },
    });
    return this.withProgress(goal);
  }

  async remove(userId: string, id: string) {
    await this.findOwned(userId, id);
    await this.prisma.savingsGoal.delete({ where: { id } });
  }

  async addContribution(userId: string, goalId: string, dto: CreateContributionDto) {
    await this.findOwned(userId, goalId);
    await this.prisma.savingsContribution.create({
      data: { ...dto, goalId, date: new Date(dto.date) },
    });
    const goal = await this.prisma.savingsGoal.findUniqueOrThrow({
      where: { id: goalId },
      include: { contributions: { orderBy: { date: 'desc' } } },
    });
    return this.withProgress(goal);
  }

  async removeContribution(userId: string, goalId: string, contributionId: string) {
    await this.findOwned(userId, goalId);
    const contribution = await this.prisma.savingsContribution.findUnique({ where: { id: contributionId } });
    if (!contribution || contribution.goalId !== goalId) throw new NotFoundException('Aporte no encontrado');
    await this.prisma.savingsContribution.delete({ where: { id: contributionId } });
    const goal = await this.prisma.savingsGoal.findUniqueOrThrow({
      where: { id: goalId },
      include: { contributions: { orderBy: { date: 'desc' } } },
    });
    return this.withProgress(goal);
  }

  private withProgress<T extends { targetAmount: unknown; targetDate: Date | null; contributions: { amount: unknown }[] }>(
    goal: T,
  ) {
    const saved = goal.contributions.reduce((sum, c) => sum + Number(c.amount), 0);
    const targetAmount = Number(goal.targetAmount);
    const remaining = targetAmount - saved;
    const percentage = targetAmount > 0 ? Math.round((saved / targetAmount) * 100) : 0;

    let daysRemaining: number | null = null;
    let suggestedMonthly: number | null = null;
    if (goal.targetDate) {
      daysRemaining = daysBetween(today(), goal.targetDate);
      const monthsRemaining = Math.max(daysRemaining / 30, 1 / 30);
      suggestedMonthly = remaining > 0 ? remaining / monthsRemaining : 0;
    }

    return { ...goal, saved, remaining, percentage, daysRemaining, suggestedMonthly };
  }
}
