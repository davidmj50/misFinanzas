import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize, forkJoin, retry, throwError, timer } from 'rxjs';
import { Account, Category, TransactionType } from '../../core/models/finance.models';
import { AccountsService } from '../../core/services/accounts.service';
import { CategoriesService } from '../../core/services/categories.service';
import { AuthService } from '../../core/services/auth.service';
import { PwaService } from '../../core/services/pwa.service';
import { QuickDraftStore, QuickEntryInput, QuickFormValue } from '../../core/services/quick-draft.store';
import { QuickEntriesService } from '../../core/services/quick-entries.service';
import { localDateString } from '../../core/utils/dates';
@Component({
  selector: 'app-quick-entry', templateUrl: './quick-entry.component.html', imports: [ReactiveFormsModule, RouterLink],
  host: { class: 'd-block min-vh-100 bg-body-tertiary' },
})
export class QuickEntryComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthService);
  private readonly store = inject(QuickDraftStore);
  private readonly entries = inject(QuickEntriesService);
  private readonly accountsService = inject(AccountsService);
  private readonly categoriesService = inject(CategoriesService);
  private restoring = false;
  private readonly ownerId = this.auth.currentUser()?.id ?? '';
  readonly pwa = inject(PwaService);
  readonly accounts = signal<Account[]>([]);
  readonly categories = signal<Category[]>([]);
  readonly loading = signal(false);
  readonly catalogReady = signal(false);
  readonly saving = signal(false);
  readonly pending = signal<QuickEntryInput | null>(null);
  readonly error = signal('');
  readonly catalogError = signal('');
  readonly notice = signal('');
  readonly storageAvailable = signal(true);
  readonly externalChange = signal(false);
  readonly successId = signal<string | null>(null);
  readonly form = this.fb.group({
    type: this.fb.nonNullable.control<TransactionType>('EXPENSE'), accountId: this.fb.nonNullable.control('', Validators.required), categoryId: this.fb.nonNullable.control(''),
    amount: this.fb.control<number | null>(null, [Validators.required, Validators.min(0.01), Validators.max(999999999999.99), Validators.pattern(/^\d+(?:\.\d{1,2})?$/)]),
    date: this.fb.nonNullable.control(localDateString(), Validators.required), currency: this.fb.nonNullable.control('', [Validators.required, Validators.pattern(/^[A-Z]{3}$/)]),
    merchant: this.fb.nonNullable.control('', Validators.maxLength(200)), description: this.fb.nonNullable.control('', Validators.maxLength(500)),
  });
  constructor() {
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => { if (!this.restoring && !this.externalChange()) this.persist(); });
    this.form.controls.type.valueChanges.pipe(takeUntilDestroyed()).subscribe(type => {
      if (this.pending() || this.restoring) return;
      const category = this.categories().find(c => c.id === this.form.controls.categoryId.value);
      if (category && category.type !== type) this.form.controls.categoryId.setValue('');
    });
    this.form.controls.accountId.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => { if (!this.pending() && !this.restoring) this.syncCurrency(); });
    const online = () => this.loadCatalog();
    const offline = () => this.catalogReady.set(false);
    const changed = (event: StorageEvent) => { if (event.key === this.store.key(this.ownerId) || event.key === null) this.externalChange.set(true); };
    const flush = (event: Event) => { if (!this.persist()) event.preventDefault(); };
    window.addEventListener('online', online); window.addEventListener('offline', offline); window.addEventListener('storage', changed); window.addEventListener('misfinanzas:before-reload', flush);
    this.destroyRef.onDestroy(() => { window.removeEventListener('online', online); window.removeEventListener('offline', offline); window.removeEventListener('storage', changed); window.removeEventListener('misfinanzas:before-reload', flush); });
  }
  ngOnInit() {
    this.restore();
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      const type = params.get('type'); const value = this.form.getRawValue();
      if ((type === 'INCOME' || type === 'EXPENSE') && !this.pending() && value.amount === null && !value.merchant && !value.description) this.form.controls.type.setValue(type);
    });
    this.loadCatalog();
  }
  private empty(type?: TransactionType): QuickFormValue {
    const shortcut = this.route.snapshot.queryParamMap.get('type');
    return { type: type ?? (shortcut === 'INCOME' ? 'INCOME' : 'EXPENSE'), accountId: '', categoryId: '', amount: null, date: localDateString(), currency: '', merchant: '', description: '' };
  }
  restore() {
    if (this.saving()) return;
    const draft = this.store.read(this.ownerId); this.restoring = true; this.externalChange.set(false); this.pending.set(draft?.pending ?? null);
    this.form.reset(draft?.pending ? { ...draft.pending, categoryId: draft.pending.categoryId ?? '' } : draft?.form ?? this.empty()); this.restoring = false;
    if (draft) this.notice.set(draft.pending ? 'Hay un envío pendiente de confirmar. Reintenta los mismos datos.' : 'Borrador recuperado de este dispositivo. Revisa la fecha antes de guardar.');
    if (this.catalogReady()) this.reconcileCatalog();
  }
  persist(): boolean {
    if (!this.ownerId || this.externalChange()) return true;
    const form = this.form.getRawValue();
    const meaningful = this.pending() || form.amount !== null || form.merchant.trim() || form.description.trim() || form.categoryId;
    const saved = meaningful ? this.store.save(this.ownerId, form, this.pending()) : this.store.clear(this.ownerId);
    this.storageAvailable.set(saved); return saved;
  }
  loadCatalog() {
    if (!this.pwa.online() || this.loading()) return;
    this.loading.set(true); this.catalogReady.set(false);
    forkJoin({ accounts: this.accountsService.list(), categories: this.categoriesService.list() }).pipe(
      retry({ count: 1, delay: error => error.status === 0 || error.status >= 500 ? timer(500) : throwError(() => error) }),
      takeUntilDestroyed(this.destroyRef), finalize(() => this.loading.set(false)),
    ).subscribe({
      next: data => { this.catalogError.set(''); this.accounts.set(data.accounts.filter(a => !a.archived)); this.categories.set(data.categories); this.catalogReady.set(true); this.reconcileCatalog(); },
      error: () => this.catalogError.set('No se pudieron actualizar cuentas y categorías. Tu borrador se conserva; vuelve a intentarlo.'),
    });
  }
  private reconcileCatalog() {
    if (this.pending()) return;
    const current = this.form.controls.accountId.value;
    if (!current) this.form.controls.accountId.setValue(this.accounts()[0]?.id ?? '');
    else if (!this.accounts().some(a => a.id === current)) { this.form.controls.accountId.setValue(''); this.notice.set('La cuenta del borrador ya no está disponible. Elige una cuenta activa y revisa la moneda.'); }
    const category = this.categories().find(c => c.id === this.form.controls.categoryId.value && c.type === this.form.controls.type.value);
    if (!category) this.form.controls.categoryId.setValue(''); this.syncCurrency();
  }
  private syncCurrency() {
    const actual = this.accounts().find(a => a.id === this.form.controls.accountId.value)?.currency;
    if (actual && (!this.form.controls.currency.value || !this.form.controls.amount.value)) this.form.controls.currency.setValue(actual);
  }
  currencyMismatch() { const actual = this.accounts().find(a => a.id === this.form.controls.accountId.value)?.currency; return !!actual && actual !== this.form.controls.currency.value; }
  accountCurrency() { return this.accounts().find(a => a.id === this.form.controls.accountId.value)?.currency ?? this.form.controls.currency.value; }
  confirmCurrency() { if (!this.pending()) this.form.controls.currency.setValue(this.accountCurrency()); }
  availableCategories() { return this.categories().filter(c => c.type === this.form.controls.type.value); }
  canSave() { return this.pwa.online() && !this.saving() && !this.externalChange() && (!!this.pending() || (this.catalogReady() && this.form.valid && !this.currencyMismatch())); }
  save() {
    if (!this.canSave()) return;
    if (!this.pending()) {
      const form = this.form.getRawValue();
      this.pending.set({ ...form, amount: form.amount!, categoryId: form.categoryId || null, requestId: crypto.randomUUID() }); this.persist();
    }
    const payload = this.pending()!; this.saving.set(true); this.error.set(''); this.notice.set('');
    this.entries.create(payload).pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.saving.set(false))).subscribe({
      next: result => {
        this.store.clear(this.ownerId); this.pending.set(null); this.successId.set(result.transactionId);
        this.restoring = true; this.form.reset({ ...this.empty(payload.type), accountId: payload.accountId, currency: payload.currency }); this.restoring = false;
        this.notice.set(`${payload.type === 'EXPENSE' ? 'Gasto' : 'Ingreso'} registrado. Puedes añadir otro movimiento.`); this.reconcileCatalog();
      }, error: (error: { status?: number; error?: { message?: string | string[] } }) => {
        const message = error.error?.message;
        this.error.set(Array.isArray(message) ? message.join('. ') : message || 'No se pudo confirmar el guardado. Reintenta el mismo envío para evitar duplicados.');
        if ([400, 404, 410, 422].includes(error.status ?? 0)) { this.pending.set(null); this.persist(); this.loadCatalog(); }
        else this.persist();
      },
    });
  }
  discard() {
    if (this.saving() || this.pending()) return;
    this.store.clear(this.ownerId); this.restoring = true; this.form.reset(this.empty()); this.restoring = false;
    this.notice.set('Borrador descartado.'); this.error.set(''); this.successId.set(null); if (this.catalogReady()) this.reconcileCatalog();
  }
}
