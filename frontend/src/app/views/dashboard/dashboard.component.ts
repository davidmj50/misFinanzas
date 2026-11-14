import { ChartDescriptionDirective } from '../../core/directives/chart-description.directive';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { catchError, of, switchMap, tap } from 'rxjs';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ChartData, ChartOptions } from 'chart.js';
import { getStyle } from '@coreui/utils';
import {
  BadgeComponent,
  CardBodyComponent,
  CardComponent,
  CardHeaderComponent,

  FormSelectDirective,
  TableDirective,
} from '@coreui/angular';
import { ChartjsComponent } from '@coreui/angular-chartjs';
import { TransactionsService } from '../../core/services/transactions.service';
import { BudgetsService } from '../../core/services/budgets.service';
import { AccountsService } from '../../core/services/accounts.service';
import { SavingsGoalsService } from '../../core/services/savings-goals.service';
import { TransactionSummary, Account } from '../../core/models/finance.models';
import { Budget } from '../../core/models/budget.models';
import { SavingsGoal } from '../../core/models/savings-goal.models';
import { localDateString } from '../../core/utils/dates';

@Component({
  selector: 'app-dashboard',
  templateUrl: 'dashboard.component.html',
  imports: [ChartDescriptionDirective,
    BadgeComponent,
    CardBodyComponent,
    CardComponent,
    CardHeaderComponent,
    ChartjsComponent,

    FormSelectDirective,
    DecimalPipe,    RouterLink,

    TableDirective,
  ],
})
export class DashboardComponent implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  readonly currency = signal('COP');
  private readonly currencyChanges = toObservable(this.currency);
  readonly summary = signal<TransactionSummary | null>(null);
  readonly loading = signal(false);
  readonly accounts = signal<Account[]>([]);
  readonly budgets = signal<Budget[]>([]);
  readonly savingsGoals = signal<SavingsGoal[]>([]);
  readonly currencies = computed(() => [...new Set(['COP', ...this.accounts().map((a) => a.currency)])].sort());
  readonly errorMessage = signal<string | null>(null);

  chartData: ChartData = { labels: [], datasets: [] };
  chartOptions: ChartOptions = {};

  constructor(
    private readonly transactionsService: TransactionsService,
    private readonly budgetsService: BudgetsService,
    private readonly accountsService: AccountsService,
    private readonly savingsGoalsService: SavingsGoalsService,
  ) {}

  ngOnInit(): void {
    this.loading.set(true);
    const now = new Date();
    const dateFrom = localDateString(new Date(now.getFullYear(), now.getMonth() - 11, 1));

    this.currencyChanges.pipe(
      tap(() => { this.loading.set(true); this.summary.set(null); this.errorMessage.set(null); }),
      switchMap((currency) => this.transactionsService.summary(dateFrom, undefined, currency).pipe(
        catchError(() => { this.errorMessage.set('No se pudo cargar el resumen.'); return of(null); }),
      )),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe({
      next: (summary) => {
        this.summary.set(summary);
        if (summary) this.buildChart(summary);
        else this.chartData = { labels: [], datasets: [] };
        this.loading.set(false);
      },
    });

    this.accountsService.list().subscribe((accounts) => this.accounts.set(accounts.filter((a) => !a.archived)));
    this.budgetsService.list().subscribe((budgets) => this.budgets.set(budgets));
    this.savingsGoalsService.list().subscribe((goals) => this.savingsGoals.set(goals.filter((g) => !g.archived)));
  }

  progressColor(percentage: number): string {
    if (percentage >= 100) return 'danger';
    if (percentage >= 80) return 'warning';
    return 'success';
  }

  savingsProgressColor(percentage: number): string {
    if (percentage >= 100) return 'success';
    if (percentage >= 50) return 'info';
    return 'warning';
  }

  get balance(): number {
    const s = this.summary();
    return s ? s.totalIncome - s.totalExpense : 0;
  }

  get topExpenseCategories() {
    const s = this.summary();
    if (!s) return [];
    return s.byCategory
      .filter((c) => c.type === 'EXPENSE')
      .sort((a, b) => b.total - a.total)
      .slice(0, 6);
  }

  private buildChart(summary: TransactionSummary) {
    const success = getStyle('--cui-success') ?? '#2eb85c';
    const expense = getStyle('--cui-primary') ?? '#3657d6';
    const borderColor = getStyle('--cui-border-color-translucent');
    const bodyColor = getStyle('--cui-body-color');

    this.chartData = {
      labels: summary.byMonth.map((m) => m.month),
      datasets: [
        { label: 'Ingresos', data: summary.byMonth.map((m) => m.income), backgroundColor: success, borderRadius: 5, maxBarThickness: 22 },
        { label: 'Gastos', data: summary.byMonth.map((m) => m.expense), backgroundColor: expense, borderRadius: 5, maxBarThickness: 22 },
      ],
    };

    this.chartOptions = {
      maintainAspectRatio: false,
      animation: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? false : { duration: 350 },
      scales: {
        x: { grid: { color: borderColor, drawOnChartArea: false }, ticks: { color: bodyColor } },
        y: { grid: { color: borderColor }, ticks: { color: bodyColor }, beginAtZero: true },
      },
      plugins: {
        legend: { position: 'bottom', align: 'start', labels: { color: bodyColor, usePointStyle: true, pointStyle: 'rectRounded', padding: 24, font: { family: 'Manrope', size: 12 } } },
      },
    };
  }
}
