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
import { CategoriesService } from '../../core/services/categories.service';
import { Category, TransactionType } from '../../core/models/finance.models';

@Component({
  selector: 'app-categories',
  templateUrl: './categories.component.html',
  imports: [
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
    ReactiveFormsModule,
    RowComponent,
    TableDirective,
  ],
})
export class CategoriesComponent implements OnInit {
  readonly categories = signal<Category[]>([]);
  readonly loading = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly modalVisible = signal(false);
  readonly editingId = signal<string | null>(null);

  readonly topLevelCategories = computed(() => this.categories().filter((c) => !c.parentId));

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    type: ['EXPENSE' as TransactionType, [Validators.required]],
    parentId: [''],
  });

  constructor(
    private readonly fb: FormBuilder,
    private readonly categoriesService: CategoriesService,
  ) {}

  ngOnInit(): void {
    this.load();
  }

  load() {
    this.loading.set(true);
    this.errorMessage.set(null);
    this.categoriesService.list().subscribe({
      next: (categories) => {
        this.categories.set(categories);
        this.loading.set(false);
      },
      error: () => {
        this.errorMessage.set('No se pudieron cargar las categorías.');
        this.loading.set(false);
      },
    });
  }

  openCreate() {
    this.editingId.set(null);
    this.form.reset({ name: '', type: 'EXPENSE', parentId: '' });
    this.modalVisible.set(true);
  }

  openEdit(category: Category) {
    this.editingId.set(category.id);
    this.form.reset({
      name: category.name,
      type: category.type,
      parentId: category.parentId ?? '',
    });
    this.modalVisible.set(true);
  }

  save() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const raw = this.form.getRawValue();
    const payload = { ...raw, parentId: raw.parentId || undefined };
    const editingId = this.editingId();
    const request = editingId
      ? this.categoriesService.update(editingId, payload)
      : this.categoriesService.create(payload);

    request.subscribe({
      next: () => {
        this.modalVisible.set(false);
        this.load();
      },
      error: () => this.errorMessage.set('No se pudo guardar la categoría.'),
    });
  }

  parentName(category: Category): string {
    if (!category.parentId) return '—';
    return this.categories().find((c) => c.id === category.parentId)?.name ?? '—';
  }

  remove(category: Category) {
    if (!confirm(`¿Eliminar la categoría "${category.name}"?`)) return;
    this.categoriesService.remove(category.id).subscribe({
      next: () => this.load(),
      error: () => this.errorMessage.set('No se pudo eliminar la categoría.'),
    });
  }
}
