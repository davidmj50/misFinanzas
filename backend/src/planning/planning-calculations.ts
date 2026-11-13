import { Prisma } from '@prisma/client';
import { dateKey, daysInMonth, utcDate } from '../common/dates.js';

export const monthlyDate = (year: number, month: number, day: number) => utcDate(year, month, Math.min(day, daysInMonth(year, month)));
export function monthlyDueDates(start: Date, end: Date, dueDay: number) {
  const result: Date[] = [];
  for (let offset = 0; utcDate(start.getUTCFullYear(), start.getUTCMonth() + offset) <= end; offset++) {
    const due = monthlyDate(start.getUTCFullYear(), start.getUTCMonth() + offset, dueDay);
    if (due >= start && due <= end) result.push(due);
  }
  return result;
}
// One occurrence per calendar month, even if the recurring payment's due day changes.
export const recurringRef = (id: string, dueDate: string) => `recurring:${id}:${dueDate.slice(0, 7)}`;
export function nextCardCycle(start: Date, closingDay: number, paymentDay: number) {
  let closing = monthlyDate(start.getUTCFullYear(), start.getUTCMonth(), closingDay);
  if (closing < start) closing = monthlyDate(start.getUTCFullYear(), start.getUTCMonth() + 1, closingDay);
  let due = monthlyDate(closing.getUTCFullYear(), closing.getUTCMonth(), paymentDay);
  if (due <= closing) due = monthlyDate(closing.getUTCFullYear(), closing.getUTCMonth() + 1, paymentDay);
  return { nextClosingDate: dateKey(closing), nextPaymentDate: dateKey(due) };
}
export function statementAmounts(statement: { total: Prisma.Decimal; minimumPayment: Prisma.Decimal; payments: { destinationAmount: Prisma.Decimal; date: Date }[] }, start: Date) {
  const tomorrow = utcDate(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + 1);
  const paid = statement.payments.filter(p => p.date < tomorrow).reduce((n, p) => n.plus(p.destinationAmount), new Prisma.Decimal(0));
  const scheduled = statement.payments.filter(p => p.date >= tomorrow).reduce((n, p) => n.plus(p.destinationAmount), new Prisma.Decimal(0));
  const positive = (n: Prisma.Decimal) => Prisma.Decimal.max(n, 0).toNumber();
  return { paid: paid.toNumber(), scheduled: scheduled.toNumber(), remaining: positive(statement.total.minus(paid)),
    unplanned: positive(statement.total.minus(paid).minus(scheduled)), minimumRemaining: positive(statement.minimumPayment.minus(paid)),
    minimumUnplanned: positive(statement.minimumPayment.minus(paid).minus(scheduled)) };
}
export interface ProjectionEvent {
  id: string;
  kind: 'TRANSACTION' | 'RECURRING' | 'CARD_PAYMENT';
  date: string;
  name: string;
  amount: number; // signed, in the selected account's currency
  recurringPaymentId?: string;
  dueDate?: string;
  statementId?: string;
}
export function projectBalance(opening: Prisma.Decimal, events: ProjectionEvent[], start: Date, days: number) {
  let balance = opening, minimum = opening, income = new Prisma.Decimal(0), expense = new Prisma.Decimal(0);
  let firstNegativeDate: string | null = opening.isNegative() ? dateKey(start) : null;
  const points: { date: string; balance: number }[] = [];
  const daily = new Map<string, Prisma.Decimal>();
  for (const event of events) {
    daily.set(event.date, (daily.get(event.date) ?? new Prisma.Decimal(0)).plus(event.amount));
    if (event.amount >= 0) income = income.plus(event.amount); else expense = expense.minus(event.amount);
  }
  for (let i = 0; i <= days; i++) {
    const key = dateKey(utcDate(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + i));
    balance = balance.plus(daily.get(key) ?? 0); minimum = Prisma.Decimal.min(minimum, balance);
    if (balance.isNegative() && !firstNegativeDate) firstNegativeDate = key;
    points.push({ date: key, balance: balance.toNumber() });
  }
  return { openingBalance: opening.toNumber(), closingBalance: balance.toNumber(), minimumBalance: minimum.toNumber(), firstNegativeDate,
    totalInflows: income.toNumber(), totalOutflows: expense.toNumber(), points };
}
