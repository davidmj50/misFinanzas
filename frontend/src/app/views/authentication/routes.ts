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
      // Las pantallas de contraseña de la plantilla no implementan una recuperación real.
      { path: '**', redirectTo: 'login' },
    ],
  },
];
