import { Component, OnInit, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ChartData, ChartOptions } from 'chart.js';
import { getStyle } from '@coreui/utils';
import {
  AlertComponent,
  BadgeComponent,
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
import { ChartjsComponent } from '@coreui/angular-chartjs';
import { AccountsService } from '../../core/services/accounts.service';
import { Account, AccountType } from '../../core/models/finance.models';

const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  BANK: 'Cuenta bancaria',
  CREDIT_CARD: 'Tarjeta de crédito',
  CASH: 'Efectivo',
};

@Component({
  selector: 'app-accounts',
  templateUrl: './accounts.component.html',
  imports: [
    AlertComponent,
    BadgeComponent,
    ButtonCloseDirective,
    ButtonDirective,
    CardBodyComponent,
    CardComponent,
    CardHeaderComponent,
    ChartjsComponent,
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
export class AccountsComponent implements OnInit {
  readonly accounts = signal<Account[]>([]);
  readonly loading = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly modalVisible = signal(false);
  readonly editingId = signal<string | null>(null);

  readonly historyModalVisible = signal(false);
  readonly historyAccount = signal<Account | null>(null);
  readonly historyLoading = signal(false);
  chartData: ChartData = { labels: [], datasets: [] };
  chartOptions: ChartOptions = {};

  readonly accountTypeLabel = ACCOUNT_TYPE_LABEL;
  readonly accountTypes: AccountType[] = ['BANK', 'CREDIT_CARD', 'CASH'];

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    type: ['BANK' as AccountType, [Validators.required]],
    institution: [''],
    currency: ['COP', [Validators.required]],
    initialBalance: [0, [Validators.required]],
  });

  constructor(
    private readonly fb: FormBuilder,
    private readonly accountsService: AccountsService,
  ) {}

  ngOnInit(): void {
    this.load();
  }

  load() {
    this.loading.set(true);
    this.errorMessage.set(null);
    this.accountsService.list().subscribe({
      next: (accounts) => {
        this.accounts.set(accounts);
        this.loading.set(false);
      },
      error: () => {
        this.errorMessage.set('No se pudieron cargar las cuentas.');
        this.loading.set(false);
      },
    });
  }

  openCreate() {
    this.editingId.set(null);
    this.form.reset({ name: '', type: 'BANK', institution: '', currency: 'COP', initialBalance: 0 });
    this.modalVisible.set(true);
  }

  openEdit(account: Account) {
    this.editingId.set(account.id);
    this.form.reset({
      name: account.name,
      type: account.type,
      institution: account.institution ?? '',
      currency: account.currency,
      initialBalance: Number(account.initialBalance),
    });
    this.modalVisible.set(true);
  }

  save() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const payload = this.form.getRawValue();
    const editingId = this.editingId();
    const request = editingId
      ? this.accountsService.update(editingId, payload)
      : this.accountsService.create(payload);

    request.subscribe({
      next: () => {
        this.modalVisible.set(false);
        this.load();
      },
      error: () => this.errorMessage.set('No se pudo guardar la cuenta.'),
    });
  }

  remove(account: Account) {
    if (!confirm(`¿Eliminar la cuenta "${account.name}"? Se eliminarán también sus transacciones.`)) {
      return;
    }
    this.accountsService.remove(account.id).subscribe({
      next: () => this.load(),
      error: () => this.errorMessage.set('No se pudo eliminar la cuenta.'),
    });
  }

  openHistory(account: Account) {
    this.historyAccount.set(account);
    this.historyModalVisible.set(true);
    this.historyLoading.set(true);
    this.accountsService.getBalanceHistory(account.id).subscribe({
      next: (points) => {
        this.buildChart(points);
        this.historyLoading.set(false);
      },
      error: () => {
        this.errorMessage.set('No se pudo cargar la evolución de la cuenta.');
        this.historyLoading.set(false);
      },
    });
  }

  private buildChart(points: { month: string; balance: number }[]) {
    const primary = getStyle('--cui-primary') ?? '#3b82f6';
    const primaryBg = `rgba(${getStyle('--cui-primary-rgb')}, .1)`;
    const borderColor = getStyle('--cui-border-color-translucent');
    const bodyColor = getStyle('--cui-body-color');

    this.chartData = {
      labels: points.map((p) => p.month),
      datasets: [
        {
          label: 'Saldo',
          data: points.map((p) => p.balance),
          borderColor: primary,
          backgroundColor: primaryBg,
          fill: true,
          tension: 0.3,
        },
      ],
    };

    this.chartOptions = {
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: borderColor, drawOnChartArea: false }, ticks: { color: bodyColor } },
        y: { grid: { color: borderColor }, ticks: { color: bodyColor } },
      },
    };
  }
}
