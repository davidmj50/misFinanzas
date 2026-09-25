import type { PrismaService } from '../prisma/prisma.service.js';
import type { EmailService } from '../email/email.service.js';
import { RecurringPaymentsService } from '../recurring-payments/recurring-payments.service.js';
import { daysBetween, monthKey, monthRange, today, utcDate } from './dates.js';

// 30 de septiembre, 9:00 p. m. en Bogotá = 1 de octubre 02:00 UTC.
const BOGOTA_NIGHT_END_OF_MONTH = new Date('2026-10-01T02:00:00Z');

describe('dates', () => {
  const originalTz = process.env.APP_TIME_ZONE;
  afterEach(() => {
    if (originalTz === undefined) delete process.env.APP_TIME_ZONE;
    else process.env.APP_TIME_ZONE = originalTz;
  });

  it('today() usa la fecha de Bogotá, no la de UTC', () => {
    expect(today(BOGOTA_NIGHT_END_OF_MONTH).toISOString()).toBe('2026-09-30T00:00:00.000Z');
  });

  it('respeta APP_TIME_ZONE', () => {
    process.env.APP_TIME_ZONE = 'UTC';
    expect(today(BOGOTA_NIGHT_END_OF_MONTH).toISOString()).toBe('2026-10-01T00:00:00.000Z');
  });

  it('monthRange() devuelve el mes actual en Bogotá la noche del último día', () => {
    const { start, end } = monthRange(0, BOGOTA_NIGHT_END_OF_MONTH);
    expect(start.toISOString()).toBe('2026-09-01T00:00:00.000Z');
    expect(end.toISOString()).toBe('2026-10-01T00:00:00.000Z');
  });

  it('monthRange(-1) devuelve el mes anterior, cruzando el año', () => {
    const { start, end } = monthRange(-1, new Date('2026-01-15T12:00:00Z'));
    expect(start.toISOString()).toBe('2025-12-01T00:00:00.000Z');
    expect(end.toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });

  it('monthKey() agrupa por la fecha de calendario guardada', () => {
    // Una transacción del 1 de octubre se guarda como 2026-10-01T00:00Z; en hora local de
    // Bogotá sería el 30 de septiembre, pero debe contarse en octubre.
    expect(monthKey(new Date('2026-10-01T00:00:00Z'))).toBe('2026-10');
    expect(monthKey(new Date('2026-09-30T00:00:00Z'))).toBe('2026-09');
  });

  it('daysBetween() cuenta días de calendario', () => {
    expect(daysBetween(utcDate(2026, 8, 30), utcDate(2026, 9, 5))).toBe(5);
  });
});

describe('RecurringPaymentsService.computeDueInfo', () => {
  const service = new RecurringPaymentsService({} as PrismaService, {} as EmailService);

  it('la noche del 30 en Bogotá, un pago con día 30 vence hoy (no el mes siguiente)', () => {
    expect(service.computeDueInfo(30, BOGOTA_NIGHT_END_OF_MONTH)).toEqual({
      nextDueDate: '2026-09-30T00:00:00.000Z',
      daysUntilDue: 0,
    });
  });

  it('la noche del 30 en Bogotá, un pago con día 1 vence mañana', () => {
    expect(service.computeDueInfo(1, BOGOTA_NIGHT_END_OF_MONTH)).toEqual({
      nextDueDate: '2026-10-01T00:00:00.000Z',
      daysUntilDue: 1,
    });
  });

  it('ajusta el día 31 al último día de meses cortos', () => {
    expect(service.computeDueInfo(31, new Date('2026-02-10T15:00:00Z'))).toEqual({
      nextDueDate: '2026-02-28T00:00:00.000Z',
      daysUntilDue: 18,
    });
  });

  it('si el día ya pasó, pasa al mes siguiente cruzando el año', () => {
    expect(service.computeDueInfo(5, new Date('2026-12-20T15:00:00Z'))).toEqual({
      nextDueDate: '2027-01-05T00:00:00.000Z',
      daysUntilDue: 16,
    });
  });
});
