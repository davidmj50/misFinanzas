import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./categories.component').then((m) => m.CategoriesComponent),
    data: {
      title: 'Categorías',
    },
  },
];
