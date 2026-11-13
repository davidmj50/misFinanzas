import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { QuickDraftStore, QuickFormValue } from './quick-draft.store';
import { AuthService } from './auth.service';
describe('Borradores de registro rápido', () => {
  const form: QuickFormValue = { accountId: 'account', categoryId: '', type: 'EXPENSE', amount: 10, currency: 'COP', date: '2026-11-13', merchant: 'Café', description: '' };
  let store: QuickDraftStore;
  beforeEach(() => { TestBed.configureTestingModule({}); store = new QuickDraftStore(); store.clearAll(); });
  afterEach(() => { vi.restoreAllMocks(); store.clearAll(); localStorage.removeItem('misfinanzas_token'); localStorage.removeItem('misfinanzas_user'); });
  it('recupera datos y solicitud pendientes únicamente para su propietario', () => {
    const pending = { ...form, amount: 10, categoryId: null, requestId: crypto.randomUUID() };
    expect(store.save('owner', form, pending)).toBe(true);
    expect(store.read('owner')).toMatchObject({ form, pending }); expect(store.read('other')).toBeNull();
  });
  it('ignora datos corruptos o un propietario alterado', () => {
    localStorage.setItem(store.key('owner'), '{'); expect(store.read('owner')).toBeNull();
    store.save('other', form, null); localStorage.setItem(store.key('owner'), localStorage.getItem(store.key('other'))!); expect(store.read('owner')).toBeNull();
  });
  it('informa si no se puede conservar un borrador', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage disabled'); });
    expect(store.save('owner', form, null)).toBe(false);
  });
  it('elimina borradores de otros usuarios sin alterar claves ajenas a esta función', () => {
    store.save('owner', form, null); store.save('other', form, null); localStorage.setItem('unrelated_test', 'keep');
    store.keepOnly('owner'); expect(store.read('owner')).not.toBeNull(); expect(store.read('other')).toBeNull(); expect(localStorage.getItem('unrelated_test')).toBe('keep'); localStorage.removeItem('unrelated_test');
  });
  it('el cierre explícito de sesión elimina el borrador', () => {
    TestBed.configureTestingModule({ providers: [{ provide: HttpClient, useValue: {} }, { provide: Router, useValue: { navigate: vi.fn() } }] });
    store.save('owner', form, null); TestBed.inject(AuthService).logout(); expect(store.read('owner')).toBeNull();
  });
  it('conserva un borrador al expirar la sesión y lo elimina si inicia sesión otro usuario', () => {
    const user = { id: 'other', email: 'other@test', name: 'Other', role: 'USER' };
    TestBed.configureTestingModule({ providers: [{ provide: HttpClient, useValue: { post: () => of({ accessToken: 'test', user }) } }, { provide: Router, useValue: { navigate: vi.fn() } }] });
    const auth = TestBed.inject(AuthService); store.save('owner', form, null); auth.logout(false); expect(store.read('owner')).not.toBeNull();
    auth.login({ email: 'other@test', password: 'unused' }).subscribe(); expect(store.read('owner')).toBeNull();
  });
});
