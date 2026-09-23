import { Component, OnInit, computed, signal } from '@angular/core';
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
import { AccountsService } from '../../core/services/accounts.service';
import { CategoriesService } from '../../core/services/categories.service';
import { TransactionsService } from '../../core/services/transactions.service';
import { Account, Category, Transaction, TransactionType } from '../../core/models/finance.models';

@Component({
  selector: 'app-transactions',
  templateUrl: './transactions.component.html',
  imports: [
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
    ReactiveFormsModule,
    RowComponent,
    TableDirective,
  ],
})
export class TransactionsComponent implements OnInit {
  readonly transactions = signal<Transaction[]>([]);
  readonly accounts = signal<Account[]>([]);
  readonly categories = signal<Category[]>([]);
  readonly loading = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly modalVisible = signal(false);
  readonly editingId = signal<string | null>(null);

  readonly page = signal(1);
  readonly totalPages = signal(1);
  readonly total = signal(0);

  readonly filterForm = this.fb.nonNullable.group({
    accountId: [''],
    categoryId: [''],
    type: [''],
    dateFrom: [''],
    dateTo: [''],
    search: [''],
  });

  readonly form = this.fb.nonNullable.group({
    accountId: ['', [Validators.required]],
    categoryId: [''],
    type: ['EXPENSE' as TransactionType, [Validators.required]],
    amount: [0, [Validators.required, Validators.min(0.01)]],
    date: [new Date().toISOString().slice(0, 10), [Validators.required]],
    merchant: [''],
    description: [''],
    paymentMethod: [''],
    tags: [''],
    isRecurring: [false],
    notes: [''],
  });

  readonly categoriesForType = computed(() => {
    const type = this.form.controls.type.value;
    return this.categories().filter((c) => c.type === type);
  });

  constructor(
    private readonly fb: FormBuilder,
    private readonly transactionsService: TransactionsService,
    private readonly accountsService: AccountsService,
    private readonly categoriesService: CategoriesService,
  ) {}

  ngOnInit(): void {
    this.accountsService.list().subscribe((accounts) => this.accounts.set(accounts));
    this.categoriesService.list().subscribe((categories) => this.categories.set(categories));
    this.load();
  }

  load() {
    this.loading.set(true);
    this.errorMessage.set(null);
    const filters = this.filterForm.getRawValue();
    this.transactionsService
      .list({
        accountId: filters.accountId || undefined,
        categoryId: filters.categoryId || undefined,
        type: (filters.type || undefined) as TransactionType | undefined,
        dateFrom: filters.dateFrom || undefined,
        dateTo: filters.dateTo || undefined,
        search: filters.search || undefined,
        page: this.page(),
        pageSize: 20,
      })
      .subscribe({
        next: (result) => {
          this.transactions.set(result.items);
          this.totalPages.set(result.totalPages);
          this.total.set(result.total);
          this.loading.set(false);
        },
        error: () => {
          this.errorMessage.set('No se pudieron cargar las transacciones.');
          this.loading.set(false);
        },
      });
  }

  applyFilters() {
    this.page.set(1);
    this.load();
  }

  clearFilters() {
    this.filterForm.reset({ accountId: '', categoryId: '', type: '', dateFrom: '', dateTo: '', search: '' });
    this.applyFilters();
  }

  goToPage(page: number) {
    if (page < 1 || page > this.totalPages()) return;
    this.page.set(page);
    this.load();
  }

  openCreate() {
    this.editingId.set(null);
    this.form.reset({
      accountId: this.accounts()[0]?.id ?? '',
      categoryId: '',
      type: 'EXPENSE',
      amount: 0,
      date: new Date().toISOString().slice(0, 10),
      merchant: '',
      description: '',
      paymentMethod: '',
      tags: '',
      isRecurring: false,
      notes: '',
    });
    this.modalVisible.set(true);
  }

  openEdit(transaction: Transaction) {
    this.editingId.set(transaction.id);
    this.form.reset({
      accountId: transaction.accountId,
      categoryId: transaction.categoryId ?? '',
      type: transaction.type,
      amount: Number(transaction.amount),
      date: transaction.date.slice(0, 10),
      merchant: transaction.merchant ?? '',
      description: transaction.description ?? '',
      paymentMethod: transaction.paymentMethod ?? '',
      tags: transaction.tags.join(', '),
      isRecurring: transaction.isRecurring,
      notes: transaction.notes ?? '',
    });
    this.modalVisible.set(true);
  }

  save() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const raw = this.form.getRawValue();
    const payload = {
      ...raw,
      categoryId: raw.categoryId || null,
      merchant: raw.merchant || undefined,
      description: raw.description || undefined,
      paymentMethod: raw.paymentMethod || undefined,
      notes: raw.notes || undefined,
      tags: raw.tags
        ? raw.tags.split(',').map((tag) => tag.trim()).filter(Boolean)
        : [],
    };

    const editingId = this.editingId();
    const request = editingId
      ? this.transactionsService.update(editingId, payload)
      : this.transactionsService.create(payload);

    request.subscribe({
      next: () => {
        this.modalVisible.set(false);
        this.load();
      },
      error: () => this.errorMessage.set('No se pudo guardar la transacción.'),
    });
  }

  remove(transaction: Transaction) {
    if (!confirm('¿Eliminar esta transacción?')) return;
    this.transactionsService.remove(transaction.id).subscribe({
      next: () => this.load(),
      error: () => this.errorMessage.set('No se pudo eliminar la transacción.'),
    });
  }
}
