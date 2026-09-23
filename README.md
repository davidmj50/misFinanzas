# MisFinanzas

Backoffice personal para llevar el control de ingresos y gastos (cuenta bancaria y tarjeta de crédito).

- **Frontend**: Angular 22 + [CoreUI Free Admin Template](https://github.com/coreui/coreui-free-angular-admin-template) (`frontend/`)
- **Backend**: NestJS + Prisma + PostgreSQL (`backend/`)

## Funcionalidad

- Registro/login de usuario (JWT).
- Cuentas: cuentas bancarias, tarjetas de crédito o efectivo.
- Categorías de ingreso/gasto (con subcategorías).
- Transacciones: monto, tipo, cuenta, categoría, comercio, método de pago, etiquetas, notas, recurrencia.
- Filtros y paginación de transacciones.
- Dashboard con totales de ingresos/gastos, balance, gráfico mensual y top categorías de gasto.

## Estructura

```
MisFinanzas/
  backend/    API NestJS + Prisma (PostgreSQL)
  frontend/   Angular (CoreUI Free Admin Template)
```

## Requisitos

- Node.js **v22.22.3+** (o v24.15.0+ / v26+). El Angular CLI 22 exige esta versión mínima; si tienes
  una versión más antigua (por ejemplo v22.21.0), el comando `ng` se niega a ejecutar. Actualiza Node
  antes de trabajar en el frontend: https://nodejs.org/
- PostgreSQL (local, Docker, o un proveedor gratuito como Supabase/Neon — ver sección de despliegue).

## Desarrollo local

### Backend

```bash
cd backend
cp .env.example .env
# Edita .env con tu DATABASE_URL y un JWT_SECRET propio
npm install
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed   # opcional: crea un usuario demo y categorías por defecto
npm run start:dev
```

La API queda disponible en `http://localhost:3000/api`.

### Frontend

```bash
cd frontend
npm install
npm start
```

La app queda disponible en `http://localhost:4200`. Por defecto apunta a `http://localhost:3000/api`
(ver `frontend/src/environments/environment.ts`).

## Despliegue gratuito

### Base de datos: PostgreSQL gratis

- **[Supabase](https://supabase.com)** (recomendado): Postgres gratis con 500MB, panel de administración
  incluido. Copia el "Connection string" (modo *Transaction* o *Session*) como `DATABASE_URL`.
- **[Neon](https://neon.tech)**: Postgres serverless gratis, buena opción alternativa si prefieres no
  pausar la base de datos por inactividad.

### Backend: Render (gratis)

1. Sube este repositorio a GitHub.
2. En [Render](https://render.com), crea un **Web Service** nuevo apuntando a la carpeta `backend/`.
3. Configuración:
   - Build command: `npm install && npm run prisma:generate && npm run build`
   - Start command: `npm run prisma:deploy && npm run start:prod`
   - Variables de entorno: `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGINS` (la URL de tu frontend desplegado).
4. El plan gratuito de Render "duerme" el servicio tras 15 minutos sin tráfico — el primer request del
   día tarda unos segundos más (cold start). Aceptable para uso personal.

### Frontend: Render / Netlify / Vercel / GitHub Pages (gratis, estático)

1. Antes de compilar, edita `frontend/src/environments/environment.production.ts` con la URL real de tu
   backend desplegado en Render.
2. Build command: `npm install && npm run build`
3. Publish directory: `dist/coreui-free-angular-admin-template/browser`
4. Cualquiera de estas opciones tiene plan gratuito permanente para sitios estáticos:
   - **Render** (Static Site)
   - **Netlify**
   - **Vercel**
   - **GitHub Pages** (requiere ajustar `base-href` si no se sirve desde la raíz)

## Notas de seguridad

- Usa un `JWT_SECRET` largo y aleatorio en producción (no el valor de ejemplo de `.env.example`).
- `CORS_ORIGINS` en el backend debe listar exactamente el dominio del frontend desplegado.
- Las contraseñas se guardan con `bcrypt` (12 rondas); nunca se devuelven en las respuestas de la API.
