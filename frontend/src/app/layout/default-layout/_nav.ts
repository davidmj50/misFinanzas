import { INavData } from '@coreui/angular';

export const navItems: INavData[] = [
  { name: 'Resumen general', url: '/dashboard', iconComponent: { name: 'cil-speedometer' } },
  { title: true, name: 'Movimientos' },
  { name: 'Transacciones', url: '/transactions', iconComponent: { name: 'cil-list' } },
  { name: 'Transferencias', url: '/transfers', iconComponent: { name: 'cil-share' } },
  { name: 'Comprobantes', url: '/expense-documents', iconComponent: { name: 'cil-paperclip' } },
  { name: 'Importar movimientos', url: '/imports', iconComponent: { name: 'cil-inbox' } },
  { title: true, name: 'Planificación' },
  { name: 'Cuentas y tarjetas', url: '/accounts', iconComponent: { name: 'cil-credit-card' } },
  { name: 'Tarjetas y proyección', url: '/planning', iconComponent: { name: 'cil-chart' } },
  { name: 'Presupuestos', url: '/budgets', iconComponent: { name: 'cil-calculator' } },
  { name: 'Pagos recurrentes', url: '/recurring-payments', iconComponent: { name: 'cil-bell' } },
  { name: 'Metas de ahorro', url: '/savings-goals', iconComponent: { name: 'cil-wallet' } },
  { name: 'Calendario', url: '/calendar', iconComponent: { name: 'cil-calendar' } },
  { title: true, name: 'Organización' },
  { name: 'Categorías', url: '/categories', iconComponent: { name: 'cil-tags' } },
  { name: 'Reglas de categorización', url: '/categorization-rules', iconComponent: { name: 'cil-task' } },
  { title: true, name: 'Tu aplicación' },
  { name: 'Registro rápido', url: '/quick-entry', iconComponent: { name: 'cil-pencil' } },
  { name: 'Instalar en el celular', url: '/install', iconComponent: { name: 'cil-cloud-download' } },
  { name: 'Usuarios', url: '/users', iconComponent: { name: 'cil-people' } },
];
