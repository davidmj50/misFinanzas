import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./recurring-payments.component').then((m) => m.RecurringPaymentsComponent),
    data: {
      title: 'Pagos recurrentes',
    },
  },
];
