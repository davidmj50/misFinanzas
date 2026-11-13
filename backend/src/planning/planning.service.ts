import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { TransfersService } from '../transfers/transfers.service.js';
import { dateKey, today, utcDate } from '../common/dates.js';
import { CardPaymentDto, CardProfileDto, CardStatementDto, ProjectionDto, RecordRecurringDto } from './planning.dto.js';
import { monthlyDate, monthlyDueDates, nextCardCycle, projectBalance, recurringRef, statementAmounts, type ProjectionEvent } from './planning-calculations.js';

type Db = Prisma.TransactionClient;
const nextDay = (date: Date) => utcDate(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1);
@Injectable()
export class PlanningService {
  constructor(private readonly prisma: PrismaService, private readonly transfers: TransfersService) {}

  private async card(db: Db, userId: string, id: string) {
    const card = await db.account.findFirst({ where: { id, userId, type: 'CREDIT_CARD', archived: false } });
    if (!card) throw new NotFoundException('Tarjeta activa no encontrada');
    return card;
  }

  async configure(userId: string, id: string, dto: CardProfileDto) {
    return this.prisma.$transaction(async tx => {
      const card = await this.card(tx, userId, id);
      if (dto.paymentAccountId) {
        const source = await tx.account.findFirst({ where: { id: dto.paymentAccountId, userId, archived: false, type: { not: 'CREDIT_CARD' }, currency: card.currency } });
        if (!source) throw new BadRequestException('Elige una cuenta bancaria o efectivo activa en la misma moneda');
      }
      const data = { creditLimit: dto.creditLimit, closingDay: dto.closingDay, paymentDay: dto.paymentDay, paymentAccountId: dto.paymentAccountId || null };
      return tx.cardProfile.upsert({ where: { accountId: id }, create: { accountId: id, ...data }, update: data });
    });
  }

