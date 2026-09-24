import { Routes } from '@angular/router';
import { adminGuard } from '../../core/guards/admin.guard';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./users.component').then((m) => m.UsersComponent),
    canActivate: [adminGuard],
    data: {
      title: 'Usuarios',
    },
  },
];
