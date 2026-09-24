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
  ProgressComponent,
  RowComponent,
} from '@coreui/angular';
import { BudgetsService } from '../../core/services/budgets.service';
import { CategoriesService } from '../../core/services/categories.service';
import { Budget } from '../../core/models/budget.models';
import { Category } from '../../core/models/finance.models';

@Component({
  selector: 'app-budgets',
  templateUrl: './budgets.component.html',
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
    ProgressComponent,
    ReactiveFormsModule,
    RowComponent,
  ],
})
export class BudgetsComponent implements OnInit {
  readonly budgets = signal<Budget[]>([]);
  readonly expenseCategories = signal<Category[]>([]);
  readonly loading = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly modalVisible = signal(false);
  readonly editingId = signal<string | null>(null);

  readonly availableCategories = computed(() => {
    const usedCategoryIds = new Set(this.budgets().map((b) => b.categoryId));
    return this.expenseCategories().filter((c) => !usedCategoryIds.has(c.id));
  });

  readonly editingCategoryName = computed(() => {
    const id = this.editingId();
    if (!id) return null;
    return this.budgets().find((b) => b.id === id)?.category.name ?? null;
  });

  readonly form = this.fb.nonNullable.group({
    categoryId: ['', [Validators.required]],
    amount: [0, [Validators.required, Validators.min(0.01)]],
  });

  constructor(
    private readonly fb: FormBuilder,
    private readonly budgetsService: BudgetsService,
    private readonly categoriesService: CategoriesService,
  ) {}

  ngOnInit(): void {
    this.categoriesService.list().subscribe((categories) => {
      this.expenseCategories.set(categories.filter((c) => c.type === 'EXPENSE'));
    });
    this.load();
  }

  load() {
    this.loading.set(true);
    this.errorMessage.set(null);
    this.budgetsService.list().subscribe({
      next: (budgets) => {
        this.budgets.set(budgets);
        this.loading.set(false);
      },
      error: () => {
        this.errorMessage.set('No se pudieron cargar los presupuestos.');
        this.loading.set(false);
      },
    });
  }

  openCreate() {
    this.editingId.set(null);
    this.form.reset({ categoryId: '', amount: 0 });
    this.form.controls.categoryId.enable();
    this.modalVisible.set(true);
  }

  openEdit(budget: Budget) {
    this.editingId.set(budget.id);
    this.form.reset({ categoryId: budget.categoryId, amount: Number(budget.amount) });
    this.form.controls.categoryId.disable();
    this.modalVisible.set(true);
  }

  save() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const raw = this.form.getRawValue();
    const editingId = this.editingId();
    const request = editingId
      ? this.budgetsService.update(editingId, { amount: raw.amount })
      : this.budgetsService.create({ categoryId: raw.categoryId, amount: raw.amount });

    request.subscribe({
      next: () => {
        this.modalVisible.set(false);
        this.load();
      },
      error: (err) => this.errorMessage.set(err.error?.message ?? 'No se pudo guardar el presupuesto.'),
    });
  }

  remove(budget: Budget) {
    if (!confirm(`¿Eliminar el presupuesto de "${budget.category.name}"?`)) return;
    this.budgetsService.remove(budget.id).subscribe({
      next: () => this.load(),
      error: () => this.errorMessage.set('No se pudo eliminar el presupuesto.'),
    });
  }

  progressColor(percentage: number): string {
    if (percentage >= 100) return 'danger';
    if (percentage >= 80) return 'warning';
    return 'success';
  }
}
