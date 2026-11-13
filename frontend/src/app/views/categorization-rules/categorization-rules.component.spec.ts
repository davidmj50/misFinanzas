import { TestBed } from '@angular/core/testing';
import { of, Subject } from 'rxjs';
import { CategorizationRulesComponent } from './categorization-rules.component';
import { CategorizationRule, CategorizationRulesService } from '../../core/services/categorization-rules.service';
import { AccountsService } from '../../core/services/accounts.service';
import { CategoriesService } from '../../core/services/categories.service';

describe('Administración de reglas', () => {
  const rule: CategorizationRule = { id: 'rule', name: 'Supermercado', field: 'ANY', operator: 'CONTAINS', pattern: 'super', priority: 10, active: true, categoryId: 'category', accountId: null, category: { id: 'category', name: 'Comida', type: 'EXPENSE' }, account: null };
  function setup() {
    const service = { list: vi.fn(() => of([rule])), save: vi.fn(() => of({})), remove: vi.fn(() => of(undefined)), test: vi.fn(() => of({ categoryId: null, categoryName: null, matchedRule: null })) };
    TestBed.configureTestingModule({ providers: [
      { provide: CategorizationRulesService, useValue: service },
      { provide: AccountsService, useValue: { list: () => of([{ id: 'account', archived: false }]) } },
      { provide: CategoriesService, useValue: { list: () => of([rule.category]) } },
    ] });
    const component = TestBed.runInInjectionContext(() => new CategorizationRulesComponent());
    component.ngOnInit(); return { component, service };
  }
  it('edita y desactiva una regla conservando alcance y prioridad', () => {
    const { component, service } = setup();
    component.edit(rule); component.form.controls.active.setValue(false); component.save();
    expect(service.save).toHaveBeenCalledWith({ name: 'Supermercado', field: 'ANY', operator: 'CONTAINS', pattern: 'super', priority: 10, active: false, categoryId: 'category', accountId: null }, 'rule');
    expect(component.editingId()).toBeUndefined();
  });
  it('bloquea guardados inválidos y envíos repetidos durante una petición', () => {
    const { component, service } = setup();
    component.save(); expect(service.save).not.toHaveBeenCalled();
    component.edit(rule); component.form.controls.pattern.setValue('   '); component.save();
    expect(service.save).not.toHaveBeenCalled();
    component.form.controls.pattern.setValue('super');
    const pending = new Subject<object>(); service.save.mockReturnValueOnce(pending);
    component.save(); component.save(); expect(service.save).toHaveBeenCalledTimes(1);
    pending.error({ error: { message: 'Error de prueba' } });
    expect(component.busy()).toBe(false); expect(component.form.controls.pattern.value).toBe('super'); expect(component.error()).toBe('Error de prueba');
  });
  it('prueba reglas sin escribir y limpia el resultado al cambiar el ejemplo', () => {
    const { component, service } = setup();
    component.testForm.controls.description.setValue('supermercado'); component.test();
    expect(service.test).toHaveBeenCalledWith({ accountId: 'account', type: 'EXPENSE', description: 'supermercado', merchant: '' });
    expect(component.testResult()?.categoryId).toBeNull();
    expect(service.save).not.toHaveBeenCalled();
    component.testForm.controls.type.setValue('INCOME'); expect(component.testResult()).toBeNull();
  });
});
