import { TestBed } from '@angular/core/testing';
import { FormBuilder } from '@angular/forms';
import { of } from 'rxjs';
import { CategoriesComponent } from './categories.component';
import { CategoriesService } from '../../core/services/categories.service';

describe('Edición de categorías', () => {
  it('envía null cuando se quita la categoría padre', () => {
    const service = { update: vi.fn(() => of({})), list: () => of([]) };
    const component = TestBed.runInInjectionContext(() => new CategoriesComponent(new FormBuilder(), service as unknown as CategoriesService));
    component.openEdit({ id: 'child', name: 'Cine', type: 'EXPENSE', parentId: 'root', createdAt: '' });
    component.form.controls.parentId.setValue('');
    component.save();
    expect(service.update).toHaveBeenCalledWith('child', expect.objectContaining({ parentId: null }));
  });

  it('excluye descendientes y categorías de otro tipo de los posibles padres', () => {
    const component = TestBed.runInInjectionContext(() => new CategoriesComponent(new FormBuilder(), {} as CategoriesService));
    component.categories.set([
      { id: 'root', name: 'Ocio', type: 'EXPENSE', createdAt: '' },
      { id: 'child', name: 'Cine', type: 'EXPENSE', parentId: 'root', createdAt: '' },
      { id: 'salary', name: 'Sueldo', type: 'INCOME', createdAt: '' },
      { id: 'other', name: 'Comida', type: 'EXPENSE', createdAt: '' },
    ]);
    component.openEdit(component.categories()[0]);
    expect(component.parentCandidates().map(c => c.id)).toEqual(['other']);
  });
});
