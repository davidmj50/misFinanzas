import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize, forkJoin } from 'rxjs';
import { AlertComponent, BadgeComponent, ButtonDirective, CardBodyComponent, CardComponent, CardHeaderComponent, ColComponent, FormControlDirective, FormLabelDirective, FormSelectDirective, RowComponent, TableDirective } from '@coreui/angular';
import { Account, Category } from '../../core/models/finance.models';
import { ImportDecision, ImportResult, ImportRow } from '../../core/models/import.models';
import { AccountsService } from '../../core/services/accounts.service';
import { CategoriesService } from '../../core/services/categories.service';
import { ImportsService } from '../../core/services/imports.service';
import { Cell, guessMapping, ImportMapping, ImportSheet, normalizeImportRows, readImportFile } from '../../core/utils/import-file';

interface ReviewRow extends ImportDecision { payload?: ImportRow; selected: boolean; }
interface PendingImport { accountId: string; fileName: string; requestId: string; rows: ImportRow[]; }

@Component({
  selector: 'app-imports', templateUrl: './imports.component.html',
  imports: [AlertComponent, BadgeComponent, ButtonDirective, CardBodyComponent, CardComponent, CardHeaderComponent,
    ColComponent, DecimalPipe, FormControlDirective, FormLabelDirective, FormSelectDirective, FormsModule, ReactiveFormsModule, RouterLink, RowComponent, TableDirective],
})
export class ImportsComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly accountsService = inject(AccountsService);
  private readonly categoriesService = inject(CategoriesService);
  private readonly importsService = inject(ImportsService);
  private file: File | null = null;
  private readVersion = 0;
  private reviewVersion = 0;
  private requestId = '';
  private pending: PendingImport | null = null;
  readonly accounts = signal<Account[]>([]);
  readonly categories = signal<Category[]>([]);
  readonly sheets = signal<ImportSheet[]>([]);
  readonly columns = signal<string[]>([]);
  readonly rows = signal<ReviewRow[]>([]);
  readonly fileName = signal('');
  readonly currency = signal('');
  readonly loading = signal(true);
  readonly reading = signal(false);
  readonly previewing = signal(false);
  readonly saving = signal(false);
  readonly hasPending = signal(false);
  readonly reviewed = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly result = signal<ImportResult | null>(null);
  readonly selectedCount = computed(() => this.rows().filter(r => r.selected).length);
  readonly duplicateCount = computed(() => this.rows().filter(r => r.status === 'DUPLICATE' || r.status === 'POSSIBLE_DUPLICATE').length);
  readonly invalidCount = computed(() => this.rows().filter(r => r.status === 'INVALID').length);
  readonly locked = computed(() => this.loading() || this.reading() || this.previewing() || this.saving() || this.hasPending());
  readonly labels = { NEW: 'Nuevo', DUPLICATE: 'Duplicado', POSSIBLE_DUPLICATE: 'Posible duplicado', INVALID: 'Inválido' };
  readonly mappingFields = [
    { key: 'date', label: 'Fecha *' }, { key: 'amount', label: 'Importe *' }, { key: 'type', label: 'Tipo' },
    { key: 'description', label: 'Descripción' }, { key: 'merchant', label: 'Comercio' }, { key: 'category', label: 'Categoría' },
    { key: 'currency', label: 'Moneda' }, { key: 'externalRef', label: 'Referencia única del movimiento' },
  ] as const;
  readonly config = this.fb.nonNullable.group({ accountId: ['', Validators.required], sheet: [0], headerRow: [1, [Validators.min(1), Validators.max(2000)]], delimiter: ['auto'], encoding: ['utf-8'] });
  readonly mapping = this.fb.nonNullable.group<ImportMapping>({ ...guessMapping([]) });

  constructor() {
    this.mapping.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.invalidate());
    this.config.controls.accountId.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.invalidate());
    this.config.controls.sheet.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.setColumns());
    this.config.controls.headerRow.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.setColumns());
    this.config.controls.delimiter.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => { if (this.file) void this.loadFile(); });
    this.config.controls.encoding.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => { if (this.file) void this.loadFile(); });
  }

  ngOnInit() {
    forkJoin({ accounts: this.accountsService.list(), categories: this.categoriesService.list() }).pipe(
      takeUntilDestroyed(this.destroyRef), finalize(() => this.loading.set(false)),
    ).subscribe({
      next: ({ accounts, categories }) => {
        this.accounts.set(accounts.filter(a => !a.archived)); this.categories.set(categories);
        this.config.controls.accountId.setValue(this.accounts()[0]?.id ?? '');
      }, error: () => this.errorMessage.set('No se pudieron cargar las cuentas y categorías. Recarga la página.'),
    });
  }

  private invalidate() {
    this.reviewVersion++; this.rows.set([]); this.reviewed.set(false); this.result.set(null);
    this.pending = null; this.hasPending.set(false); this.errorMessage.set(null);
  }

  async chooseFile(event: Event) {
    this.file = (event.target as HTMLInputElement).files?.[0] ?? null;
    this.fileName.set(this.file?.name ?? '');
    this.config.controls.headerRow.setValue(1, { emitEvent: false });
    await this.loadFile();
  }

  private async loadFile() {
    const version = ++this.readVersion;
    this.invalidate(); this.sheets.set([]); this.columns.set([]);
    if (!this.file) return;
    this.reading.set(true);
    try {
      const sheets = await readImportFile(this.file, this.config.controls.delimiter.value, this.config.controls.encoding.value);
      if (version !== this.readVersion) return;
      this.sheets.set(sheets); this.config.controls.sheet.setValue(0, { emitEvent: false }); this.setColumns();
    } catch (error) {
      if (version === this.readVersion) this.errorMessage.set(error instanceof TypeError ? 'No se pudo leer el archivo como UTF-8. Prueba la codificación Windows-1252.' : (error as Error).message);
    } finally { if (version === this.readVersion) this.reading.set(false); }
  }

  private sheetData(): Cell[][] { return this.sheets()[this.config.controls.sheet.value]?.data ?? []; }

  private setColumns() {
    this.invalidate();
    const rowNumber = this.config.controls.headerRow.value;
    if (!Number.isInteger(rowNumber) || rowNumber < 1) { this.columns.set([]); return; }
    const header = this.sheetData()[rowNumber - 1] ?? [];
    const names = header.map((cell, index) => String(cell ?? '').trim() || `Columna ${index + 1}`);
    this.columns.set(names);
    const { dateFormat: _dateFormat, decimal: _decimal, typeMode: _typeMode, ...columns } = guessMapping(names);
    this.mapping.patchValue(columns, { emitEvent: false });
  }

  preview() {
    if (this.locked() || !this.file || this.config.invalid) return;
    this.invalidate();
    const version = this.reviewVersion;
    let parsed;
    try { parsed = normalizeImportRows(this.sheetData(), this.config.controls.headerRow.value, this.mapping.getRawValue(), this.categories()); }
    catch (error) { this.errorMessage.set((error as Error).message); return; }
    const validRows = parsed.flatMap(r => r.payload ? [r.payload] : []);
    const localErrors: ReviewRow[] = parsed.filter(r => !r.payload).map(r => ({ rowId: r.rowId, status: 'INVALID', reason: r.errors.join('. '), canForce: false, selected: false }));
    if (!validRows.length) { this.rows.set(localErrors); this.errorMessage.set('No hay filas válidas. Revisa las columnas y los formatos.'); return; }
    this.previewing.set(true);
    this.importsService.preview(this.config.controls.accountId.value, validRows).pipe(
      takeUntilDestroyed(this.destroyRef), finalize(() => this.previewing.set(false)),
    ).subscribe({
      next: response => {
        if (version !== this.reviewVersion) return;
        const payloads = new Map(validRows.map(r => [r.rowId, r]));
        this.rows.set([...localErrors, ...response.rows.map(r => ({ ...r, payload: { ...payloads.get(r.rowId)!, currency: payloads.get(r.rowId)?.currency ?? response.currency, categoryId: r.categoryId !== undefined ? r.categoryId : payloads.get(r.rowId)?.categoryId ?? null }, selected: r.status === 'NEW' }))].sort((a, b) => a.rowId - b.rowId));
        this.currency.set(response.currency); this.requestId = crypto.randomUUID(); this.reviewed.set(true);
      }, error: error => this.errorMessage.set(this.message(error, 'No se pudo comprobar la existencia de duplicados.')),
    });
  }

  toggle(rowId: number, checked: boolean) {
    if (this.hasPending() || this.saving()) return;
    this.rows.update(rows => rows.map(r => r.rowId === rowId && r.status !== 'INVALID' && (r.status === 'NEW' || r.canForce) ? { ...r, selected: checked } : r));
  }

  changeCategory(rowId: number, categoryId: string) {
    if (this.hasPending() || this.saving() || !this.reviewed()) return;
    this.rows.update(rows => rows.map(row => row.rowId === rowId && row.payload && row.status !== 'INVALID'
      ? { ...row, matchedRule: null, payload: { ...row.payload, categoryId: categoryId || null } } : row));
  }

  selectNew() {
    if (this.hasPending()) return;
    this.rows.update(rows => rows.map(r => ({ ...r, selected: r.status === 'NEW' })));
  }

  newReview() { if (!this.saving()) this.invalidate(); }

  commit() {
    if (this.saving() || !this.reviewed()) return;
    if (!this.pending) {
      const rows = this.rows().filter(r => r.selected && r.payload).map(r => ({ ...r.payload!, allowDuplicate: r.status !== 'NEW' }));
      if (!rows.length) return;
      this.pending = { accountId: this.config.controls.accountId.value, fileName: this.fileName().slice(0, 200), requestId: this.requestId, rows };
      this.hasPending.set(true);
    }
    const payload = this.pending;
    this.saving.set(true); this.errorMessage.set(null);
    this.importsService.commit(payload.accountId, payload.fileName, payload.requestId, payload.rows).pipe(
      takeUntilDestroyed(this.destroyRef), finalize(() => this.saving.set(false)),
    ).subscribe({
      next: result => { this.result.set(result); this.reviewed.set(false); this.pending = null; this.hasPending.set(false); },
      error: error => this.errorMessage.set(this.message(error, 'No se pudo confirmar el resultado. Reintenta el mismo envío para evitar duplicados.')),
    });
  }

  private message(error: { error?: { message?: string | string[] } }, fallback: string) {
    const message = error.error?.message;
    return Array.isArray(message) ? message.join('. ') : typeof message === 'string' ? message : fallback;
  }
}
