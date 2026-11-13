import { TestBed } from '@angular/core/testing';
import { FormBuilder } from '@angular/forms';
import { TransactionsComponent } from './transactions.component';
import { TransactionsService } from '../../core/services/transactions.service';
import { AccountsService } from '../../core/services/accounts.service';
import { CategoriesService } from '../../core/services/categories.service';

// Esta prueba ejercita el formulario; las descargas pertenecen a otro recorrido.
vi.mock('write-excel-file/browser', () => ({ default: vi.fn() }));
vi.mock('jspdf', () => ({ default: vi.fn() }));
vi.mock('jspdf-autotable', () => ({ default: vi.fn() }));

describe('Categorías de transacciones', () => {
  it('actualiza las opciones y limpia una categoría incompatible al cambiar a ingreso', () => {
    const component = TestBed.runInInjectionContext(() => new TransactionsComponent(
      new FormBuilder(), {} as TransactionsService, {} as AccountsService, {} as CategoriesService,
    ));
    component.categories.set([
      { id: 'food', name: 'Comida', type: 'EXPENSE', createdAt: '' },
      { id: 'salary', name: 'Sueldo', type: 'INCOME', createdAt: '' },
    ]);
    component.form.controls.categoryId.setValue('food');
    expect(component.categoriesForType().map(c => c.id)).toEqual(['food']);
    component.form.controls.type.setValue('INCOME');
    expect(component.categoriesForType().map(c => c.id)).toEqual(['salary']);
    expect(component.form.controls.categoryId.value).toBe('');
  });
});
