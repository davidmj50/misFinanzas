import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize, forkJoin } from 'rxjs';
import { AlertComponent, ButtonDirective, CardBodyComponent, CardComponent, CardHeaderComponent, FormControlDirective, FormLabelDirective, FormSelectDirective, TableDirective } from '@coreui/angular';
import { Account, Category, Transaction } from '../../core/models/finance.models';
import { AccountsService } from '../../core/services/accounts.service';
import { CategoriesService } from '../../core/services/categories.service';
import { ExpenseDocument, ExpenseDocumentsService, ReceiptExpenseInput } from '../../core/services/expense-documents.service';
import { ReceiptReaderService, ReceiptReading, receiptFileType } from '../../core/services/receipt-reader.service';
import { parseReceipt } from '../../core/utils/receipt-parser';
import { localDateString } from '../../core/utils/dates';
interface SelectedDocument { id: string; file: File; mime: string; preview: string | null; reading: ReceiptReading | null; error: string; }
@Component({
  selector: 'app-expense-documents', templateUrl: './expense-documents.component.html',
  imports: [ReactiveFormsModule, RouterLink, DecimalPipe, AlertComponent, ButtonDirective, CardBodyComponent, CardComponent, CardHeaderComponent, FormControlDirective, FormLabelDirective, FormSelectDirective, TableDirective],
})
export class ExpenseDocumentsComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly service = inject(ExpenseDocumentsService);
  private readonly reader = inject(ReceiptReaderService);
  private readonly accountsService = inject(AccountsService);
  private readonly categoriesService = inject(CategoriesService);
  private abort: AbortController | null = null;
  private version = 0;
  private selectionVersion = 0;
  private pending: { files: File[]; metadata: ReceiptExpenseInput | { requestId: string }; transactionId?: string } | null = null;
  readonly accounts = signal<Account[]>([]);
  readonly categories = signal<Category[]>([]);
  readonly transactionId = signal<string | null>(null);
  readonly expense = signal<Transaction | null>(null);
  readonly documents = signal<ExpenseDocument[]>([]);
  readonly selected = signal<SelectedDocument[]>([]);
  readonly loading = signal(true);
  readonly loadingExpense = signal(false);
  readonly preparing = signal(false);
  readonly saving = signal(false);
  readonly hasPending = signal(false);
  readonly analyzingId = signal<string | null>(null);
  readonly progress = signal('');
  readonly deletingId = signal<string | null>(null);
  readonly downloadingId = signal<string | null>(null);
  readonly deleteConfirmation = signal<string | null>(null);
  readonly error = signal('');
  readonly notice = signal('');
  readonly detectedCurrency = signal<string | null>(null);
  readonly currencyConfirmed = signal(false);
  readonly form = this.fb.nonNullable.group({ accountId: ['', Validators.required], categoryId: [''], date: [localDateString(), Validators.required],
    amount: [0, [Validators.required, Validators.min(0.01), Validators.max(999999999999.99)]], merchant: ['', Validators.maxLength(200)], description: ['', Validators.maxLength(500)], notes: ['', Validators.maxLength(1000)] });
  readonly readingOptions = this.fb.nonNullable.group({ dateFormat: ['DMY' as 'DMY' | 'MDY'], useDate: [true], useMerchant: [true], useAmount: [true] });
  constructor() {
    this.destroyRef.onDestroy(() => { this.abort?.abort(); this.clearSelection(); });
    this.form.controls.accountId.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.currencyConfirmed.set(false));
    this.readingOptions.controls.dateFormat.valueChanges.pipe(takeUntilDestroyed()).subscribe(format => this.selected.update(files => files.map(f => f.reading ? { ...f, reading: { ...f.reading, suggestions: parseReceipt(f.reading.text, format) } } : f)));
  }
  ngOnInit() {
    forkJoin({ accounts: this.accountsService.list(), categories: this.categoriesService.list() }).pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.loading.set(false))).subscribe({
      next: data => { this.accounts.set(data.accounts.filter(a => !a.archived)); this.categories.set(data.categories.filter(c => c.type === 'EXPENSE')); if (!this.form.controls.accountId.value) this.form.controls.accountId.setValue(this.accounts()[0]?.id ?? ''); }, error: error => this.showError(error),
    });
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => this.open(params.get('transactionId')));
  }
  private open(id: string | null) {
    const version = ++this.version; this.abort?.abort(); this.abort = null; this.analyzingId.set(null); this.preparing.set(false); this.clearSelection(); this.pending = null; this.hasPending.set(false);
    this.transactionId.set(id); this.expense.set(null); this.documents.set([]); this.error.set(''); this.detectedCurrency.set(null); this.currencyConfirmed.set(false);
    this.form.reset({ accountId: this.accounts()[0]?.id ?? '', categoryId: '', date: localDateString(), amount: 0, merchant: '', description: '', notes: '' });
    if (!id) { this.loadingExpense.set(false); return; }
    this.loadingExpense.set(true);
    forkJoin({ expense: this.service.expense(id), documents: this.service.list(id) }).pipe(takeUntilDestroyed(this.destroyRef), finalize(() => { if (version === this.version) this.loadingExpense.set(false); })).subscribe({
      next: result => { if (version !== this.version) return; if (result.expense.type !== 'EXPENSE' || result.expense.transferId) { this.error.set('Solo puedes adjuntar comprobantes a gastos.'); return; } this.expense.set(result.expense); this.documents.set(result.documents); },
      error: error => { if (version === this.version) this.showError(error); },
    });
  }
  locked() { return this.loading() || this.loadingExpense() || this.preparing() || this.saving() || this.hasPending() || !!this.analyzingId() || !!this.deletingId(); }
  selectedCurrency() { return this.accounts().find(a => a.id === this.form.controls.accountId.value)?.currency ?? ''; }
  currencyMismatch() { return !!this.detectedCurrency() && this.detectedCurrency() !== this.selectedCurrency(); }
  private clearSelection() { this.selectionVersion++; this.selected().forEach(f => { if (f.preview) URL.revokeObjectURL(f.preview); }); this.selected.set([]); }
  async chooseFiles(event: Event) {
    if (this.locked()) return;
    const input = event.target as HTMLInputElement; const files = [...(input.files ?? [])]; input.value = '';
    if (files.length + this.selected().length + this.documents().length > 3) { this.error.set('Cada gasto admite como máximo 3 documentos.'); return; }
    const version = ++this.selectionVersion; this.preparing.set(true); this.error.set('');
    try {
      const types = await Promise.all(files.map(file => receiptFileType(file)));
      if (version !== this.selectionVersion) return;
      this.selected.update(current => [...current, ...files.map((file, i) => ({ id: crypto.randomUUID(), file, mime: types[i], preview: types[i].startsWith('image/') ? URL.createObjectURL(new Blob([file], { type: types[i] })) : null, reading: null, error: '' }))]);
    } catch (error) { if (version === this.selectionVersion) this.error.set((error as Error).message); }
    finally { if (version === this.selectionVersion) this.preparing.set(false); }
  }
  removeSelected(id: string) { if (this.locked()) return; this.selected.update(files => files.filter(f => { if (f.id !== id) return true; if (f.preview) URL.revokeObjectURL(f.preview); return false; })); }
  async analyze(id: string) {
    if (this.locked()) return; const file = this.selected().find(f => f.id === id); if (!file) return;
    const version = this.version; this.abort = new AbortController(); this.analyzingId.set(id); this.progress.set('Preparando lectura...');
    try {
      const reading = await this.reader.read(file.file, this.readingOptions.controls.dateFormat.value, progress => { if (version === this.version) this.progress.set(progress); }, this.abort.signal);
      if (version === this.version) this.selected.update(files => files.map(f => f.id === id ? { ...f, reading, error: '' } : f));
    } catch (error) { if (version === this.version) this.selected.update(files => files.map(f => f.id === id ? { ...f, error: (error as Error).message || 'No se pudo analizar. Completa el gasto manualmente.' } : f)); }
    finally { if (version === this.version) { this.analyzingId.set(null); this.abort = null; this.progress.set(''); } }
  }
  cancelAnalysis() { this.abort?.abort(); }
  apply(id: string) {
    if (this.locked() || this.transactionId()) return;
    const suggestions = this.selected().find(f => f.id === id)?.reading?.suggestions; if (!suggestions) return;
    const options = this.readingOptions.getRawValue();
    if (options.useDate && suggestions.date) this.form.controls.date.setValue(suggestions.date);
    if (options.useMerchant && suggestions.merchant) this.form.controls.merchant.setValue(suggestions.merchant);
    if (options.useAmount && suggestions.amount) { this.form.controls.amount.setValue(suggestions.amount); this.detectedCurrency.set(suggestions.currency); this.currencyConfirmed.set(false); }
    this.notice.set('Datos sugeridos copiados al formulario. Revísalos antes de guardar.');
  }
  save() {
    if (this.saving() || this.analyzingId() || this.loadingExpense() || this.loading() || this.preparing()) return;
    if (!this.pending) {
      if (!this.selected().length || (this.transactionId() && !this.expense())) return;
      if (!this.transactionId() && (this.form.invalid || (this.currencyMismatch() && !this.currencyConfirmed()))) { this.form.markAllAsTouched(); return; }
      const requestId = crypto.randomUUID();
      this.pending = { files: this.selected().map(f => f.file), metadata: this.transactionId() ? { requestId } : { ...this.form.getRawValue(), categoryId: this.form.controls.categoryId.value || null, requestId }, transactionId: this.transactionId() ?? undefined };
      this.hasPending.set(true);
    }
    const payload = this.pending; const version = this.version; this.saving.set(true); this.error.set('');
    this.service.upload(payload.files, payload.metadata, payload.transactionId).pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.saving.set(false))).subscribe({
      next: result => { if (version !== this.version) return; this.pending = null; this.hasPending.set(false); this.clearSelection(); this.notice.set(payload.transactionId ? 'Documentos adjuntados al gasto.' : 'Gasto y documentos guardados.'); if (payload.transactionId) this.open(payload.transactionId); else void this.router.navigate([], { relativeTo: this.route, queryParams: { transactionId: result.transactionId } }); },
      error: error => { if (version === this.version) this.showError(error); },
    });
  }
  discardPending() { if (this.saving()) return; this.pending = null; this.hasPending.set(false); if (this.transactionId()) this.open(this.transactionId()); }
  download(doc: ExpenseDocument) {
    if (this.downloadingId()) return; this.downloadingId.set(doc.id);
    this.service.download(doc.id).pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.downloadingId.set(null))).subscribe({
      next: blob => { const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = doc.fileName; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }, error: error => this.showError(error),
    });
  }
  remove(doc: ExpenseDocument) {
    if (this.locked()) return; this.deletingId.set(doc.id); this.error.set('');
    this.service.remove(doc.id).pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.deletingId.set(null))).subscribe({
      next: () => { this.documents.update(docs => docs.filter(d => d.id !== doc.id)); this.deleteConfirmation.set(null); this.notice.set('Documento eliminado. El gasto se conserva.'); }, error: error => this.showError(error),
    });
  }
  private showError(error: { error?: { message?: string | string[] } }) { const message = error.error?.message; this.error.set(Array.isArray(message) ? message.join('. ') : message || 'No se pudo confirmar el envío. Reintenta los mismos datos para evitar duplicados.'); }
}
