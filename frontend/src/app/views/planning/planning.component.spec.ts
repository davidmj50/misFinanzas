import { TestBed } from '@angular/core/testing';
import { of, Subject } from 'rxjs';
import { Account } from '../../core/models/finance.models';
import { AccountsService } from '../../core/services/accounts.service';
import { BalanceProjection, CardControl, CardStatement, PlanningService } from '../../core/services/planning.service';
import { PlanningComponent } from './planning.component';
describe('Tarjetas y proyección', () => {
  const card = { id: 'card', name: 'Tarjeta', currency: 'COP', cardProfile: { creditLimit: '1000', closingDay: 15, paymentDay: 5, paymentAccountId: 'bank' } } as CardControl;
  const statement = { id: 'statement', cardAccountId: 'card', closingDate: '2026-11-01', dueDate: '2026-11-20', total: '400', minimumPayment: '100', unplanned: 400, remaining: 400, isLatest: true } as CardStatement;
  function setup() {
    const forecast = { account: { id: 'bank', name: 'Banco', type: 'BANK', currency: 'COP' }, points: [], events: [], openingBalance: 1000, closingBalance: 600 } as unknown as BalanceProjection;
    const service = { cards: vi.fn(() => of([card])), projection: vi.fn(() => of(forecast)), configure: vi.fn(() => of({})), saveStatement: vi.fn(() => of({})), removeStatement: vi.fn(() => of(undefined)), pay: vi.fn(() => of({})), recordRecurring: vi.fn(() => of({})) };
    const accounts = [{ id: 'bank', type: 'BANK', currency: 'COP', archived: false }, { id: 'usd', type: 'BANK', currency: 'USD', archived: false }, { id: 'archived', type: 'CASH', currency: 'COP', archived: true }, { id: 'card', type: 'CREDIT_CARD', currency: 'COP', archived: false }] as Account[];
    TestBed.configureTestingModule({ providers: [{ provide: PlanningService, useValue: service }, { provide: AccountsService, useValue: { list: () => of(accounts) } }] });
    const component = TestBed.runInInjectionContext(() => new PlanningComponent()); component.ngOnInit();
    return { component, service, forecast };
  }
  it('separa las cuentas de pago por moneda y excluye tarjetas y cuentas archivadas', () => {
    const { component, service } = setup();
    expect(component.fundingAccounts('COP').map(a => a.id)).toEqual(['bank']);
    component.configure(card); component.cardForm.controls.paymentAccountId.setValue(''); component.saveCard();
    expect(service.configure).toHaveBeenCalledWith('card', { creditLimit: 1000, closingDay: 15, paymentDay: 5, paymentAccountId: null });
  });
  it('invalida la proyección al cambiar el escenario y evita mostrar una respuesta anterior', () => {
    const { component, service, forecast } = setup();
    const pending = new Subject<BalanceProjection>(); service.projection.mockReturnValueOnce(pending);
    component.calculate(); component.forecastForm.controls.days.setValue(90);
    pending.next(forecast); pending.complete();
    expect(component.projection()).toBeNull(); expect(component.projecting()).toBe(false);
    component.forecastForm.controls.paymentMode.setValue('MINIMUM'); component.calculate();
    expect(service.projection).toHaveBeenLastCalledWith({ accountId: 'bank', days: 90, paymentMode: 'MINIMUM', includeRecurring: true });
  });
  it('conserva los datos y la misma clave de pago después de un error de red', () => {
    const { component, service } = setup();
    component.openPayment(card, statement);
    const pending = new Subject<object>(); service.pay.mockReturnValueOnce(pending);
    component.pay(); component.pay(); expect(service.pay).toHaveBeenCalledTimes(1);
    pending.error({ status: 0 });
    expect(component.hasPendingPayment()).toBe(true);
    component.paymentForm.controls.amount.setValue(200); component.pay();
    expect(service.pay.mock.calls[1]).toEqual(service.pay.mock.calls[0]);
    expect(component.hasPendingPayment()).toBe(false);
  });
  it('vincula el importe real del recurrente a su vencimiento y conserva el envío al reintentar', () => {
    const { component, service } = setup();
    component.openRecurring({ id: 'event', kind: 'RECURRING', name: 'Servicio', date: '2026-11-20', dueDate: '2026-11-20', amount: -50, recurringPaymentId: 'recurring' });
    component.recurringForm.controls.amount.setValue(45);
    const pending = new Subject<object>(); service.recordRecurring.mockReturnValueOnce(pending);
    component.recordRecurring(); pending.error({ status: 0 });
    component.recurringForm.controls.amount.setValue(49); component.recordRecurring();
    expect(service.recordRecurring.mock.calls[1]).toEqual(service.recordRecurring.mock.calls[0]);
    expect(service.recordRecurring).toHaveBeenLastCalledWith('recurring', { dueDate: '2026-11-20', date: '2026-11-20', amount: 45 });
  });
  it('prepara el importe y la fecha del escenario al pagar desde un evento de la proyección', () => {
    const { component } = setup(); component.cards.set([{ ...card, statements: [statement] }]);
    component.payEvent({ id: 'event', kind: 'CARD_PAYMENT', name: 'Pago mínimo', amount: -100, date: '2026-11-20', statementId: statement.id });
    expect(component.paymentForm.getRawValue()).toEqual({ fromAccountId: 'bank', amount: 100, date: '2026-11-20' });
  });
});
