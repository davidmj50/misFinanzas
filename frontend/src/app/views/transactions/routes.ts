import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./transactions.component').then((m) => m.TransactionsComponent),
    data: {
      title: 'Transacciones',
    },
  },
];
