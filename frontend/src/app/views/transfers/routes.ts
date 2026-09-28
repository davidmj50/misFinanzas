import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./transfers.component').then((m) => m.TransfersComponent),
    data: {
      title: 'Transferencias',
    },
  },
];
