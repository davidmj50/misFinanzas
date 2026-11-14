import { ChartDescriptionDirective } from '../../core/directives/chart-description.directive';
import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { finalize, forkJoin } from 'rxjs';
import { ChartData, ChartOptions } from 'chart.js';
import { ChartjsComponent } from '@coreui/angular-chartjs';
import { AlertComponent, BadgeComponent, ButtonDirective, CardBodyComponent, CardComponent, CardHeaderComponent, FormControlDirective, FormLabelDirective, FormSelectDirective, TableDirective } from '@coreui/angular';
import { Account } from '../../core/models/finance.models';
import { AccountsService } from '../../core/services/accounts.service';
import { BalanceProjection, CardControl, CardStatement, PlanningService, ProjectionEvent } from '../../core/services/planning.service';

const positiveMoney = [Validators.required, Validators.min(0.01), Validators.max(999999999999.99)];
const localToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
@Component({
  selector: 'app-planning', templateUrl: './planning.component.html',
  imports: [ChartDescriptionDirective,ReactiveFormsModule, RouterLink, DecimalPipe, ChartjsComponent, AlertComponent, BadgeComponent, ButtonDirective, CardBodyComponent, CardComponent, CardHeaderComponent, FormControlDirective, FormLabelDirective, FormSelectDirective, TableDirective],
})
export class PlanningComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly service = inject(PlanningService);
  private readonly accountsService = inject(AccountsService);
  private projectionVersion = 0;
  private pendingPayment: { id: string; input: { fromAccountId: string; amount: number; date: string; requestId: string } } | null = null;
  private pendingRecurring: { id: string; input: { dueDate: string; date: string; amount: number } } | null = null;
  readonly cards = signal<CardControl[]>([]);
  readonly accounts = signal<Account[]>([]);
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly projecting = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly projection = signal<BalanceProjection | null>(null);
  readonly configuredCard = signal<CardControl | null>(null);
  readonly statementEditor = signal<{ card: CardControl; id?: string } | null>(null);
  readonly paymentEditor = signal<{ card: CardControl; statement: CardStatement } | null>(null);
  readonly recurringEditor = signal<ProjectionEvent | null>(null);
  readonly hasPendingPayment = signal(false);
  readonly hasPendingRecurring = signal(false);
  readonly deletingStatement = signal<string | null>(null);
  readonly calendarToday = localToday();
  chartData: ChartData<'line'> = { labels: [], datasets: [] };
  readonly chartOptions: ChartOptions<'line'> = { animation: false, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { title: { display: true, text: 'Saldo al final del día' } } } };
  readonly forecastForm = this.fb.nonNullable.group({ accountId: ['', Validators.required], days: [30], paymentMode: ['FULL' as 'FULL' | 'MINIMUM'], includeRecurring: [true] });
  readonly cardForm = this.fb.nonNullable.group({ creditLimit: [0, positiveMoney], closingDay: [1, [Validators.required, Validators.min(1), Validators.max(31), Validators.pattern(/^\d+$/)]], paymentDay: [15, [Validators.required, Validators.min(1), Validators.max(31), Validators.pattern(/^\d+$/)]], paymentAccountId: [''] });
  readonly statementForm = this.fb.nonNullable.group({ closingDate: [this.calendarToday, Validators.required], dueDate: ['', Validators.required], plannedPaymentDate: [''], total: [0, [Validators.required, Validators.min(0), Validators.max(999999999999.99)]], minimumPayment: [0, [Validators.required, Validators.min(0)]] });
  readonly paymentForm = this.fb.nonNullable.group({ fromAccountId: ['', Validators.required], amount: [0, positiveMoney], date: [this.calendarToday, Validators.required] });
  readonly recurringForm = this.fb.nonNullable.group({ date: [this.calendarToday, Validators.required], amount: [0, positiveMoney] });
  constructor() {
    this.forecastForm.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => { this.projectionVersion++; this.projecting.set(false); this.projection.set(null); });
  }
  ngOnInit() { this.load(); }
  fundingAccounts(currency: string) { return this.accounts().filter(a => !a.archived && a.type !== 'CREDIT_CARD' && a.currency === currency); }
  private load() {
    this.loading.set(true);
    forkJoin({ cards: this.service.cards(), accounts: this.accountsService.list() }).pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.loading.set(false))).subscribe({
      next: data => {
        this.cards.set(data.cards); this.accounts.set(data.accounts.filter(a => !a.archived));
        if (!this.accounts().some(a => a.id === this.forecastForm.controls.accountId.value)) this.forecastForm.controls.accountId.setValue(this.accounts().find(a => a.type === 'BANK')?.id ?? this.accounts()[0]?.id ?? '');
        this.calculate();
      }, error: error => this.showError(error),
    });
  }
  calculate() {
    if (this.forecastForm.invalid) return;
    const version = ++this.projectionVersion;
    this.projecting.set(true); this.error.set('');
    this.service.projection(this.forecastForm.getRawValue()).pipe(takeUntilDestroyed(this.destroyRef), finalize(() => { if (version === this.projectionVersion) this.projecting.set(false); })).subscribe({
      next: result => {
        if (version !== this.projectionVersion) return;
        this.projection.set(result); this.chartData = { labels: result.points.map(p => p.date), datasets: [{ label: `Saldo (${result.account.currency})`, data: result.points.map(p => p.balance), borderColor: '#3366ff', backgroundColor: 'rgba(51,102,255,.12)', fill: true, tension: 0 }] };
      }, error: error => { if (version === this.projectionVersion) this.showError(error); },
    });
  }
  configure(card: CardControl) {
    if (this.busy()) return;
    this.configuredCard.set(card); const profile = card.cardProfile;
    this.cardForm.reset({ creditLimit: Number(profile?.creditLimit ?? 0), closingDay: profile?.closingDay ?? 1, paymentDay: profile?.paymentDay ?? 15, paymentAccountId: profile?.paymentAccountId ?? '' });
  }
  saveCard() {
    const card = this.configuredCard(); if (!card || this.cardForm.invalid || this.busy()) return;
    this.busy.set(true); this.error.set('');
    const data = this.cardForm.getRawValue();
    this.service.configure(card.id, { ...data, paymentAccountId: data.paymentAccountId || null }).pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.busy.set(false))).subscribe({
      next: () => { this.configuredCard.set(null); this.notice.set('Configuración de tarjeta guardada.'); this.load(); }, error: error => this.showError(error),
    });
  }
  editStatement(card: CardControl, statement?: CardStatement) {
    if (this.busy()) return;
    this.statementEditor.set({ card, id: statement?.id });
    this.statementForm.reset({ closingDate: statement?.closingDate.slice(0, 10) ?? this.calendarToday, dueDate: statement?.dueDate.slice(0, 10) ?? card.nextPaymentDate ?? this.calendarToday,
      plannedPaymentDate: statement?.plannedPaymentDate?.slice(0, 10) ?? '', total: Number(statement?.total ?? 0), minimumPayment: Number(statement?.minimumPayment ?? 0) });
  }
  saveStatement() {
    const editor = this.statementEditor(); if (!editor || this.statementForm.invalid || this.busy()) return;
    this.busy.set(true); this.error.set(''); const data = this.statementForm.getRawValue();
    this.service.saveStatement({ ...data, cardAccountId: editor.card.id, plannedPaymentDate: data.plannedPaymentDate || null }, editor.id).pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.busy.set(false))).subscribe({
      next: () => { this.statementEditor.set(null); this.notice.set('Extracto guardado para la planificación.'); this.load(); }, error: error => this.showError(error),
    });
  }
  removeStatement(id: string) {
    if (this.busy()) return;
    this.busy.set(true); this.error.set('');
    this.service.removeStatement(id).pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.busy.set(false))).subscribe({
      next: () => { this.deletingStatement.set(null); if (this.statementEditor()?.id === id) this.statementEditor.set(null); this.notice.set('Extracto eliminado.'); this.load(); }, error: error => this.showError(error),
    });
  }
  openPayment(card: CardControl, statement: CardStatement) {
    if (this.busy() || this.hasPendingPayment()) return;
    this.paymentEditor.set({ card, statement });
    this.paymentForm.reset({ fromAccountId: card.cardProfile?.paymentAccountId ?? this.fundingAccounts(card.currency)[0]?.id ?? '', amount: statement.unplanned, date: this.calendarToday });
  }
  pay() {
    const editor = this.paymentEditor(); if (!editor || this.busy() || (!this.pendingPayment && this.paymentForm.invalid)) return;
    this.pendingPayment ??= { id: editor.statement.id, input: { ...this.paymentForm.getRawValue(), requestId: crypto.randomUUID() } };
    this.hasPendingPayment.set(true); this.busy.set(true); this.error.set('');
    this.service.pay(this.pendingPayment.id, this.pendingPayment.input).pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.busy.set(false))).subscribe({
      next: () => { this.closePayment(); this.notice.set('Pago registrado como transferencia entre cuentas.'); this.load(); }, error: error => this.showError(error),
    });
  }
  closePayment() { this.pendingPayment = null; this.hasPendingPayment.set(false); this.paymentEditor.set(null); }
  openRecurring(event: ProjectionEvent) {
    if (this.busy() || this.hasPendingRecurring() || !event.recurringPaymentId) return;
    this.recurringEditor.set(event); this.recurringForm.reset({ date: event.date, amount: Math.abs(event.amount) });
  }
  recordRecurring() {
    const editor = this.recurringEditor(); if (!editor?.recurringPaymentId || !editor.dueDate || this.busy() || (!this.pendingRecurring && this.recurringForm.invalid)) return;
    this.pendingRecurring ??= { id: editor.recurringPaymentId, input: { dueDate: editor.dueDate, ...this.recurringForm.getRawValue() } };
    this.hasPendingRecurring.set(true); this.busy.set(true); this.error.set('');
    this.service.recordRecurring(this.pendingRecurring.id, this.pendingRecurring.input).pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.busy.set(false))).subscribe({
      next: () => { this.closeRecurring(); this.notice.set('Pago recurrente registrado. Su previsión se reemplaza por el movimiento.'); this.load(); }, error: error => this.showError(error),
    });
  }
  closeRecurring() { this.pendingRecurring = null; this.hasPendingRecurring.set(false); this.recurringEditor.set(null); }
  payEvent(event: ProjectionEvent) {
    if (this.busy() || this.hasPendingPayment()) return;
    for (const card of this.cards()) {
      const statement = card.statements.find(s => s.id === event.statementId);
      if (statement) { this.openPayment(card, statement); this.paymentForm.patchValue({ amount: Math.abs(event.amount), date: event.date }); return; }
    }
  }
  private showError(error: { error?: { message?: string | string[] } }) { const message = error.error?.message; this.error.set(Array.isArray(message) ? message.join('. ') : message || 'No se pudo completar la operación.'); }
}