  async saveStatement(userId: string, dto: CardStatementDto, id?: string) {
    if (dto.closingDate > dateKey(today())) throw new BadRequestException('Registra un extracto cuyo corte ya haya ocurrido');
    if (dto.minimumPayment > dto.total) throw new BadRequestException('El pago mínimo no puede superar el total');
    if (dto.dueDate < dto.closingDate || (dto.plannedPaymentDate && dto.plannedPaymentDate < dto.closingDate)) throw new BadRequestException('El vencimiento y el pago previsto deben ser posteriores o iguales al corte');
    try {
      return await this.prisma.$transaction(async tx => {
        await this.card(tx, userId, dto.cardAccountId);
        if (id) {
          const current = await tx.cardStatement.findFirst({ where: { id, cardAccount: { userId } }, include: { payments: true } });
          if (!current) throw new NotFoundException('Extracto no encontrado');
          if (current.cardAccountId !== dto.cardAccountId) throw new BadRequestException('No puedes cambiar la tarjeta de un extracto');
          const paid = current.payments.reduce((n, p) => n.plus(p.destinationAmount), new Prisma.Decimal(0));
          if (paid.greaterThan(dto.total) || current.payments.some(p => p.date < new Date(dto.closingDate))) throw new BadRequestException('Los datos no son compatibles con los pagos registrados');
        }
        const data = { cardAccountId: dto.cardAccountId, closingDate: new Date(dto.closingDate), dueDate: new Date(dto.dueDate),
          plannedPaymentDate: dto.plannedPaymentDate ? new Date(dto.plannedPaymentDate) : null, total: dto.total, minimumPayment: dto.minimumPayment };
        return id ? tx.cardStatement.update({ where: { id }, data }) : tx.cardStatement.create({ data });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('Ya existe un extracto de esta tarjeta con esa fecha de corte');
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') throw new ConflictException('El extracto cambió mientras se guardaba. Recarga y vuelve a intentarlo.');
      throw error;
    }
  }

  async removeStatement(userId: string, id: string) {
    try {
      const deleted = await this.prisma.cardStatement.deleteMany({ where: { id, cardAccount: { userId } } });
      if (!deleted.count) throw new NotFoundException('Extracto no encontrado');
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') throw new ConflictException('El extracto tiene pagos vinculados. Elimina sus transferencias antes de borrarlo.');
      throw error;
    }
  }

  async pay(userId: string, id: string, dto: CardPaymentDto) {
    const statement = await this.prisma.cardStatement.findFirst({ where: { id, cardAccount: { userId } } });
    if (!statement) throw new NotFoundException('Extracto no encontrado');
    return this.transfers.create(userId, { ...dto, toAccountId: statement.cardAccountId, cardStatementId: id, description: 'Pago de extracto de tarjeta' });
  }

  async recordRecurring(userId: string, id: string, dto: RecordRecurringDto) {
    const payment = await this.prisma.recurringPayment.findFirst({ where: { id, userId }, include: { account: true, category: true } });
    if (!payment) throw new NotFoundException('Pago recurrente no encontrado');
    const externalRef = recurringRef(id, dto.dueDate);
    const where = { userId_externalRef: { userId, externalRef } };
    const verify = (transaction: { amount: Prisma.Decimal; date: Date }) => {
      if (!transaction.amount.equals(dto.amount) || dateKey(transaction.date) !== dto.date) throw new ConflictException('Este vencimiento ya está registrado con otros datos');
      return transaction;
    };
    const previous = await this.prisma.transaction.findUnique({ where });
    if (previous) return verify(previous);
    const due = new Date(dto.dueDate);
    if (dateKey(monthlyDate(due.getUTCFullYear(), due.getUTCMonth(), payment.dueDay)) !== dto.dueDate) throw new BadRequestException('La fecha no coincide con el vencimiento mensual de este pago');
    if (!payment.active || payment.account.archived) throw new BadRequestException('El pago o la cuenta están inactivos');
    if (payment.category && (payment.category.userId !== userId || payment.category.type !== 'EXPENSE')) throw new BadRequestException('Categoría no disponible');
    try {
      return await this.prisma.transaction.create({ data: { userId, accountId: payment.accountId, categoryId: payment.categoryId,
        type: 'EXPENSE', amount: dto.amount, currency: payment.account.currency, date: new Date(dto.date), description: payment.name, isRecurring: true, externalRef } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = await this.prisma.transaction.findUnique({ where });
        if (existing) return verify(existing);
      }
      throw error;
    }
  }

  async cards(userId: string) {
    const start = today();
    return this.prisma.$transaction(async tx => {
      const cards = await tx.account.findMany({ where: { userId, type: 'CREDIT_CARD', archived: false },
        include: { cardProfile: { include: { paymentAccount: true } }, cardStatements: { include: { payments: { include: { fromAccount: { select: { id: true, name: true } } }, orderBy: { date: 'desc' } } }, orderBy: { closingDate: 'desc' } } }, orderBy: { name: 'asc' } });
      const totals = await tx.transaction.groupBy({ by: ['accountId', 'type'], where: { userId, accountId: { in: cards.map(c => c.id) }, date: { lt: nextDay(start) } }, _sum: { amount: true } });
      const cardPayments = await tx.transfer.findMany({ where: { userId, toAccountId: { in: cards.map(c => c.id) } }, include: { fromAccount: { select: { id: true, name: true } } }, orderBy: { date: 'desc' } });
      return cards.map(card => {
        const balance = totals.filter(t => t.accountId === card.id).reduce((n, t) => t.type === 'INCOME' ? n.plus(t._sum.amount ?? 0) : n.minus(t._sum.amount ?? 0), new Prisma.Decimal(card.initialBalance));
        const profile = card.cardProfile;
        const { cardStatements, ...account } = card;
        return { ...account, asOf: dateKey(start), balance: balance.toNumber(), debt: Prisma.Decimal.max(balance.negated(), 0).toNumber(),
          availableCredit: profile ? Prisma.Decimal.max(profile.creditLimit.plus(balance), 0).toNumber() : null,
          utilization: profile ? Prisma.Decimal.max(balance.negated(), 0).div(profile.creditLimit).mul(100).toDecimalPlaces(2).toNumber() : null,
          ...(profile ? nextCardCycle(start, profile.closingDay, profile.paymentDay) : { nextClosingDate: null, nextPaymentDate: null }),
          statements: cardStatements.map((s, index) => {
            // Statements are snapshots: only the latest is payable/projected. It includes carried debt.
            const payments = index === 0 ? cardPayments.filter(p => p.toAccountId === card.id && (p.cardStatementId === s.id || p.date > s.closingDate)) : s.payments;
            const amounts = statementAmounts({ ...s, payments }, start);
            return { ...s, payments, ...amounts, isLatest: index === 0, overdue: index === 0 && s.dueDate < start && amounts.remaining > 0,
              scheduledLate: payments.some(p => p.date > s.dueDate && p.date >= nextDay(start)) };
          }),
        };
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }

  async projection(userId: string, dto: ProjectionDto) {
    const start = today(), end = utcDate(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + dto.days);
    return this.prisma.$transaction(async tx => {
      const account = await tx.account.findFirst({ where: { id: dto.accountId, userId, archived: false }, include: { cardProfile: true } });
      if (!account) throw new NotFoundException('Cuenta activa no encontrada');
      const totals = await tx.transaction.groupBy({ by: ['type'], where: { userId, accountId: account.id, date: { lt: nextDay(start) } }, _sum: { amount: true } });
      const opening = totals.reduce((n, t) => t.type === 'INCOME' ? n.plus(t._sum.amount ?? 0) : n.minus(t._sum.amount ?? 0), new Prisma.Decimal(account.initialBalance));
      const future = await tx.transaction.findMany({ where: { userId, accountId: account.id, date: { gte: nextDay(start), lt: nextDay(end) } }, orderBy: [{ date: 'asc' }, { id: 'asc' }] });
      const events: ProjectionEvent[] = future.map(t => ({ id: t.id, kind: 'TRANSACTION', date: dateKey(t.date), name: t.description || t.merchant || 'Movimiento registrado', amount: Number(t.amount) * (t.type === 'INCOME' ? 1 : -1) }));
      if (dto.includeRecurring) {
        const payments = await tx.recurringPayment.findMany({ where: { userId, accountId: account.id, active: true } });
        const occurrences = payments.flatMap(p => monthlyDueDates(start, end, p.dueDay).map(due => ({ payment: p, date: dateKey(due), ref: recurringRef(p.id, dateKey(due)) })));
        const recorded = await tx.transaction.findMany({ where: { userId, externalRef: { in: occurrences.map(o => o.ref) } }, select: { externalRef: true } });
        const refs = new Set(recorded.map(t => t.externalRef));
        events.push(...occurrences.filter(o => !refs.has(o.ref)).map(o => ({ id: o.ref, kind: 'RECURRING' as const, date: o.date, name: o.payment.name, amount: -Number(o.payment.amount), recurringPaymentId: o.payment.id, dueDate: o.date })));
      }
      const statements = await tx.cardStatement.findMany({ where: { cardAccount: { userId, archived: false }, OR: [{ cardAccountId: account.id }, { cardAccount: { cardProfile: { paymentAccountId: account.id } } }] }, include: { payments: true, cardAccount: { include: { cardProfile: { include: { paymentAccount: true } } } } } });
      const cardPayments = await tx.transfer.findMany({ where: { userId, toAccountId: { in: statements.map(s => s.cardAccountId) } } });
      for (const statement of statements) {
        if (statements.some(s => s.cardAccountId === statement.cardAccountId && s.closingDate > statement.closingDate)) continue;
        const source = statement.cardAccount.cardProfile?.paymentAccount;
        if (!source || source.archived || source.currency !== statement.cardAccount.currency || source.type === 'CREDIT_CARD') continue;
        const payments = cardPayments.filter(p => p.toAccountId === statement.cardAccountId && (p.cardStatementId === statement.id || p.date > statement.closingDate));
        const pending = statementAmounts({ ...statement, payments }, start);
        const amount = dto.paymentMode === 'MINIMUM' ? pending.minimumUnplanned : pending.unplanned;
        const plannedDate = statement.plannedPaymentDate ?? statement.dueDate;
        const effective = plannedDate < start ? start : plannedDate;
        if (effective > end || !amount) continue;
        events.push({ id: `statement:${statement.id}`, kind: 'CARD_PAYMENT', date: dateKey(effective), dueDate: dateKey(statement.dueDate), statementId: statement.id,
          name: `Pago ${dto.paymentMode === 'MINIMUM' ? 'mínimo' : 'total'} ${statement.cardAccount.name} · corte ${dateKey(statement.closingDate)}`,
          amount: account.id === source.id ? -amount : amount });
      }
      events.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
      const calculated = projectBalance(opening, events, start, dto.days);
      return { account: { id: account.id, name: account.name, type: account.type, currency: account.currency }, asOf: dateKey(start), through: dateKey(end),
        paymentMode: dto.paymentMode, includeRecurring: dto.includeRecurring, ...calculated, events,
        firstOverLimitDate: account.cardProfile ? opening.lessThan(account.cardProfile.creditLimit.negated()) ? dateKey(start) : calculated.points.find(p => p.balance < -Number(account.cardProfile!.creditLimit))?.date ?? null : null };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
}
