import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./accounts.component').then((m) => m.AccountsComponent),
    data: {
      title: 'Cuentas',
    },
  },
];
