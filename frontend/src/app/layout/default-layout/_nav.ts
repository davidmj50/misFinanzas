import { INavData } from '@coreui/angular';

export const navItems: INavData[] = [
  {
    name: 'Dashboard',
    url: '/dashboard',
    iconComponent: { name: 'cil-speedometer' }
  },
  {
    name: 'Transacciones',
    url: '/transactions',
    iconComponent: { name: 'cil-list' }
  },
  {
    name: 'Cuentas',
    url: '/accounts',
    iconComponent: { name: 'cil-credit-card' }
  },
  {
    name: 'Categorías',
    url: '/categories',
    iconComponent: { name: 'cil-tags' }
  },
  {
    name: 'Presupuestos',
    url: '/budgets',
    iconComponent: { name: 'cil-calculator' }
  },
  {
    name: 'Pagos recurrentes',
    url: '/recurring-payments',
    iconComponent: { name: 'cil-bell' }
  },
  {
    name: 'Metas de ahorro',
    url: '/savings-goals',
    iconComponent: { name: 'cil-wallet' }
  },
  {
    name: 'Usuarios',
    url: '/users',
    iconComponent: { name: 'cil-people' }
  }
];
