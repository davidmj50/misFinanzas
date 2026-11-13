import { Prisma } from '@prisma/client';
import { monthlyDate, monthlyDueDates, nextCardCycle, projectBalance, recurringRef, statementAmounts, type ProjectionEvent } from './planning-calculations.js';
const d = (value: string) => new Date(value);
const decimal = (value: number) => new Prisma.Decimal(value);
describe('Cálculos de planificación', () => {
  it('ajusta días de corte y pago a febrero y cruza el año', () => {
    expect(monthlyDate(2027, 1, 31).toISOString().slice(0, 10)).toBe('2027-02-28');
    expect(monthlyDate(2028, 1, 31).toISOString().slice(0, 10)).toBe('2028-02-29');
    expect(nextCardCycle(d('2026-12-30'), 31, 5)).toEqual({ nextClosingDate: '2026-12-31', nextPaymentDate: '2027-01-05' });
  });
  it('incluye el corte de hoy y desplaza el vencimiento si cae antes o el mismo día', () => {
    expect(nextCardCycle(d('2027-02-28'), 31, 28)).toEqual({ nextClosingDate: '2027-02-28', nextPaymentDate: '2027-03-28' });
    expect(nextCardCycle(d('2026-11-16'), 15, 25)).toEqual({ nextClosingDate: '2026-12-15', nextPaymentDate: '2026-12-25' });
  });
  it('separa pagos realizados y futuros y descuenta ambos del importe sin programar', () => {
    expect(statementAmounts({ total: decimal(400), minimumPayment: decimal(100), payments: [
      { destinationAmount: decimal(60), date: d('2026-11-12') }, { destinationAmount: decimal(80), date: d('2026-11-15') },
    ] }, d('2026-11-12'))).toEqual({ paid: 60, scheduled: 80, remaining: 340, unplanned: 260, minimumRemaining: 40, minimumUnplanned: 0 });
  });
  it('evita residuos decimales y detecta el primer déficit diario', () => {
    const events: ProjectionEvent[] = [{ id: '1', kind: 'TRANSACTION', name: 'Compra', date: '2026-11-13', amount: -0.1 }, { id: '2', kind: 'TRANSACTION', name: 'Compra', date: '2026-11-14', amount: -0.2 }];
    const result = projectBalance(decimal(0.2), events, d('2026-11-12'), 2);
    expect(result.closingBalance).toBe(-0.1); expect(result.totalOutflows).toBe(0.3); expect(result.firstNegativeDate).toBe('2026-11-14');
    expect(result.points).toEqual([{ date: '2026-11-12', balance: 0.2 }, { date: '2026-11-13', balance: 0.1 }, { date: '2026-11-14', balance: -0.1 }]);
  });
  it('mantiene el saldo sin eventos y contempla las previsiones pendientes de hoy', () => {
    expect(projectBalance(decimal(100), [], d('2026-11-12'), 30).points).toHaveLength(31);
    const result = projectBalance(decimal(100), [{ id: '1', kind: 'CARD_PAYMENT', date: '2026-11-12', name: 'Pago vencido', amount: -150 }], d('2026-11-12'), 1);
    expect(result.firstNegativeDate).toBe('2026-11-12'); expect(result.minimumBalance).toBe(-50);
  });
  it('asigna una sola referencia mensual aunque se cambie el día del recurrente', () => {
    expect(recurringRef('payment', '2026-11-12')).toBe(recurringRef('payment', '2026-11-25'));
    expect(recurringRef('payment', '2026-11-12')).not.toBe(recurringRef('payment', '2026-12-12'));
  });
  it('incluye el quinto mes natural cuando el horizonte de 90 días lo alcanza', () => {
    expect(monthlyDueDates(d('2027-01-31'), d('2027-05-01'), 1).map(x => x.toISOString().slice(0, 10))).toEqual(['2027-02-01', '2027-03-01', '2027-04-01', '2027-05-01']);
    expect(monthlyDueDates(d('2027-01-31'), d('2027-03-01'), 31).map(x => x.toISOString().slice(0, 10))).toEqual(['2027-01-31', '2027-02-28']);
  });
});
