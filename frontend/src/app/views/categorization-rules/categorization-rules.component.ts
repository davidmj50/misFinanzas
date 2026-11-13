import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize, forkJoin } from 'rxjs';
import { AlertComponent, ButtonDirective, CardBodyComponent, CardComponent, CardHeaderComponent, FormControlDirective, FormLabelDirective, FormSelectDirective, TableDirective } from '@coreui/angular';
import { Account, Category, TransactionType } from '../../core/models/finance.models';
import { AccountsService } from '../../core/services/accounts.service';
import { CategoriesService } from '../../core/services/categories.service';
import { CategorizationRule, CategorizationRulesService, RuleTestResult, SaveRule } from '../../core/services/categorization-rules.service';

const defaults: SaveRule = { name: '', field: 'ANY', operator: 'CONTAINS', pattern: '', priority: 100, active: true, categoryId: '', accountId: null };
@Component({
  selector: 'app-categorization-rules', templateUrl: './categorization-rules.component.html',
  imports: [ReactiveFormsModule, RouterLink, AlertComponent, ButtonDirective, CardBodyComponent, CardComponent, CardHeaderComponent, FormControlDirective, FormLabelDirective, FormSelectDirective, TableDirective],
})
export class CategorizationRulesComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly service = inject(CategorizationRulesService);
  private readonly accountsService = inject(AccountsService);
  private readonly categoriesService = inject(CategoriesService);
  readonly rules = signal<CategorizationRule[]>([]);
  readonly accounts = signal<Account[]>([]);
  readonly categories = signal<Category[]>([]);
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly testing = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly editingId = signal<string | undefined>(undefined);
  readonly deletingId = signal<string | null>(null);
  readonly testResult = signal<RuleTestResult | null>(null);
  readonly fields = { ANY: 'Descripción o comercio', DESCRIPTION: 'Descripción', MERCHANT: 'Comercio' };
  readonly operators = { CONTAINS: 'Contiene', EQUALS: 'Es igual a', STARTS_WITH: 'Empieza por' };
  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.pattern(/\S/), Validators.maxLength(100)]],
    field: [defaults.field], operator: [defaults.operator],
    pattern: ['', [Validators.required, Validators.pattern(/[\p{L}\p{N}\p{P}\p{S}]/u), Validators.maxLength(200)]],
    priority: [100, [Validators.required, Validators.min(0), Validators.max(9999), Validators.pattern(/^\d+$/)]],
    active: [true], categoryId: ['', Validators.required], accountId: [''],
  });
  readonly testForm = this.fb.nonNullable.group({ accountId: ['', Validators.required], type: ['EXPENSE' as TransactionType], description: ['', Validators.maxLength(500)], merchant: ['', Validators.maxLength(200)] });
  constructor() { this.testForm.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.testResult.set(null)); }

  ngOnInit() { this.load(); }
  private load() {
    this.loading.set(true);
    forkJoin({ rules: this.service.list(), accounts: this.accountsService.list(), categories: this.categoriesService.list() }).pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.loading.set(false))).subscribe({
      next: data => {
        this.rules.set(data.rules); this.accounts.set(data.accounts); this.categories.set(data.categories);
        if (!this.testForm.controls.accountId.value) this.testForm.controls.accountId.setValue(data.accounts.find(a => !a.archived)?.id ?? '');
      }, error: error => this.showError(error),
    });
  }
  edit(rule: CategorizationRule) {
    if (this.busy() || this.loading()) return;
    this.editingId.set(rule.id); this.form.reset({ ...rule, accountId: rule.accountId ?? '' }); this.notice.set('');
  }
  cancel() { this.editingId.set(undefined); this.form.reset({ ...defaults, accountId: '' }); }
  save() {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.busy() || this.loading()) return;
    this.busy.set(true); this.error.set(''); this.notice.set(''); this.testResult.set(null);
    const value = this.form.getRawValue();
    this.service.save({ ...value, accountId: value.accountId || null }, this.editingId()).pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.busy.set(false))).subscribe({
      next: () => { this.cancel(); this.notice.set('Regla guardada. Se aplicará en la próxima vista previa de importación.'); this.load(); }, error: error => this.showError(error),
    });
  }
  remove(rule: CategorizationRule) {
    if (this.busy() || this.loading()) return;
    this.busy.set(true); this.error.set(''); this.notice.set(''); this.testResult.set(null);
    this.service.remove(rule.id).pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.busy.set(false))).subscribe({
      next: () => { if (this.editingId() === rule.id) this.cancel(); this.deletingId.set(null); this.notice.set('Regla eliminada.'); this.load(); }, error: error => this.showError(error),
    });
  }
  test() {
    if (this.testForm.invalid || this.testing() || this.busy() || this.loading()) return;
    this.testing.set(true); this.error.set(''); this.testResult.set(null);
    this.service.test(this.testForm.getRawValue()).pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.testing.set(false))).subscribe({ next: result => this.testResult.set(result), error: error => this.showError(error) });
  }
  private showError(error: { error?: { message?: string | string[] } }) { const message = error.error?.message; this.error.set(Array.isArray(message) ? message.join('. ') : message || 'No se pudo completar la operación.'); }
}
