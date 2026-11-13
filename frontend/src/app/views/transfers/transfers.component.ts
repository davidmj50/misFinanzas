import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { DecimalPipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import {
  AlertComponent, ButtonCloseDirective, ButtonDirective, CardBodyComponent, CardComponent, CardHeaderComponent,
  ColComponent, FormControlDirective, FormDirective, FormLabelDirective, FormSelectDirective,
  ModalBodyComponent, ModalComponent, ModalFooterComponent, ModalHeaderComponent, ModalTitleDirective,
  RowComponent, TableDirective,
} from '@coreui/angular';
import { AccountsService } from '../../core/services/accounts.service';
import { TransfersService } from '../../core/services/transfers.service';
import { Account } from '../../core/models/finance.models';
import { Transfer } from '../../core/models/transfer.models';
import { localDateString } from '../../core/utils/dates';

@Component({
  selector: 'app-transfers',
  templateUrl: './transfers.component.html',
  imports: [
    AlertComponent, ButtonCloseDirective, ButtonDirective, CardBodyComponent, CardComponent, CardHeaderComponent,
    ColComponent, DecimalPipe, FormControlDirective, FormDirective, FormLabelDirective, FormSelectDirective,
    ModalBodyComponent, ModalComponent, ModalFooterComponent, ModalHeaderComponent, ModalTitleDirective,
    ReactiveFormsModule, RowComponent, TableDirective,
  ],
})
export class TransfersComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly transfersService = inject(TransfersService);
  private readonly accountsService = inject(AccountsService);
  private readonly destroyRef = inject(DestroyRef);
  readonly accounts = signal<Account[]>([]);
  readonly activeAccounts = computed(() => this.accounts().filter(a => !a.archived));
  readonly transfers = signal<Transfer[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly deletingId = signal<string | null>(null);
  readonly modalVisible = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly formError = signal<string | null>(null);
  readonly page = signal(1);
  readonly totalPages = signal(1);
  readonly total = signal(0);
  readonly accountFilter = signal('');
  private requestId = '';
  readonly form = this.fb.nonNullable.group({
    fromAccountId: ['', Validators.required], toAccountId: ['', Validators.required],
    amount: [0, [Validators.required, Validators.min(0.01), Validators.max(999999999999.99)]],
    destinationAmount: [0], date: [localDateString(), Validators.required], description: ['', Validators.maxLength(500)],
  });
  private readonly sourceId = toSignal(this.form.controls.fromAccountId.valueChanges, { initialValue: '' });
  private readonly destinationId = toSignal(this.form.controls.toAccountId.valueChanges, { initialValue: '' });
  readonly source = computed(() => this.accounts().find(a => a.id === this.sourceId()));
  readonly destination = computed(() => this.accounts().find(a => a.id === this.destinationId()));
  readonly destinationOptions = computed(() => this.activeAccounts().filter(a => a.id !== this.sourceId()));
  readonly differentCurrencies = computed(() => !!this.source() && !!this.destination() && this.source()!.currency !== this.destination()!.currency);

  constructor() {
    this.form.controls.fromAccountId.valueChanges.pipe(takeUntilDestroyed()).subscribe((id) => {
      if (this.form.controls.toAccountId.value === id) this.form.controls.toAccountId.setValue('');
    });
  }

  ngOnInit() {
    this.refreshAccounts();
    this.load();
  }

  private message(error: { error?: { message?: string | string[] } }, fallback: string) {
    const message = error.error?.message;
    return Array.isArray(message) ? message.join('. ') : typeof message === 'string' ? message : fallback;
  }

  private refreshAccounts() {
    this.accountsService.list().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: accounts => this.accounts.set(accounts),
      error: () => this.errorMessage.set('No se pudieron cargar las cuentas.'),
    });
  }

  load() {
    this.loading.set(true);
    this.transfersService.list(this.page(), this.accountFilter()).pipe(
      takeUntilDestroyed(this.destroyRef), finalize(() => this.loading.set(false)),
    ).subscribe({
      next: result => {
        if (!result.items.length && this.page() > 1) { this.page.set(this.page() - 1); this.load(); return; }
        this.transfers.set(result.items); this.totalPages.set(result.totalPages); this.total.set(result.total);
      },
      error: error => this.errorMessage.set(this.message(error, 'No se pudieron cargar las transferencias.')),
    });
  }

  filterByAccount(accountId: string) {
    this.accountFilter.set(accountId); this.page.set(1); this.errorMessage.set(null); this.load();
  }

  goToPage(page: number) {
    if (page < 1 || page > this.totalPages() || this.loading()) return;
    this.page.set(page); this.load();
  }

  openCreate() {
    this.requestId = crypto.randomUUID();
    this.form.reset({ fromAccountId: this.activeAccounts()[0]?.id ?? '', toAccountId: this.activeAccounts()[1]?.id ?? '',
      amount: 0, destinationAmount: 0, date: localDateString(), description: '' });
    this.formError.set(null); this.modalVisible.set(true);
  }

  save() {
    if (this.saving()) return;
    this.formError.set(null);
    if (this.form.invalid) { this.form.markAllAsTouched(); this.formError.set('Revisa las cuentas, el importe y la fecha.'); return; }
    const raw = this.form.getRawValue();
    if (raw.fromAccountId === raw.toAccountId) { this.formError.set('Selecciona dos cuentas distintas.'); return; }
    if (this.differentCurrencies() && (!Number.isFinite(raw.destinationAmount) || raw.destinationAmount < 0.01 || raw.destinationAmount > 999999999999.99)) {
      this.formError.set('Indica un importe recibido válido.'); return;
    }
    this.saving.set(true);
    this.transfersService.create({
      fromAccountId: raw.fromAccountId, toAccountId: raw.toAccountId, amount: raw.amount,
      ...(this.differentCurrencies() ? { destinationAmount: raw.destinationAmount } : {}),
      date: raw.date, description: raw.description.trim() || undefined, requestId: this.requestId,
    }).pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.saving.set(false))).subscribe({
      next: () => { this.modalVisible.set(false); this.errorMessage.set(null); this.page.set(1); this.load(); this.refreshAccounts(); },
      error: error => this.formError.set(this.message(error, 'No se pudo guardar. Puedes reintentar el mismo envío sin duplicarlo.')),
    });
  }

  remove(transfer: Transfer) {
    if (this.deletingId() || !confirm('¿Eliminar la transferencia? Se eliminarán su salida y entrada y se recalcularán ambos saldos.')) return;
    this.deletingId.set(transfer.id);
    this.transfersService.remove(transfer.id).pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.deletingId.set(null))).subscribe({
      next: () => { this.errorMessage.set(null); this.load(); this.refreshAccounts(); },
      error: error => this.errorMessage.set(this.message(error, 'No se pudo eliminar la transferencia.')),
    });
  }
}
