import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateRecurringPaymentDto } from './dto/create-recurring-payment.dto.js';
import { UpdateRecurringPaymentDto } from './dto/update-recurring-payment.dto.js';

@Injectable()
export class RecurringPaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  create(userId: string, dto: CreateRecurringPaymentDto) {
    return this.prisma.recurringPayment.create({
      data: { ...dto, userId },
      include: { account: true, category: true },
    });
  }

  async findAll(userId: string) {
    const payments = await this.prisma.recurringPayment.findMany({
      where: { userId },
      include: { account: true, category: true },
      orderBy: { dueDay: 'asc' },
    });

    return payments
      .map((payment) => ({ ...payment, ...this.computeDueInfo(payment.dueDay) }))
      .sort((a, b) => a.daysUntilDue - b.daysUntilDue);
  }

  private async findOwned(userId: string, id: string) {
    const payment = await this.prisma.recurringPayment.findUnique({ where: { id } });
    if (!payment) throw new NotFoundException('Pago recurrente no encontrado');
    if (payment.userId !== userId) throw new ForbiddenException();
    return payment;
  }

  async update(userId: string, id: string, dto: UpdateRecurringPaymentDto) {
    await this.findOwned(userId, id);
    return this.prisma.recurringPayment.update({
      where: { id },
      data: dto,
      include: { account: true, category: true },
    });
  }

  async remove(userId: string, id: string) {
    await this.findOwned(userId, id);
    await this.prisma.recurringPayment.delete({ where: { id } });
  }

  private computeDueInfo(dueDay: number) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const clampDay = (year: number, month: number) => {
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      return Math.min(dueDay, daysInMonth);
    };

    let year = today.getFullYear();
    let month = today.getMonth();
    let nextDueDate = new Date(year, month, clampDay(year, month));

    if (nextDueDate < today) {
      month += 1;
      if (month > 11) {
        month = 0;
        year += 1;
      }
      nextDueDate = new Date(year, month, clampDay(year, month));
    }

    const daysUntilDue = Math.round((nextDueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    return { nextDueDate: nextDueDate.toISOString(), daysUntilDue };
  }
}
