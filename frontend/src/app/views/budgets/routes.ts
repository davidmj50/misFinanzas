import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./budgets.component').then((m) => m.BudgetsComponent),
    data: {
      title: 'Presupuestos',
    },
  },
];
