import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./savings-goals.component').then((m) => m.SavingsGoalsComponent),
    data: {
      title: 'Metas de ahorro',
    },
  },
];
