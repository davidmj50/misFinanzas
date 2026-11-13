import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { BehaviorSubject, Subject, of } from 'rxjs';
import { AccountsService } from '../../core/services/accounts.service';
import { CategoriesService } from '../../core/services/categories.service';
import { DocumentUploadResult, ExpenseDocumentsService, ReceiptExpenseInput } from '../../core/services/expense-documents.service';
import { ReceiptReaderService, ReceiptReading } from '../../core/services/receipt-reader.service';
import { ExpenseDocumentsComponent } from './expense-documents.component';
describe('Registro con comprobantes', () => {
  const reading: ReceiptReading = { text: 'TIENDA PRUEBA\nFecha 2026-11-13\nTOTAL USD 100.00', method: 'OCR', warnings: [], suggestions: { date: '2026-11-13', merchant: 'TIENDA PRUEBA', amount: 100, currency: 'USD', warnings: [] } };
  function setup() {
    const params = new BehaviorSubject(convertToParamMap({}));
    const result: DocumentUploadResult = { transactionId: 'expense', documentIds: ['doc'], createdAt: '' };
    const service = { upload: vi.fn((_files: File[], _metadata: ReceiptExpenseInput | { requestId: string }, _transactionId?: string) => of(result)), list: vi.fn(() => of([])), expense: vi.fn(() => of({ id: 'expense', type: 'EXPENSE', amount: '50', accountId: 'bank', merchant: 'Original', date: '2026-11-13', tags: [] })), remove: vi.fn(() => of(undefined)), download: vi.fn(() => of(new Blob())) };
    const reader = { read: vi.fn((_file: File, _format: string, _progress: (value: string) => void, _signal: AbortSignal) => Promise.resolve(reading)) };
    TestBed.configureTestingModule({ providers: [
      { provide: ExpenseDocumentsService, useValue: service }, { provide: ReceiptReaderService, useValue: reader },
      { provide: AccountsService, useValue: { list: () => of([{ id: 'bank', type: 'BANK', currency: 'COP', archived: false }, { id: 'usd', type: 'BANK', currency: 'USD', archived: false }]) } },
      { provide: CategoriesService, useValue: { list: () => of([]) } }, { provide: ActivatedRoute, useValue: { queryParamMap: params } }, { provide: Router, useValue: { navigate: vi.fn(() => Promise.resolve(true)) } },
    ] });
    const component = TestBed.runInInjectionContext(() => new ExpenseDocumentsComponent()); component.ngOnInit();
    const choose = async () => { const file = new File([new Uint8Array([137,80,78,71,13,10,26,10])], 'recibo.png', { type: 'image/png' }); await component.chooseFiles({ target: { files: [file], value: '' } } as unknown as Event); return component.selected()[0].id; };
    return { component, service, reader, params, choose };
  }
  it('analiza sin escribir y solo copia los campos elegidos cuando se confirma', async () => {
    const { component, service, choose } = setup(); const id = await choose(); const originalDate = component.form.controls.date.value;
    await component.analyze(id); expect(service.upload).not.toHaveBeenCalled(); expect(component.form.controls.amount.value).toBe(0);
    component.readingOptions.controls.useDate.setValue(false); component.apply(id);
    expect(component.form.controls.date.value).toBe(originalDate); expect(component.form.controls.amount.value).toBe(100); expect(component.form.controls.merchant.value).toBe('TIENDA PRUEBA');
  });
  it('bloquea una moneda distinta hasta que se revise o se elija una cuenta compatible', async () => {
    const { component, service, choose } = setup(); const id = await choose(); await component.analyze(id); component.apply(id);
    component.save(); expect(service.upload).not.toHaveBeenCalled();
    component.form.controls.accountId.setValue('usd'); component.save();
    expect(service.upload).toHaveBeenCalledTimes(1); expect(service.upload.mock.calls[0][1]).toMatchObject({ accountId: 'usd', amount: 100 });
  });
  it('mantiene archivos, datos y clave de solicitud tras un error de red', async () => {
    const { component, service, choose } = setup(); await choose(); component.form.controls.amount.setValue(50);
    const pending = new Subject<DocumentUploadResult>(); service.upload.mockReturnValueOnce(pending);
    component.save(); pending.error({ status: 0 }); expect(component.hasPending()).toBe(true);
    component.form.controls.amount.setValue(999); component.save();
    expect(service.upload.mock.calls[1]).toEqual(service.upload.mock.calls[0]);
  });
  it('adjunta a un gasto existente sin aplicar datos OCR sobre ese movimiento', async () => {
    const { component, service, params, choose } = setup(); params.next(convertToParamMap({ transactionId: 'expense' }));
    const id = await choose(); await component.analyze(id); component.apply(id);
    expect(component.expense()?.merchant).toBe('Original'); component.save();
    expect(service.upload.mock.calls[0][1]).toEqual({ requestId: expect.any(String) }); expect(service.upload.mock.calls[0][2]).toBe('expense');
  });
  it('cancela una lectura y mantiene disponible el registro manual', async () => {
    const { component, reader, service, choose } = setup(); const id = await choose();
    reader.read.mockImplementationOnce((_file, _format, _progress, signal) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('Lectura cancelada.')))));
    const analyzing = component.analyze(id); component.cancelAnalysis(); await analyzing;
    expect(component.analyzingId()).toBeNull(); expect(component.selected()[0].error).toBe('Lectura cancelada.'); expect(service.upload).not.toHaveBeenCalled();
    component.form.controls.amount.setValue(50); component.save(); expect(service.upload).toHaveBeenCalledTimes(1);
  });
});
