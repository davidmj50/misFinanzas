import { Component, OnInit, computed, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  AlertComponent,
  ButtonCloseDirective,
  ButtonDirective,
  CardBodyComponent,
  CardComponent,
  CardHeaderComponent,
  ColComponent,
  FormControlDirective,
  FormDirective,
  FormLabelDirective,
  FormSelectDirective,
  ModalBodyComponent,
  ModalComponent,
  ModalFooterComponent,
  ModalHeaderComponent,
  ModalTitleDirective,
  RowComponent,
  TableDirective,
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
    AlertComponent,
    ButtonCloseDirective,
    ButtonDirective,
    CardBodyComponent,
    CardComponent,
    CardHeaderComponent,
    ColComponent,
    DecimalPipe,
    FormControlDirective,
    FormDirective,
    FormLabelDirective,
    FormSelectDirective,
    ModalBodyComponent,
    ModalComponent,
    ModalFooterComponent,
    ModalHeaderComponent,
    ModalTitleDirective,
    ReactiveFormsModule,
    RowComponent,
    TableDirective,
  ],
})
export class TransfersComponent implements OnInit {
  readonly transfers = signal<Transfer[]>([]);
  readonly accounts = signal<Account[]>([]);
  readonly loading = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly formError = signal<string | null>(null);
  readonly modalVisible = signal(false);

  readonly activeAccounts = computed(() => this.accounts().filter((a) => !a.archived));

  readonly form = this.fb.nonNullable.group({
    fromAccountId: ['', [Validators.required]],
    toAccountId: ['', [Validators.required]],
    amount: [0, [Validators.required, Validators.min(0.01)]],
    date: [localDateString(), [Validators.required]],
    description: [''],
  });

  constructor(
    private readonly fb: FormBuilder,
    private readonly transfersService: TransfersService,
    private readonly accountsService: AccountsService,
  ) {}

  ngOnInit(): void {
    this.accountsService.list().subscribe((accounts) => this.accounts.set(accounts));
    this.load();
  }

  load() {
    this.loading.set(true);
    this.errorMessage.set(null);
    this.transfersService.list().subscribe({
      next: (transfers) => {
        this.transfers.set(transfers);
        this.loading.set(false);
      },
      error: () => {
        this.errorMessage.set('No se pudieron cargar las transferencias.');
        this.loading.set(false);
      },
    });
  }

  openCreate() {
    this.formError.set(null);
    this.form.reset({ fromAccountId: '', toAccountId: '', amount: 0, date: localDateString(), description: '' });
    this.modalVisible.set(true);
  }

  save() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const raw = this.form.getRawValue();
    if (raw.fromAccountId === raw.toAccountId) {
      this.formError.set('La cuenta de origen y la de destino deben ser distintas.');
      return;
    }

    this.formError.set(null);
    this.transfersService
      .create({
        fromAccountId: raw.fromAccountId,
        toAccountId: raw.toAccountId,
        amount: raw.amount,
        date: raw.date,
        description: raw.description.trim() || undefined,
      })
      .subscribe({
        next: () => {
          this.modalVisible.set(false);
          this.load();
        },
        error: (err) => this.formError.set(err.error?.message ?? 'No se pudo guardar la transferencia.'),
      });
  }

  remove(transfer: Transfer) {
    const label = `${transfer.fromAccount.name} → ${transfer.toAccount.name}`;
    if (!confirm(`¿Eliminar la transferencia ${label} del ${transfer.date.slice(0, 10)}?`)) return;
    this.transfersService.remove(transfer.id).subscribe({
      next: () => this.load(),
      error: () => this.errorMessage.set('No se pudo eliminar la transferencia.'),
    });
  }
}
