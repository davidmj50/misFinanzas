import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'dashboard',
    pathMatch: 'full'
  },
  {
    path: '',
    loadComponent: () => import('./layout').then(m => m.DefaultLayoutComponent),
    canActivate: [authGuard],
    data: {
      title: 'Home'
    },
    children: [
      {
        path: 'dashboard',
        loadChildren: () => import('./views/dashboard/routes').then((m) => m.routes)
      },
      {
        path: 'accounts',
        loadChildren: () => import('./views/accounts/routes').then((m) => m.routes)
      },
      {
        path: 'categories',
        loadChildren: () => import('./views/categories/routes').then((m) => m.routes)
      },
      {
        path: 'transactions',
        loadChildren: () => import('./views/transactions/routes').then((m) => m.routes)
      },
      {
        path: 'budgets',
        loadChildren: () => import('./views/budgets/routes').then((m) => m.routes)
      },
      {
        path: 'recurring-payments',
        loadChildren: () => import('./views/recurring-payments/routes').then((m) => m.routes)
      },
      {
        path: 'users',
        loadChildren: () => import('./views/users/routes').then((m) => m.routes)
      },
      {
        path: 'components',
        loadChildren: () => import('./views/components/routes').then((m) => m.routes)
      },
      {
        path: 'forms',
        loadChildren: () => import('./views/forms/routes').then((m) => m.routes)
      },
      {
        path: 'icons',
        loadChildren: () => import('./views/icons/routes').then((m) => m.routes)
      },
      {
        path: 'widgets',
        loadChildren: () => import('./views/widgets/routes').then((m) => m.routes)
      },
      {
        path: 'charts',
        loadChildren: () => import('./views/charts/routes').then((m) => m.routes)
      }
    ]
  },
  {
    path: 'authentication',
    loadChildren: () => import('./views/authentication/routes').then((m) => m.routes)
  },
  {
    path: 'error-pages',
    loadChildren: () => import('./views/error-pages/routes').then((m) => m.routes)
  },
  { path: '**', redirectTo: 'dashboard' }
];
