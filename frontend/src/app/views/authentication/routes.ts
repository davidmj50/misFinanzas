import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    children: [
      { path: '', redirectTo: 'login', pathMatch: 'full' },
      {
        path: 'login',
        loadComponent: () => import('./login/login.component').then(m => m.LoginComponent),
        data: { title: 'Ingresar' },
      },
      {
        path: 'register',
        loadComponent: () => import('./register/register.component').then(m => m.RegisterComponent),
        data: { title: 'Registro' },
      },
      ...['forgot-password', 'reset-password', 'verify-email'].map(mode => ({ path: mode, loadComponent: () => import('./recovery/recovery.component').then(m => m.RecoveryComponent), data: { mode, title: 'Seguridad de tu cuenta' } })),
      { path: '**', redirectTo: 'login' },
    ],
  },
];
