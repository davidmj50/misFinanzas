import { Component, OnInit, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  AlertComponent,
  BadgeComponent,
  ButtonCloseDirective,
  ButtonDirective,
  CardBodyComponent,
  CardComponent,
  CardHeaderComponent,
  ColComponent,
  FormCheckComponent,
  FormCheckInputDirective,
  FormCheckLabelDirective,
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
import { RecurringPaymentsService } from '../../core/services/recurring-payments.service';
import { AccountsService } from '../../core/services/accounts.service';
import { CategoriesService } from '../../core/services/categories.service';
import { RecurringPayment } from '../../core/models/recurring-payment.models';
import { Account, Category } from '../../core/models/finance.models';

@Component({
  selector: 'app-recurring-payments',
  templateUrl: './recurring-payments.component.html',
  imports: [
    AlertComponent,
    BadgeComponent,
    ButtonCloseDirective,
    ButtonDirective,
    CardBodyComponent,
    CardComponent,
    CardHeaderComponent,
    ColComponent,
    DecimalPipe,
    FormCheckComponent,
    FormCheckInputDirective,
    FormCheckLabelDirective,
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
export class RecurringPaymentsComponent implements OnInit {
  readonly payments = signal<RecurringPayment[]>([]);
  readonly accounts = signal<Account[]>([]);
  readonly expenseCategories = signal<Category[]>([]);
  readonly loading = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly modalVisible = signal(false);
  readonly editingId = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    accountId: ['', [Validators.required]],
    categoryId: [''],
    amount: [0, [Validators.required, Validators.min(0.01)]],
    dueDay: [1, [Validators.required, Validators.min(1), Validators.max(31)]],
    active: [true],
  });

  constructor(
    private readonly fb: FormBuilder,
    private readonly recurringPaymentsService: RecurringPaymentsService,
    private readonly accountsService: AccountsService,
    private readonly categoriesService: CategoriesService,
  ) {}

  ngOnInit(): void {
    this.accountsService.list().subscribe((accounts) => this.accounts.set(accounts));
    this.categoriesService.list().subscribe((categories) => {
      this.expenseCategories.set(categories.filter((c) => c.type === 'EXPENSE'));
    });
    this.load();
  }

  load() {
    this.loading.set(true);
    this.errorMessage.set(null);
    this.recurringPaymentsService.list().subscribe({
      next: (payments) => {
        this.payments.set(payments);
        this.loading.set(false);
      },
      error: () => {
        this.errorMessage.set('No se pudieron cargar los pagos recurrentes.');
        this.loading.set(false);
      },
    });
  }

  openCreate() {
    this.editingId.set(null);
    this.form.reset({
      name: '',
      accountId: this.accounts()[0]?.id ?? '',
      categoryId: '',
      amount: 0,
      dueDay: 1,
      active: true,
    });
    this.modalVisible.set(true);
  }

  openEdit(payment: RecurringPayment) {
    this.editingId.set(payment.id);
    this.form.reset({
      name: payment.name,
      accountId: payment.accountId,
      categoryId: payment.categoryId ?? '',
      amount: Number(payment.amount),
      dueDay: payment.dueDay,
      active: payment.active,
    });
    this.modalVisible.set(true);
  }

  save() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const raw = this.form.getRawValue();
    const payload = { ...raw, categoryId: raw.categoryId || undefined };
    const editingId = this.editingId();
    const request = editingId
      ? this.recurringPaymentsService.update(editingId, payload)
      : this.recurringPaymentsService.create(payload);

    request.subscribe({
      next: () => {
        this.modalVisible.set(false);
        this.load();
      },
      error: (err) => this.errorMessage.set(err.error?.message ?? 'No se pudo guardar el pago recurrente.'),
    });
  }

  toggleActive(payment: RecurringPayment) {
    this.recurringPaymentsService.update(payment.id, { active: !payment.active }).subscribe({
      next: () => this.load(),
      error: () => this.errorMessage.set('No se pudo actualizar el pago recurrente.'),
    });
  }

  remove(payment: RecurringPayment) {
    if (!confirm(`¿Eliminar el pago recurrente "${payment.name}"?`)) return;
    this.recurringPaymentsService.remove(payment.id).subscribe({
      next: () => this.load(),
      error: () => this.errorMessage.set('No se pudo eliminar el pago recurrente.'),
    });
  }

  dueBadgeColor(days: number): string {
    if (days <= 1) return 'danger';
    if (days <= 5) return 'warning';
    return 'info';
  }

  dueLabel(days: number): string {
    if (days === 0) return 'Vence hoy';
    if (days === 1) return 'Vence mañana';
    return `Vence en ${days} días`;
  }
}
