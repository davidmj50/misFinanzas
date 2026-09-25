import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { EmailService } from '../email/email.service.js';
import { CreateRecurringPaymentDto } from './dto/create-recurring-payment.dto.js';
import { UpdateRecurringPaymentDto } from './dto/update-recurring-payment.dto.js';
import { assertAccountOwned, assertCategoryOwned } from '../common/ownership.js';

const REMINDER_THRESHOLD_DAYS = 3;

@Injectable()
export class RecurringPaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) {}

  async create(userId: string, dto: CreateRecurringPaymentDto) {
    await assertAccountOwned(this.prisma, userId, dto.accountId);
    if (dto.categoryId) await assertCategoryOwned(this.prisma, userId, dto.categoryId);
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
    if (dto.accountId) await assertAccountOwned(this.prisma, userId, dto.accountId);
    if (dto.categoryId) await assertCategoryOwned(this.prisma, userId, dto.categoryId);
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

  async checkAndSendReminders() {
    const payments = await this.prisma.recurringPayment.findMany({
      where: { active: true },
      include: { user: true, account: true },
    });

    let sent = 0;
    for (const payment of payments) {
      const { nextDueDate, daysUntilDue } = this.computeDueInfo(payment.dueDay);
      if (daysUntilDue > REMINDER_THRESHOLD_DAYS) continue;

      const nextDueDateOnly = nextDueDate.slice(0, 10);
      const lastNotified = payment.lastNotifiedFor?.toISOString().slice(0, 10) ?? null;
      if (lastNotified === nextDueDateOnly) continue;

      const amount = Number(payment.amount).toLocaleString('es-CO');
      const dueLabel = daysUntilDue <= 0 ? 'hoy' : daysUntilDue === 1 ? 'mañana' : `en ${daysUntilDue} días`;
      const subject = `Recordatorio: ${payment.name} vence ${dueLabel}`;
      const html = `
        <p>Hola ${payment.user.name},</p>
        <p>Tu pago recurrente <strong>${payment.name}</strong> por <strong>$${amount}</strong> vence <strong>${dueLabel}</strong> (${nextDueDateOnly}), cargado a la cuenta <strong>${payment.account.name}</strong>.</p>
        <p>— MisFinanzas</p>
      `;

      const success = await this.emailService.send(payment.user.email, subject, html);
      if (success) {
        await this.prisma.recurringPayment.update({
          where: { id: payment.id },
          data: { lastNotifiedFor: new Date(nextDueDateOnly) },
        });
        sent += 1;
      }
    }

    return { checked: payments.length, sent };
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
