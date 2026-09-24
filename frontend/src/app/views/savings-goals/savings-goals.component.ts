import { Component, OnInit, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
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
  ModalBodyComponent,
  ModalComponent,
  ModalFooterComponent,
  ModalHeaderComponent,
  ModalTitleDirective,
  ProgressComponent,
  RowComponent,
  TableDirective,
} from '@coreui/angular';
import { SavingsGoalsService } from '../../core/services/savings-goals.service';
import { SavingsGoal } from '../../core/models/savings-goal.models';

@Component({
  selector: 'app-savings-goals',
  templateUrl: './savings-goals.component.html',
  imports: [
    AlertComponent,
    ButtonCloseDirective,
    ButtonDirective,
    CardBodyComponent,
    CardComponent,
    CardHeaderComponent,
    ColComponent,
    DatePipe,
    DecimalPipe,
    FormControlDirective,
    FormDirective,
    FormLabelDirective,
    ModalBodyComponent,
    ModalComponent,
    ModalFooterComponent,
    ModalHeaderComponent,
    ModalTitleDirective,
    ProgressComponent,
    ReactiveFormsModule,
    RowComponent,
    TableDirective,
  ],
})
export class SavingsGoalsComponent implements OnInit {
  readonly goals = signal<SavingsGoal[]>([]);
  readonly loading = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly expanded = signal<Set<string>>(new Set());

  readonly goalModalVisible = signal(false);
  readonly editingId = signal<string | null>(null);

  readonly contributionModalVisible = signal(false);
  readonly contributionGoalId = signal<string | null>(null);

  readonly goalForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    targetAmount: [0, [Validators.required, Validators.min(0.01)]],
    targetDate: [''],
  });

  readonly contributionForm = this.fb.nonNullable.group({
    amount: [0, [Validators.required]],
    date: [new Date().toISOString().slice(0, 10), [Validators.required]],
    note: [''],
  });

  constructor(
    private readonly fb: FormBuilder,
    private readonly savingsGoalsService: SavingsGoalsService,
  ) {}

  ngOnInit(): void {
    this.load();
  }

  load() {
    this.loading.set(true);
    this.errorMessage.set(null);
    this.savingsGoalsService.list().subscribe({
      next: (goals) => {
        this.goals.set(goals);
        this.loading.set(false);
      },
      error: () => {
        this.errorMessage.set('No se pudieron cargar las metas de ahorro.');
        this.loading.set(false);
      },
    });
  }

  toggleExpanded(goalId: string) {
    const next = new Set(this.expanded());
    if (next.has(goalId)) next.delete(goalId);
    else next.add(goalId);
    this.expanded.set(next);
  }

  isExpanded(goalId: string) {
    return this.expanded().has(goalId);
  }

  openCreate() {
    this.editingId.set(null);
    this.goalForm.reset({ name: '', targetAmount: 0, targetDate: '' });
    this.goalModalVisible.set(true);
  }

  openEdit(goal: SavingsGoal) {
    this.editingId.set(goal.id);
    this.goalForm.reset({
      name: goal.name,
      targetAmount: Number(goal.targetAmount),
      targetDate: goal.targetDate ? goal.targetDate.slice(0, 10) : '',
    });
    this.goalModalVisible.set(true);
  }

  saveGoal() {
    if (this.goalForm.invalid) {
      this.goalForm.markAllAsTouched();
      return;
    }

    const raw = this.goalForm.getRawValue();
    const payload = { name: raw.name, targetAmount: raw.targetAmount, targetDate: raw.targetDate || undefined };
    const editingId = this.editingId();
    const request = editingId
      ? this.savingsGoalsService.update(editingId, payload)
      : this.savingsGoalsService.create(payload);

    request.subscribe({
      next: () => {
        this.goalModalVisible.set(false);
        this.load();
      },
      error: (err) => this.errorMessage.set(err.error?.message ?? 'No se pudo guardar la meta de ahorro.'),
    });
  }

  remove(goal: SavingsGoal) {
    if (!confirm(`¿Eliminar la meta "${goal.name}"? Se perderán todos sus aportes registrados.`)) return;
    this.savingsGoalsService.remove(goal.id).subscribe({
      next: () => this.load(),
      error: () => this.errorMessage.set('No se pudo eliminar la meta de ahorro.'),
    });
  }

  openContribution(goalId: string) {
    this.contributionGoalId.set(goalId);
    this.contributionForm.reset({ amount: 0, date: new Date().toISOString().slice(0, 10), note: '' });
    this.contributionModalVisible.set(true);
  }

  saveContribution() {
    if (this.contributionForm.invalid) {
      this.contributionForm.markAllAsTouched();
      return;
    }

    const goalId = this.contributionGoalId();
    if (!goalId) return;

    const raw = this.contributionForm.getRawValue();
    const payload = { amount: raw.amount, date: raw.date, note: raw.note || undefined };

    this.savingsGoalsService.addContribution(goalId, payload).subscribe({
      next: () => {
        this.contributionModalVisible.set(false);
        this.load();
      },
      error: (err) => this.errorMessage.set(err.error?.message ?? 'No se pudo registrar el aporte.'),
    });
  }

  removeContribution(goalId: string, contributionId: string) {
    if (!confirm('¿Eliminar este aporte?')) return;
    this.savingsGoalsService.removeContribution(goalId, contributionId).subscribe({
      next: () => this.load(),
      error: () => this.errorMessage.set('No se pudo eliminar el aporte.'),
    });
  }

  progressColor(percentage: number): string {
    if (percentage >= 100) return 'success';
    if (percentage >= 50) return 'info';
    return 'warning';
  }
}
