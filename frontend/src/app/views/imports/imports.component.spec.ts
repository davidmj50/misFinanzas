import { TestBed } from '@angular/core/testing';
import { of, Subject } from 'rxjs';
import { AccountsService } from '../../core/services/accounts.service';
import { CategoriesService } from '../../core/services/categories.service';
import { ImportsService } from '../../core/services/imports.service';
import { ImportResult, ImportRow } from '../../core/models/import.models';
import { ImportsComponent } from './imports.component';

describe('Vista previa de importación', () => {
  const setup = async () => {
    const response: ImportResult = { batchId: 'batch', imported: 1, skipped: 0, total: 1, createdAt: '' };
    const service = {
      preview: vi.fn((_account: string, rows: ImportRow[]) => of({ currency: 'COP', rows: rows.map((row, i) => ({ rowId: row.rowId,
        status: i === 0 ? 'NEW' as const : 'DUPLICATE' as const, reason: 'test', canForce: i > 0,
        categoryId: 'auto-category', matchedRule: { id: 'rule', name: 'Regla automática' } })) })),
      commit: vi.fn((_account: string, _file: string, _id: string, _rows: ImportRow[]) => of(response)),
    };
    TestBed.configureTestingModule({ providers: [
      { provide: AccountsService, useValue: { list: () => of([{ id: 'account', name: 'Banco', currency: 'COP', archived: false }]) } },
      { provide: CategoriesService, useValue: { list: () => of([]) } },
      { provide: ImportsService, useValue: service },
    ] });
    const component = TestBed.runInInjectionContext(() => new ImportsComponent());
    component.ngOnInit();
    const file = new File(['Fecha;Monto;Descripción\n2026-11-12;-100;Compra\n2026-11-12;-100;Compra\nfecha mala;-10;Error'], 'extracto.csv');
    await component.chooseFile({ target: { files: [file] } } as unknown as Event);
    component.preview();
    return { component, service };
  };

  it('selecciona solo filas nuevas y muestra errores locales y duplicados', async () => {
    const { component, service } = await setup();
    expect(service.preview.mock.calls[0][1]).toHaveLength(2);
    expect(component.rows().map(r => r.status)).toEqual(['NEW', 'DUPLICATE', 'INVALID']);
    expect(component.selectedCount()).toBe(1);
    expect(component.rows()[0].payload?.currency).toBe('COP');
    component.commit();
    expect(service.commit.mock.calls[0][3]).toHaveLength(1);
    expect(service.commit.mock.calls[0][3][0]).toMatchObject({ rowId: 2, allowDuplicate: false });
  });

  it('solo incluye una coincidencia cuando el usuario la selecciona explícitamente', async () => {
    const { component, service } = await setup();
    component.toggle(3, true); component.commit();
    expect(service.commit.mock.calls[0][3]).toHaveLength(2);
    expect(service.commit.mock.calls[0][3][1]).toMatchObject({ rowId: 3, allowDuplicate: true });
  });

  it('conserva el mismo envío tras un error y bloquea cambios durante el reintento', async () => {
    const { component, service } = await setup();
    const pending = new Subject<ImportResult>();
    service.commit.mockReturnValueOnce(pending);
    component.commit(); component.commit();
    expect(service.commit).toHaveBeenCalledTimes(1);
    pending.error({ status: 0 });
    expect(component.hasPending()).toBe(true);
    component.toggle(3, true);
    expect(component.selectedCount()).toBe(1);
    component.commit();
    expect(service.commit.mock.calls[1]).toEqual(service.commit.mock.calls[0]);
  });

  it('invalida la revisión cuando cambian las columnas o formatos', async () => {
    const { component, service } = await setup();
    component.mapping.controls.dateFormat.setValue('DMY');
    expect(component.reviewed()).toBe(false); expect(component.rows()).toEqual([]);
    component.commit(); expect(service.commit).not.toHaveBeenCalled();
  });

  it('muestra la categoría sugerida y envía la selección manual revisada', async () => {
    const { component, service } = await setup();
    expect(component.rows()[0].payload?.categoryId).toBe('auto-category');
    expect(component.rows()[0].matchedRule?.name).toBe('Regla automática');
    component.changeCategory(2, 'manual-category');
    expect(component.rows()[0].matchedRule).toBeNull();
    component.commit();
    expect(service.commit.mock.calls[0][3][0].categoryId).toBe('manual-category');
  });

  it('permite dejar sin categoría y conserva esa decisión en reintentos', async () => {
    const { component, service } = await setup();
    component.changeCategory(2, '');
    const pending = new Subject<ImportResult>();
    service.commit.mockReturnValueOnce(pending);
    component.commit(); pending.error({ status: 0 });
    component.changeCategory(2, 'otra');
    expect(component.rows()[0].payload?.categoryId).toBeNull();
    component.commit();
    expect(service.commit.mock.calls[1][3][0].categoryId).toBeNull();
    expect(service.commit.mock.calls[1]).toEqual(service.commit.mock.calls[0]);
  });
});
