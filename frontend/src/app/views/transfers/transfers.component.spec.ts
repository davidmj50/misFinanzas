import { TestBed } from '@angular/core/testing';
import { of, Subject } from 'rxjs';
import { AccountsService } from '../../core/services/accounts.service';
import { TransfersService } from '../../core/services/transfers.service';
import { Account } from '../../core/models/finance.models';
import { CreateTransferPayload, Transfer } from '../../core/models/transfer.models';
import { TransfersComponent } from './transfers.component';

describe('Transferencias', () => {
  const account = (id: string, currency: string, archived = false): Account => ({
    id, currency, archived, name: id, type: 'BANK', initialBalance: '0', createdAt: '', updatedAt: '',
  });
  const accounts = [account('source', 'COP'), account('cash', 'COP'), account('usd', 'USD'), account('old', 'COP', true)];
  const setup = () => {
    const service = { create: vi.fn((_payload: CreateTransferPayload) => of({ id: 'transfer' } as Transfer)), list: vi.fn(() => of({ items: [], total: 0, totalPages: 0, page: 1, pageSize: 25 })) };
    TestBed.configureTestingModule({ providers: [
      { provide: AccountsService, useValue: { list: () => of(accounts) } },
      { provide: TransfersService, useValue: service },
    ] });
    const component = TestBed.runInInjectionContext(() => new TransfersComponent());
    component.accounts.set(accounts);
    component.openCreate();
    component.form.controls.amount.setValue(100);
    return { component, service };
  };

  it('omite cuentas archivadas y el origen de las opciones de destino', () => {
    const { component } = setup();
    expect(component.activeAccounts().map(a => a.id)).toEqual(['source', 'cash', 'usd']);
    expect(component.destinationOptions().map(a => a.id)).toEqual(['cash', 'usd']);
    component.form.controls.fromAccountId.setValue('cash');
    expect(component.form.controls.toAccountId.value).toBe('');
  });

  it('envía una transferencia de la misma moneda sin un importe recibido independiente', () => {
    const { component, service } = setup();
    component.form.controls.destinationAmount.setValue(999);
    component.save();
    expect(service.create).toHaveBeenCalledWith(expect.objectContaining({ fromAccountId: 'source', toAccountId: 'cash', amount: 100 }));
    expect(service.create.mock.calls[0][0]).not.toHaveProperty('destinationAmount');
  });

  it('exige un importe recibido para el cambio de moneda', () => {
    const { component, service } = setup();
    component.form.controls.toAccountId.setValue('usd');
    expect(component.differentCurrencies()).toBe(true);
    component.save();
    expect(service.create).not.toHaveBeenCalled();
    component.form.controls.destinationAmount.setValue(0.03);
    component.save();
    expect(service.create).toHaveBeenCalledWith(expect.objectContaining({ destinationAmount: 0.03 }));
  });

  it('impide dobles envíos y conserva la clave al reintentar después de un error de conexión', () => {
    const { component, service } = setup();
    const pending = new Subject<Transfer>();
    service.create.mockReturnValueOnce(pending);
    component.save();
    component.save();
    expect(service.create).toHaveBeenCalledTimes(1);
    const first = service.create.mock.calls[0][0];
    pending.error({ status: 0 });
    expect(component.saving()).toBe(false);
    component.save();
    expect(service.create).toHaveBeenCalledTimes(2);
    expect(service.create.mock.calls[1][0]).toEqual(first);
  });
});
