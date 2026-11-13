import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { signal } from '@angular/core';
import { Subject, of, throwError } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { PwaService } from '../../core/services/pwa.service';
import { QuickDraftStore, QuickEntryInput } from '../../core/services/quick-draft.store';
import { QuickEntriesService } from '../../core/services/quick-entries.service';
import { AccountsService } from '../../core/services/accounts.service';
import { CategoriesService } from '../../core/services/categories.service';
import { QuickEntryComponent } from './quick-entry.component';
describe('Registro rápido', () => {
  const owner = 'quick-component-test';
  const setup = (online = true) => {
    const pwa = { online: signal(online) };
    const entries = { create: vi.fn((_input: QuickEntryInput) => of({ transactionId: 'transaction', createdAt: '' })) };
    const accounts = { list: vi.fn(() => of([{ id: 'bank', name: 'Banco', type: 'BANK', archived: false, currency: 'COP' }])) };
    TestBed.configureTestingModule({ providers: [
      { provide: AuthService, useValue: { currentUser: () => ({ id: owner }) } }, { provide: PwaService, useValue: pwa }, { provide: QuickEntriesService, useValue: entries }, { provide: AccountsService, useValue: accounts },
      { provide: CategoriesService, useValue: { list: () => of([{ id: 'food', type: 'EXPENSE', name: 'Alimentación' }]) } }, { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({}) }, queryParamMap: of(convertToParamMap({})) } },
    ] });
    const store = TestBed.inject(QuickDraftStore); store.clearAll();
    const create = () => { const component = TestBed.runInInjectionContext(() => new QuickEntryComponent()); component.ngOnInit(); return component; };
    return { component: create(), create, store, entries, accounts, pwa };
  };
  afterEach(() => { TestBed.inject(QuickDraftStore).clearAll(); });
  it('conserva un borrador sin conexión y lo recupera al abrir otra vez la pantalla', () => {
    const { component, create, store, entries, accounts } = setup(false);
    component.form.controls.amount.setValue(25); component.form.controls.merchant.setValue('Café');
    expect(store.read(owner)?.form.amount).toBe(25); const restored = create(); expect(restored.form.controls.merchant.value).toBe('Café');
    restored.save(); expect(entries.create).not.toHaveBeenCalled(); expect(accounts.list).not.toHaveBeenCalled();
  });
  it('reintenta exactamente los mismos datos después de un error de red', () => {
    const { component, entries } = setup(); component.form.controls.amount.setValue(10);
    const pending = new Subject<{ transactionId: string; createdAt: string }>(); entries.create.mockReturnValueOnce(pending);
    component.save(); pending.error({ status: 0 }); expect(component.pending()).not.toBeNull();
    component.form.controls.amount.setValue(999); component.save(); expect(entries.create.mock.calls[1]).toEqual(entries.create.mock.calls[0]);
  });
  it('requiere revisar el importe si cambia la moneda al actualizar las cuentas', () => {
    const { component, accounts, entries } = setup(); component.form.controls.amount.setValue(10);
    accounts.list.mockReturnValueOnce(of([{ id: 'bank', name: 'Banco', type: 'BANK', archived: false, currency: 'USD' }])); component.loadCatalog();
    expect(component.currencyMismatch()).toBe(true); component.save(); expect(entries.create).not.toHaveBeenCalled();
    component.confirmCurrency(); component.save(); expect(entries.create.mock.calls[0][0].currency).toBe('USD');
  });
  it('limpia categorías incompatibles y elimina el borrador al confirmar el guardado', () => {
    const { component, store, entries } = setup(); component.form.controls.amount.setValue(10); component.form.controls.categoryId.setValue('food'); component.form.controls.type.setValue('INCOME');
    expect(component.form.controls.categoryId.value).toBe(''); component.save(); expect(entries.create.mock.calls[0][0].type).toBe('INCOME');
    expect(store.read(owner)).toBeNull(); expect(component.successId()).toBe('transaction');
  });
  it('bloquea el envío de un borrador que cambió en otra ventana', () => {
    const { component, entries, store } = setup(); component.form.controls.amount.setValue(10);
    window.dispatchEvent(new StorageEvent('storage', { key: store.key('other') })); expect(component.externalChange()).toBe(false);
    window.dispatchEvent(new StorageEvent('storage', { key: store.key(owner) })); component.save(); expect(entries.create).not.toHaveBeenCalled();
    component.restore(); component.save(); expect(entries.create).toHaveBeenCalledTimes(1);
  });
  it('permite corregir un rechazo validado por el servidor sin perder los campos', () => {
    const { component, entries } = setup(); component.form.controls.amount.setValue(10); entries.create.mockReturnValueOnce(throwError(() => ({ status: 400, error: { message: 'Cuenta no disponible' } })));
    component.save(); expect(component.pending()).toBeNull(); expect(component.form.controls.amount.value).toBe(10); expect(entries.create).toHaveBeenCalledTimes(1);
  });
});
