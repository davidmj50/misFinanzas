import { Component, OnInit, computed, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { forkJoin } from 'rxjs';
import {
  AlertComponent,
  ButtonDirective,
  CardBodyComponent,
  CardComponent,
  CardHeaderComponent,
  ColComponent,
  RowComponent,
} from '@coreui/angular';
import { RecurringPaymentsService } from '../../core/services/recurring-payments.service';
import { SavingsGoalsService } from '../../core/services/savings-goals.service';
import { RecurringPayment } from '../../core/models/recurring-payment.models';
import { SavingsGoal } from '../../core/models/savings-goal.models';

interface CalendarEvent {
  type: 'payment' | 'goal';
  label: string;
  amount?: number;
}

interface CalendarCell {
  day: number | null;
  isToday: boolean;
  events: CalendarEvent[];
}

const WEEKDAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

@Component({
  selector: 'app-calendar',
  templateUrl: './calendar.component.html',
  styleUrl: './calendar.component.scss',
  imports: [
    AlertComponent,
    ButtonDirective,
    CardBodyComponent,
    CardComponent,
    CardHeaderComponent,
    ColComponent,
    DecimalPipe,
    RowComponent,
  ],
})
export class CalendarComponent implements OnInit {
  readonly weekdays = WEEKDAYS;
  readonly loading = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly currentMonth = signal(this.startOfMonth(new Date()));
  readonly recurringPayments = signal<RecurringPayment[]>([]);
  readonly savingsGoals = signal<SavingsGoal[]>([]);

  readonly monthLabel = computed(() => {
    const label = this.currentMonth().toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });
    return label.charAt(0).toUpperCase() + label.slice(1);
  });

  readonly calendarCells = computed(() =>
    this.buildCalendarCells(this.currentMonth(), this.recurringPayments(), this.savingsGoals()),
  );

  constructor(
    private readonly recurringPaymentsService: RecurringPaymentsService,
    private readonly savingsGoalsService: SavingsGoalsService,
  ) {}

  ngOnInit(): void {
    this.loading.set(true);
    this.errorMessage.set(null);
    forkJoin({
      payments: this.recurringPaymentsService.list(),
      goals: this.savingsGoalsService.list(),
    }).subscribe({
      next: ({ payments, goals }) => {
        this.recurringPayments.set(payments.filter((p) => p.active));
        this.savingsGoals.set(goals.filter((g) => !g.archived && g.targetDate));
        this.loading.set(false);
      },
      error: () => {
        this.errorMessage.set('No se pudo cargar el calendario.');
        this.loading.set(false);
      },
    });
  }

  prevMonth() {
    this.currentMonth.update((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  }

  nextMonth() {
    this.currentMonth.update((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1));
  }

  goToday() {
    this.currentMonth.set(this.startOfMonth(new Date()));
  }

  private startOfMonth(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }

  private buildCalendarCells(monthStart: Date, payments: RecurringPayment[], goals: SavingsGoal[]): CalendarCell[] {
    const year = monthStart.getFullYear();
    const month = monthStart.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstWeekday = new Date(year, month, 1).getDay();

    const today = new Date();
    const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;

    const eventsByDay = new Map<number, CalendarEvent[]>();
    const addEvent = (day: number, event: CalendarEvent) => {
      const events = eventsByDay.get(day) ?? [];
      events.push(event);
      eventsByDay.set(day, events);
    };

    for (const payment of payments) {
      const day = Math.min(payment.dueDay, daysInMonth);
      addEvent(day, { type: 'payment', label: payment.name, amount: Number(payment.amount) });
    }

    for (const goal of goals) {
      // targetDate llega como fecha UTC-medianoche (columna DATE); usar getters
      // UTC evita que, en zonas detrás de UTC (ej. Colombia), se corra un día.
      const targetDate = new Date(goal.targetDate!);
      if (targetDate.getUTCFullYear() === year && targetDate.getUTCMonth() === month) {
        addEvent(targetDate.getUTCDate(), { type: 'goal', label: goal.name });
      }
    }

    const cells: CalendarCell[] = [];
    for (let i = 0; i < firstWeekday; i++) {
      cells.push({ day: null, isToday: false, events: [] });
    }
    for (let day = 1; day <= daysInMonth; day++) {
      cells.push({ day, isToday: isCurrentMonth && today.getDate() === day, events: eventsByDay.get(day) ?? [] });
    }
    while (cells.length % 7 !== 0) {
      cells.push({ day: null, isToday: false, events: [] });
    }

    return cells;
  }
}
