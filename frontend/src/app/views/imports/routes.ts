import { Routes } from '@angular/router';
export const routes: Routes = [{ path: '', loadComponent: () => import('./imports.component').then(m => m.ImportsComponent), data: { title: 'Importar movimientos' } }];
