import { Component, OnInit, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { ChartData, ChartOptions } from 'chart.js';
import { getStyle } from '@coreui/utils';
import {
  BadgeComponent,
  CardBodyComponent,
  CardComponent,
  CardHeaderComponent,
  ColComponent,
  RowComponent,
  TableDirective,
} from '@coreui/angular';
import { ChartjsComponent } from '@coreui/angular-chartjs';
import { TransactionsService } from '../../core/services/transactions.service';
import { TransactionSummary } from '../../core/models/finance.models';

@Component({
  selector: 'app-dashboard',
  templateUrl: 'dashboard.component.html',
  imports: [
    BadgeComponent,
    CardBodyComponent,
    CardComponent,
    CardHeaderComponent,
    ChartjsComponent,
    ColComponent,
    DecimalPipe,
    RowComponent,
    TableDirective,
  ],
})
export class DashboardComponent implements OnInit {
  readonly summary = signal<TransactionSummary | null>(null);
  readonly loading = signal(false);

  chartData: ChartData = { labels: [], datasets: [] };
  chartOptions: ChartOptions = {};

  constructor(private readonly transactionsService: TransactionsService) {}

  ngOnInit(): void {
    this.loading.set(true);
    const now = new Date();
    const dateFrom = new Date(now.getFullYear(), now.getMonth() - 11, 1).toISOString().slice(0, 10);

    this.transactionsService.summary(dateFrom).subscribe({
      next: (summary) => {
        this.summary.set(summary);
        this.buildChart(summary);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
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
    const danger = getStyle('--cui-danger') ?? '#e55353';
    const borderColor = getStyle('--cui-border-color-translucent');
    const bodyColor = getStyle('--cui-body-color');

    this.chartData = {
      labels: summary.byMonth.map((m) => m.month),
      datasets: [
        { label: 'Ingresos', data: summary.byMonth.map((m) => m.income), backgroundColor: success },
        { label: 'Gastos', data: summary.byMonth.map((m) => m.expense), backgroundColor: danger },
      ],
    };

    this.chartOptions = {
      maintainAspectRatio: false,
      scales: {
        x: { grid: { color: borderColor, drawOnChartArea: false }, ticks: { color: bodyColor } },
        y: { grid: { color: borderColor }, ticks: { color: bodyColor }, beginAtZero: true },
      },
      plugins: {
        legend: { labels: { color: bodyColor } },
      },
    };
  }
}
