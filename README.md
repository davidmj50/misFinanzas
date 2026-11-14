# MisFinanzas

Backoffice personal para llevar el control de ingresos y gastos (cuenta bancaria y tarjeta de crédito).

- **Frontend**: Angular 22 + [CoreUI Free Admin Template](https://github.com/coreui/coreui-free-angular-admin-template) (`frontend/`)
- **Backend**: NestJS + Prisma + PostgreSQL (`backend/`)

## Funcionalidad

- Registro/login con sesiones revocables, recuperación de contraseña y verificación de correo.
- Cuentas: cuentas bancarias, tarjetas de crédito o efectivo.
- Categorías de ingreso/gasto (con subcategorías).
- Transacciones: monto, tipo, cuenta, categoría, comercio, método de pago, etiquetas, notas, recurrencia.
- Filtros y paginación de transacciones.
- Dashboard con totales de ingresos/gastos, balance, gráfico mensual y top categorías de gasto.
- Presupuestos mensuales en COP con alertas, pagos recurrentes y recordatorios por correo.
- Metas de ahorro con aportes, calendario de vencimientos y exportación de transacciones a Excel/PDF.
- Transferencias entre cuentas con salida y entrada vinculadas, historial y soporte para distintas monedas.
- Importación CSV, TSV y XLSX con asignación de columnas, vista previa y detección de duplicados.

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

## Reglas de monedas y categorías

- Cada movimiento hereda la moneda de su cuenta. Una moneda distinta enviada por la API se rechaza. Cambiar de cuenta no convierte el monto.
- El dashboard permite seleccionar una moneda; los totales y el gráfico corresponden exclusivamente a esa moneda. El correo mensual también separa los totales por moneda.
- Presupuestos y metas de ahorro se expresan en COP. Solo los gastos COP consumen un presupuesto. Los pagos recurrentes usan la moneda de su cuenta.
- La moneda de una cuenta con movimientos o pagos recurrentes no se puede cambiar. Los registros históricos no se convierten ni corrigen automáticamente: revisa cualquier dato antiguo que hubiera quedado etiquetado con otra moneda.
- Una categoría y su padre deben tener el mismo tipo; no se admiten ciclos. Para quitar el padre, la API acepta parentId: null. Las categorías en uso no pueden cambiar de tipo.

## Validación y despliegue

El workflow CI ejecuta lint, tipos, pruebas, compilaciones y comprobaciones de migraciones. Los despliegues de GitHub Actions se ejecutan después del éxito de ambos trabajos, solo desde main. Para una ejecución manual, usa el workflow CI; los flujos de despliegue son reutilizables y no se disparan solos.

Si Render o Netlify tienen activado su propio despliegue automático por Git, desactívalo en el panel del proveedor para que ese camino no omita las comprobaciones de GitHub Actions. Este ajuste remoto no se controla desde estos archivos.

Para pruebas locales del frontend, instala el Chromium requerido con npx playwright install --only-shell chromium. En Windows también puedes usar Edge instalado definiendo CHROME_BIN antes de npm test -- --watch=false.

La recuperación de contraseña por correo sigue pendiente. Sus pantallas de demostración no se exponen como rutas operativas; el administrador puede restablecer contraseñas desde Usuarios.

## Dependencias de seguridad

El backend mantiene Prisma 6 y aplica overrides acotados para resolver avisos de sus herramientas sin migrar el ORM: deepmerge-ts 8.0.0 bajo @prisma/config, e inquirer 8.2.7 y undici 6.29.1 bajo @nestjs/mau. Se verificaron la carga de configuración, validación y generación de Prisma, y el arranque de Mau. Revisa estos overrides al actualizar las dependencias que los originan. La versión 8 de deepmerge-ts cambia la fusión de Maps; la configuración actual no usa Maps. [Notas de deepmerge-ts 8](https://github.com/RebeccaStevens/deepmerge-ts/releases/tag/v8.0.0).

## Transferencias entre cuentas

En el menú **Transferencias**, elige origen, destino, fecha e importe. Puedes registrar un retiro a efectivo o el pago de una tarjeta. La operación crea una salida y una entrada dentro de una única transacción de base de datos. Actualiza los saldos y su evolución, y queda excluida de los ingresos, gastos, presupuestos y resumen mensual.

Si las cuentas tienen monedas distintas, introduce también el importe recibido en la moneda de destino. Las comisiones se registran como un gasto separado. No se calcula una tasa de cambio automática ni se exige saldo suficiente: este es un registro contable que permite documentar operaciones e historial, incluidas cuentas con saldo negativo.

Los reintentos del mismo formulario usan una clave para evitar duplicados. Para corregir una operación ya guardada, elimina la transferencia completa y regístrala nuevamente. Sus dos movimientos no se pueden editar ni borrar por separado. Las cuentas con transferencias vinculadas se pueden archivar; para eliminarlas hay que eliminar antes las transferencias. Los movimientos anteriores no se convierten automáticamente en transferencias.

La API ofrece `POST /api/transfers`, `GET /api/transfers?page=1&pageSize=25&accountId=...` y `DELETE /api/transfers/:id`. Todos requieren JWT. El POST acepta `fromAccountId`, `toAccountId`, `amount`, `date` (YYYY-MM-DD), `requestId` (UUID), y opcionalmente `destinationAmount` y `description`. El listado de transacciones admite `type=TRANSFER`; los filtros `INCOME` y `EXPENSE` excluyen los movimientos vinculados a transferencias.

Antes de ejecutar esta versión por primera vez, aplica la migración `20261113024000_add_transfers`:

```powershell
cd backend
npm run prisma:deploy
npm run prisma:generate
npm run build
```

La migración añade la tabla Transfer, una columna transferId opcional en Transaction e índices/restricciones. No transforma ni elimina registros anteriores. El despliegue de Render debe conservar su paso de migración antes de iniciar la nueva API.

Las pruebas e2e de transferencias usan datos temporales y solo se activan con `RUN_TRANSFER_DB_TESTS=true`, contra una `DATABASE_URL` local (`localhost`, `127.0.0.1` o `postgres`). CI aplica primero las migraciones en su PostgreSQL de prueba y ejecuta estas comprobaciones. No actives esa variable para una base con datos reales.

## Importación con detección de duplicados

Abre **Importar movimientos** en el menú o **Importar extracto** desde Transacciones:

1. Elige una cuenta activa y un archivo CSV, TSV o XLSX (hasta 2 MB y 500 movimientos).
2. Para CSV puedes elegir separador y UTF-8 o Windows-1252. Para Excel puedes elegir la hoja. Ajusta la fila que contiene los encabezados si el extracto tiene texto inicial.
3. Asigna las columnas de Fecha e Importe, y opcionalmente Tipo, Descripción, Comercio, Categoría, Moneda y Referencia. Elige el formato de fecha y el separador decimal para importes escritos como texto. Las celdas numéricas y de fecha de Excel se interpretan como sus tipos nativos.
4. Si no asignas Tipo, puedes usar importes con signo (negativo = gasto, positivo = ingreso), todos gastos o todos ingresos. Con Tipo se reconocen Ingreso/Gasto y Abono/Cargo, entre sus equivalentes en inglés.
5. Revisa los estados por fila. Solo los movimientos nuevos quedan seleccionados automáticamente. Las fechas y cantidades inválidas, monedas incompatibles y categorías no disponibles quedan bloqueadas. La moneda omitida hereda la de la cuenta; las categorías deben existir y ser compatibles con el tipo.
6. Confirma **Importar seleccionados**. El servidor vuelve a revisar los duplicados y guarda el lote de forma atómica. Ante un error de conexión, usa **Reintentar el mismo envío** para consultar/completar el mismo lote sin duplicarlo.

El archivo se procesa en el navegador. Solo se envían las filas normalizadas para revisar y guardar; el servidor conserva los movimientos y los metadatos del lote, no el archivo original.

La referencia debe identificar un movimiento de forma única dentro de la cuenta. Si ya existe o se repite en el archivo, no se puede volver a incluir. Sin referencia, la comprobación utiliza fecha, tipo, importe, moneda, descripción y comercio normalizados. También se señalan coincidencias posibles por fecha, tipo e importe; pueden ser compras legítimas distintas. El usuario puede incluir explícitamente esas coincidencias. Se advierte si coinciden con una transferencia ya registrada.

Las transferencias entre cuentas se registran desde Transferencias; no se convierten automáticamente a partir de un extracto. Las coincidencias de importación son una ayuda de revisión y no sustituyen una conciliación bancaria. Los movimientos de una cuenta no se comparan con otra cuenta ni con datos de otros usuarios.

Ejemplo CSV con punto y coma, fecha ISO y coma decimal:

```csv
Fecha;Monto;Tipo;Descripción;Comercio;Moneda;Referencia
2026-11-12;-12500,50;Gasto;Compra de ejemplo;Comercio de ejemplo;COP;referencia-unica-001
2026-11-13;50000;Ingreso;Ingreso de ejemplo;Empresa de ejemplo;COP;referencia-unica-002
```

La API ofrece `POST /api/imports/preview` con `{ accountId, rows }`, y `POST /api/imports/commit` con `{ accountId, rows, requestId, fileName }`. Cada fila lleva `rowId`, `date`, `type`, `amount` positivo, y campos opcionales `description`, `merchant`, `categoryId`, `currency`, `externalRef`, `notes` y `allowDuplicate`. La respuesta de guardado incluye `batchId`, `imported`, `skipped` y `total`; este último corresponde a las filas enviadas para guardar. La clave UUID de solicitud no se puede reutilizar con otros datos.

Antes de usar esta versión hay que aplicar la migración aditiva `20261113033000_add_import_batches`, además de la migración de transferencias si todavía está pendiente. Añade una tabla de lotes y una relación opcional en Transaction; no transforma ni elimina movimientos históricos. La ejecución contra Supabase requiere autorización explícita y no forma parte de las pruebas locales.

Las pruebas e2e de importación se activan con `RUN_IMPORT_DB_TESTS=true` y únicamente aceptan una base PostgreSQL local. CI las ejecuta después de aplicar las migraciones en su base de prueba.

## Reglas de categorización

Abre **Reglas de categorización** desde el menú o desde Importar movimientos. Crea una regla con nombre, categoría, campo donde buscar (descripción, comercio o cualquiera), condición (contiene, es igual a, empieza por), texto, prioridad y, opcionalmente, una cuenta. Puedes editarla, desactivarla o eliminarla. La sección **Probar reglas guardadas** permite comprobar un movimiento de ejemplo sin guardarlo.

Se aplica la primera regla activa compatible con el tipo del movimiento y la cuenta. Un número de prioridad menor se evalúa primero; los empates usan fecha de creación y después ID. La búsqueda es literal, ignora mayúsculas, tildes y espacios repetidos. En la opción descripción o comercio, la condición se evalúa sobre cada campo individualmente.

Las reglas completan únicamente las categorías omitidas. Las categorías reconocidas del archivo se conservan. La vista previa muestra la categoría sugerida y el nombre de la regla, y permite elegir otra categoría compatible o dejar la fila sin categoría. El guardado conserva la selección revisada, aunque las reglas cambien antes de confirmar. Las categorías se validan nuevamente al guardar y la detección de duplicados sigue activa. Las reglas no modifican movimientos históricos.

Ejemplo: categoría Alimentación (Gasto), Comercio contiene `supermercado`, prioridad 10, todas las cuentas. Un gasto cuyo comercio sea `SUPERMÉRCADO central` recibe Alimentación si no tenía categoría.

La API requiere JWT: `GET/POST /api/categorization-rules`, `PUT/DELETE /api/categorization-rules/:id` y `POST /api/categorization-rules/test`. Crear y editar usan el mismo cuerpo completo: `{ name, field, operator, pattern, priority, active, categoryId, accountId }`. `field` admite `ANY`, `DESCRIPTION`, `MERCHANT`; `operator` admite `CONTAINS`, `EQUALS`, `STARTS_WITH`; prioridad es un entero entre 0 y 9999; `accountId: null` significa todas las cuentas. El tipo se deriva de la categoría. La prueba acepta `{ accountId, type, description?, merchant? }`.

La respuesta de `/api/imports/preview` añade por fila `categoryId` y `matchedRule` (`{ id, name }` o null). En la API, omitir `categoryId` solicita categorización automática; enviar un UUID usa esa categoría; enviar null expresa dejarla sin categoría. Los clientes deben enviar al guardar las categorías de la vista previa para mantener la decisión revisada. La clave idempotente distingue el modo automático de la selección explícita sin categoría.

Eliminar una categoría o una cuenta elimina también sus reglas vinculadas. Así una regla de una cuenta eliminada nunca se convierte en una regla global. Una categoría utilizada por reglas no puede cambiar de tipo. Las reglas pertenecen al usuario autenticado y solo pueden vincular sus cuentas y categorías.

Antes de iniciar esta versión hay que aplicar `20261113043000_add_categorization_rules` y generar el cliente Prisma. Es una migración aditiva que crea la tabla, sus enums, índices y restricciones; no requiere recategorizar datos existentes. Usa `npm run prisma:deploy`, `npm run prisma:generate` y `npm run build` desde backend, una vez autorizada la migración en la base de destino. El despliegue debe aplicar migraciones antes de iniciar la nueva API.

Las 10 pruebas e2e nuevas se activan con `RUN_RULE_DB_TESTS=true` contra PostgreSQL local. CI las ejecuta junto con las pruebas de importación y transferencias después de aplicar las migraciones.

## Control de tarjetas y proyección de saldo

Abre **Tarjetas y proyección** desde el menú o desde Cuentas. Las tarjetas se crean en Cuentas con tipo Tarjeta de crédito. En esta pantalla se calcula el saldo con movimientos cuya fecha es hasta hoy, en la zona de la aplicación; los movimientos futuros se incorporan a la proyección el día indicado.

### Tarjetas y extractos

Configura cupo, día de corte, día de pago y cuenta bancaria o efectivo de pago en la misma moneda. Se muestran deuda según movimientos, cupo disponible y porcentaje de uso. Un saldo negativo en la tarjeta representa deuda; un saldo positivo representa crédito a favor. La deuda de partida se registra como saldo inicial negativo o mediante movimientos. Configurar o añadir extractos no crea gastos ni modifica ese saldo.

Los días de corte/pago 29–31 se ajustan al último día del mes. Si el día de pago cae antes o en el mismo día que el corte, se estima para el mes siguiente. Las fechas estimadas no ajustan festivos. Para planificar usa las fechas e importes exactos del extracto: corte ya ocurrido, vencimiento, total, mínimo y, opcionalmente, fecha prevista de pago.

Cada extracto es una fotografía del saldo exigido por el banco. Solo el extracto de corte más reciente se incluye en el plan; su total debe incluir cualquier saldo que el banco arrastre de períodos anteriores. Los extractos anteriores quedan como historial. También se admiten extractos en cero. Las transferencias hacia la tarjeta posteriores al corte se descuentan del pendiente, incluidas las registradas desde Transferencias. Los pagos vinculados explícitamente al mismo extracto se incluyen también si tienen fecha del propio corte. Otras transferencias del día del corte se consideran parte de su saldo de cierre; comprueba esa frontera contra el extracto.

**Registrar pago** crea una transferencia atómica desde la cuenta de pago hacia la tarjeta: actualiza ambos saldos y queda excluida de ingresos/gastos de los informes. Puede ser parcial o tener una fecha futura. Se muestran por separado pagos realizados hasta hoy, pagos con fecha futura y remanente sin programar. La operación valida propiedad, moneda, fecha, extracto más reciente e importe pendiente. Los reintentos conservan su UUID y no duplican la transferencia. Se puede eliminar el pago completo desde Transferencias; su importe vuelve al pendiente. Los extractos con pagos vinculados no se pueden eliminar hasta eliminar esas transferencias.

### Proyección

Elige una cuenta activa, horizonte de 30, 60 o 90 días, escenario de pago total o mínimo e inclusión de recurrentes. Se muestran saldo registrado hasta hoy, saldo final estimado, menor saldo del período, entradas/salidas previstas, gráfico diario y detalle de eventos. Se advierte del primer saldo negativo para banco/efectivo y del primer exceso de cupo para tarjeta.

La base es saldo inicial más movimientos registrados hasta hoy. Se añaden los movimientos futuros dentro del horizonte, los vencimientos mensuales recurrentes activos todavía sin registrar y el importe pendiente del último extracto de cada tarjeta que use esa cuenta de pago. La previsión tiene su contrapartida positiva al proyectar la tarjeta. Los pagos futuros ya registrados se descuentan del importe estimado del extracto y se contabilizan una sola vez por sus movimientos reales. Los extractos vencidos sin fecha prevista futura se sitúan hoy. Los recurrentes se incluyen desde hoy, sin inferir atrasos de meses anteriores.

El escenario mínimo cubre únicamente el mínimo pendiente declarado en el extracto. No estima el coste de financiar la deuda ni pagos de meses siguientes sin extracto. No se extrapolan sueldos, intereses, comisiones ni compras sin registrar. Los ingresos/gastos futuros se introducen en Transacciones. Las monedas no se convierten ni agregan. Si falta una cuenta de pago válida para una tarjeta, sus pagos estimados quedan fuera y la pantalla avisa.

Desde un evento recurrente, **Registrar recurrente** guarda su gasto con el importe y la fecha elegidos. La referencia `recurring:<id>:YYYY-MM` vincula el movimiento al mes, reemplaza la previsión y evita duplicados incluso si cambia el día de vencimiento. Si se registra con fecha futura, se usa ese movimiento y se omite la estimación correspondiente. Para corregirlo, elimina el movimiento y regístralo de nuevo. Los gastos antiguos sin esta vinculación no se concilian por similitud; revisa esos casos o excluye recurrentes del escenario. Desde un evento de extracto, el formulario de pago toma el importe y la fecha del escenario seleccionado.

### API y migración

Todas las rutas requieren JWT:

- `GET /api/planning/cards`: tarjetas activas, configuración, métricas a hoy y extractos con pagos.
- `PUT /api/planning/cards/:accountId`: `{ creditLimit, closingDay, paymentDay, paymentAccountId }`; cuenta de pago puede ser null.
- `POST /api/planning/statements` y `PUT /api/planning/statements/:id`: `{ cardAccountId, closingDate, dueDate, plannedPaymentDate?, total, minimumPayment }`.
- `DELETE /api/planning/statements/:id`: elimina un extracto sin pagos vinculados.
- `POST /api/planning/statements/:id/pay`: `{ fromAccountId, amount, date, requestId }`.
- `POST /api/planning/recurring/:id/record`: `{ dueDate, date, amount }`; dueDate identifica el vencimiento del mes.
- `GET /api/planning/projection?accountId=...&days=30&paymentMode=FULL&includeRecurring=true`: cálculo de solo lectura; modo `FULL` o `MINIMUM`.

Transferencias admite además `cardStatementId` opcional con las mismas validaciones de pago. Las cuentas vinculadas a la configuración/extractos conservan su tipo y moneda. Todas las cantidades se calculan con Decimal; el gráfico recibe valores numéricos finales.

Antes de iniciar la nueva API, aplica `20261113053000_add_card_planning` y cualquier migración anterior pendiente, y genera Prisma. Añade `CardProfile`, `CardStatement`, una relación opcional en Transfer e índices/restricciones. No crea movimientos históricos ni cambia sus importes. La ejecución en Supabase requiere autorización para esa base; las pruebas usan exclusivamente PostgreSQL temporal local.

La suite de planificación se activa con `RUN_PLANNING_DB_TESTS=true`. CI aplica migraciones antes de ejecutarla. Incluye pagos atómicos, concurrencia, idempotencia, aislamiento entre usuarios, pagos futuros, saldos arrastrados, extractos en cero y recurrentes. Las pruebas de cálculos cubren febrero bisiesto, cambios de año, límites de horizonte y precisión decimal.

## Comprobantes de gastos y extracción de datos

Abre **Comprobantes de gastos** o **Gasto con comprobante** desde Transacciones. Para un gasto existente, usa **Comprobantes (n)** en su fila. Se admiten hasta tres archivos por gasto, de hasta 5 MB cada uno: PDF, JPG/JPEG, PNG y WebP.

### Registrar un gasto con su comprobante

1. Selecciona uno o varios documentos. Las imágenes tienen una vista previa local.
2. Pulsa **Extraer datos** en el comprobante que contiene la información principal. Se proponen fecha, comercio y monto. Puedes cambiar la interpretación de fechas entre día/mes/año y mes/día/año, consultar el texto reconocido o cancelar la lectura.
3. Elige qué campos copiar mediante **Usar datos seleccionados**. Revisa y corrige el formulario, cuenta, categoría, descripción y notas.
4. Pulsa **Guardar gasto y documentos**. El gasto y todos los archivos se guardan en una única transacción de base de datos. Si se pierde la conexión, **Reintentar el mismo envío** conserva archivos, datos y clave para confirmar el resultado sin crear otro gasto.

El total se busca mediante etiquetas como Total a pagar, Valor total, Grand total o Total, evitando subtotal, impuestos y descuentos. Los totales contradictorios y las fechas imposibles quedan sin sugerencia. Se reconocen formatos comunes con coma o punto decimal y nombres de meses en español. Un símbolo `$` aislado no determina una moneda. Si se detecta una moneda explícita distinta de la cuenta, se exige elegir una cuenta compatible o confirmar el importe revisado en la moneda de la cuenta.

La lectura no guarda gastos automáticamente. La calidad depende del documento y del texto impreso; si falla puedes adjuntar el original y completar los datos manualmente. Las fotos se reducen para su lectura; no se modifica el archivo original que se adjunta. Para analizar imágenes de más de 24 megapíxeles se solicita reducirlas. La lectura tiene un máximo de 90 segundos y se limita a las primeras tres páginas de un PDF. Los PDF protegidos con contraseña requieren una copia sin protección para analizarlos.

### Gastos existentes

Puedes añadir, descargar y eliminar documentos sin modificar el movimiento. La extracción sigue disponible como consulta; los datos OCR no sobrescriben el gasto existente. Para editar sus datos usa Transacciones. Al eliminar el gasto se eliminan también sus archivos. Un gasto con comprobantes no puede cambiar a ingreso hasta retirar los documentos. Los ingresos y las transferencias quedan fuera de este flujo.

El mismo contenido no se puede adjuntar dos veces al mismo gasto. Los reintentos de una solicitud ya confirmada no vuelven a insertar documentos, incluso si después se elimina uno. Si el gasto se elimina, reintentar su creación anterior devuelve 410 y requiere iniciar un registro nuevo.

### Procesamiento y almacenamiento

La extracción se realiza en el navegador con Tesseract.js 7.0.0 y PDF.js 6.5.438. Los PDF con texto se leen directamente; las páginas escaneadas se renderizan y se aplica OCR. Los modelos compactos de español e inglés y los workers se sirven desde `assets/receipts`, en el mismo sitio. No se envían documentos a proveedores externos de OCR ni se necesitan claves de IA. Los recursos se cargan al analizar, sin añadir el motor OCR al paquete inicial de la aplicación.

El servidor recibe los documentos únicamente al guardar. Esta versión almacena los bytes originales en PostgreSQL/Supabase, junto con nombre, tipo detectado, tamaño y huella SHA-256. No utiliza un bucket público ni necesita credenciales adicionales de Storage. Los archivos consumen espacio de la base de datos y de sus copias de seguridad; los límites por archivo y gasto se aplican también en el servidor. El texto OCR no se almacena.

Las operaciones requieren JWT y propiedad del gasto/documento. Se validan formato por firma binaria y tamaño, se normalizan nombres y extensiones, y las descargas usan disposición attachment, nosniff y caché privada desactivada. Las tablas de documentos y solicitudes tienen RLS habilitado sin políticas para los roles de la API de Supabase. El backend debe usar la conexión de propietario de base de datos configurada para Prisma. Las restricciones y triggers mantienen la propiedad y el tipo de gasto, incluidos cambios concurrentes.

### API, pruebas y activación

`POST /api/expense-documents/expenses` crea un gasto con archivos. Usa multipart con `files` (1–3) y `metadata`, una cadena JSON con `{ requestId, accountId, categoryId?, date, amount, merchant?, description?, notes? }`. La moneda se hereda de la cuenta y el tipo es EXPENSE. `requestId` es un UUID; no se puede reutilizar con otro contenido.

Para adjuntar a un gasto existente usa `POST /api/expense-documents/expenses/:transactionId` con archivos y metadata `{ requestId }`. `GET` en esa misma ruta lista metadatos sin bytes. `GET /api/expense-documents/:documentId/file` descarga el original y `DELETE /api/expense-documents/:documentId` elimina solo el archivo. Crear/adjuntar devuelve `{ transactionId, documentIds, createdAt }`. La lista de Transacciones incluye `_count.expenseDocuments`.

La migración `20261113063000_add_expense_documents` crea `ExpenseDocument`, `DocumentUpload`, índices, relaciones, comprobación de tamaño, RLS y triggers de integridad. Es aditiva; no transforma movimientos históricos. Aplica las migraciones pendientes antes de iniciar la nueva API y genera el cliente Prisma. La ejecución contra Supabase requiere autorización para esa base; todas las pruebas de escritura se ejecutan en PostgreSQL temporal local.

CI activa las pruebas de API mediante `RUN_DOCUMENT_DB_TESTS=true`. Cubren propiedad, descarga de bytes originales, RLS, atomicidad, concurrencia, límites, archivos repetidos, reintentos y eliminación. Las pruebas del frontend cubren formatos numéricos y de fecha, total ambiguo, aplicación selectiva, moneda y cancelación/reintentos. El flujo completo se verificó con OCR real de imagen y PDF escaneado y lectura de PDF con texto, usando frontend de producción y API local.

Referencias de integración: [instalación local de Tesseract.js](https://github.com/naptha/tesseract.js/blob/master/docs/local-installation.md), [API de Tesseract.js](https://github.com/naptha/tesseract.js/blob/master/docs/api.md), [ejemplos oficiales de PDF.js](https://mozilla.github.io/pdf.js/examples/).

## Aplicación instalable y registro rápido

Abre **Instalar en el celular** desde el menú o el inicio de sesión. La aplicación publicada con HTTPS se puede añadir a la pantalla de inicio sin una tienda de aplicaciones:

- Android: abre el sitio en Chrome o Edge y pulsa **Instalar MisFinanzas** cuando el navegador ofrezca la instalación. También puedes usar Instalar aplicación / Añadir a pantalla de inicio desde su menú.
- iPhone: abre el sitio en Safari, toca Compartir, Añadir a pantalla de inicio, activa Abrir como app web si aparece y confirma Añadir.

El icono abre `/#/quick-entry`, una pantalla independiente con monto, cuenta, categoría opcional, fecha y comercio/concepto. Permite gastos e ingresos. El manifest incluye accesos a nuevo gasto, nuevo ingreso y comprobantes; su disponibilidad depende del navegador y sistema operativo. Si hace falta iniciar sesión, se vuelve al formulario solicitado.

### Borradores y conexión

El registro rápido conserva un único borrador por usuario y dispositivo en localStorage, incluido el identificador del envío pendiente. Puedes escribir monto, fecha y concepto sin internet y recuperar el formulario al volver a abrirlo. Las cuentas y categorías se consultan al conectar y se vuelven a validar al guardar. Si cambia la moneda de la cuenta, se exige revisar y confirmar el monto; no se convierte automáticamente.

Al reconectar no se envían movimientos automáticamente: revisa la fecha y pulsa **Guardar movimiento**. Si se pierde la respuesta, los datos quedan fijos y **Reintentar el mismo envío** conserva la misma clave, incluso después de recargar. El servidor confirma o completa una sola operación. Un error definitivo de validación permite corregir el formulario. El registro eliminado conserva su clave como tombstone para impedir que un reintento antiguo lo vuelva a crear.

El borrador contiene información del movimiento y permanece en ese navegador; no está cifrado por la aplicación. **Descartar borrador** lo elimina cuando no hay un envío pendiente. Cerrar sesión explícitamente elimina los borradores del dispositivo; si la sesión vence, se conserva para recuperarlo al iniciar sesión con el mismo usuario. Iniciar sesión con otro usuario elimina borradores ajenos. Borrar los datos del sitio o la limpieza del navegador puede eliminarlo. Si el almacenamiento falla, la pantalla avisa y hay que mantenerla abierta hasta confirmar el guardado.

El service worker guarda la interfaz, iconos y recursos públicos. Las peticiones de la API llevan `ngsw-bypass` y no se guardan en su caché. Los saldos, documentos y modelos OCR no están disponibles sin conexión. La interfaz debe haberse cargado y el service worker instalado antes de abrir sin internet. No es una cola de varios movimientos pendientes.

### Actualización y publicación

Una nueva versión muestra **Actualizar aplicación** y espera la acción del usuario; no recarga automáticamente. Guarda los formularios abiertos antes de actualizar. El registro rápido conserva su borrador antes de esa recarga y la bloquea si no puede almacenarlo. La página de instalación incluye Buscar actualizaciones.

El service worker solo se habilita en la compilación de producción. Para comprobar el artefacto:

```powershell
cd frontend
npm run build -- --configuration production
npm run verify:pwa
```

Sirve `dist/coreui-free-angular-admin-template/browser` en HTTPS (localhost también sirve para pruebas). Publica el directorio completo, incluidos `ngsw-worker.js`, `ngsw.json`, `manifest.webmanifest`, los iconos y `_headers`; no publiques solo index.html. La API también debe usar HTTPS y permitir el origen y las cabeceras de la aplicación. Netlify aplica el archivo `_headers` incluido para evitar caché persistente del manifest del service worker; en otro alojamiento replica esas cabeceras. Un teléfono que abra una IP local mediante HTTP no tiene las mismas condiciones que localhost en el PC. El botón de instalación depende de que el navegador ofrezca `beforeinstallprompt`; la guía manual siempre queda disponible.

### API, migración y pruebas

`POST /api/quick-entries` requiere JWT y acepta `{ requestId, accountId, categoryId?, type, amount, currency, date, merchant?, description?, notes? }`. `requestId` es UUID, `type` es INCOME o EXPENSE, el monto es positivo con hasta dos decimales y `date` usa YYYY-MM-DD. La moneda es una fotografía explícita de la cuenta. Se validan propiedad, cuenta activa y categoría compatible. Devuelve `{ transactionId, createdAt }`. Reutilizar la clave con otros datos devuelve 409; reintentar un movimiento eliminado devuelve 410. La transacción y su clave se guardan de forma atómica, con aislamiento serializable.

Antes de iniciar la API nueva, aplica `20261113073000_add_quick_entries` y todas las migraciones anteriores pendientes, genera Prisma y compila el backend:

```powershell
cd backend
npm run prisma:deploy
npm run prisma:generate
npm run build
```

La migración crea QuickEntryRequest, índices, relaciones y RLS sin políticas de acceso anónimo. No modifica movimientos existentes. La ejecución remota y la publicación no forman parte de las pruebas locales. El 13 de noviembre de 2026 se confirmó mediante consulta que Supabase tiene pendientes las migraciones de reglas, tarjetas/proyección, comprobantes y registro rápido.

CI verifica el artefacto PWA tras compilar y activa las diez pruebas de API nuevas con `RUN_QUICK_ENTRY_DB_TESTS=true`, exclusivamente contra PostgreSQL local. Se verifican idempotencia, concurrencia, propiedad, moneda, validación, borrado y atomicidad. Las pruebas del frontend cubren borradores, aislamiento por usuario, sesión, instalación, actualizaciones y reintentos. La prueba integral usa Edge con el service worker real, frontend de producción y API/base temporal: apertura sin conexión, recarga, respuesta perdida, actualización con borrador y retorno tras iniciar sesión. La guía iPhone se comprobó con agente de usuario simulado; la instalación final se confirma en un teléfono físico tras publicar.

Referencias: [service workers en Angular](https://angular.dev/ecosystem/service-workers/getting-started), [configuración de caché](https://angular.dev/ecosystem/service-workers/config), [actualizaciones](https://angular.dev/ecosystem/service-workers/communications), [ngsw-bypass y despliegue](https://angular.dev/ecosystem/service-workers/devops), [accesos rápidos del manifest](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/shortcuts), [añadir una app web en iPhone](https://support.apple.com/en-lamr/guide/iphone/iphea86e5236/ios).


## Cuenta y seguridad

La pantalla **Cuenta y seguridad** está disponible en el menú y en el menú de usuario. Incluye el estado del correo, reenvío de verificación, cambio de contraseña y las sesiones abiertas. El registro dirige a esta pantalla. Las cuentas anteriores pueden seguir usando sus finanzas mientras verifican su correo.

### Activación en producción

1. Aplicar la migración `20261114093000_add_account_security` con `npm run prisma:deploy` desde el backend, usando la conexión de migraciones ya configurada. No basta con publicar solamente el frontend. La migración añade dos tablas con RLS habilitado, sin políticas públicas, y dos columnas a User; conserva usuarios y movimientos existentes.
2. Configurar en el backend `FRONTEND_URL=https://misfinanzas-qr9v.netlify.app`, `RESEND_API_KEY` y `EMAIL_FROM` con un remitente de un dominio verificado en Resend. FRONTEND_URL debe ser el origen de confianza del frontend; HTTPS en producción y HTTP solo para localhost en desarrollo. No se utilizan Host ni cabeceras del cliente para construir enlaces. El remitente de pruebas de Resend puede limitar los destinatarios; debe sustituirse antes de ofrecer el servicio a clientes.
3. Regenerar Prisma, compilar y publicar backend y frontend de esta versión. El comando de inicio de Render existente aplica las migraciones antes de iniciar la API. Tras activar esta versión, los tokens anteriores sin identificador de sesión se rechazan: todos los usuarios deberán ingresar una vez de nuevo. Las contraseñas actuales se conservan.
4. Verificar desde una cuenta real el envío, la carpeta de spam y el dominio de los enlaces. La prueba automática usa una bandeja simulada y no acredita la entrega del proveedor en producción.

Si falta el proveedor o la URL de confianza, el cambio de contraseña y el control de sesiones siguen disponibles, y los formularios indican que el correo está deshabilitado. La pantalla nunca muestra claves de configuración. No se ha migrado Supabase ni publicado esta funcionalidad como parte de su implementación local.

### Comportamiento

- Las contraseñas nuevas requieren 15 caracteres Unicode, sin reglas artificiales de composición. Se admite pegar y usar gestores. El máximo de 72 bytes UTF-8 evita truncamientos de bcrypt; las contraseñas existentes siguen siendo válidas para ingresar. Se conservan las 12 rondas de bcrypt.
- Los enlaces usan 32 bytes aleatorios; solo se guarda su SHA-256 en la base. Recuperación vence en 30 minutos y verificación en 24 horas. Cada enlace es de un solo uso y solo se conserva el más reciente de cada propósito. Se exige esperar un minuto entre envíos, con un máximo de tres por hora por cuenta y propósito; también hay límites HTTP por IP.
- Solicitar recuperación responde igual para correos conocidos y desconocidos. La entrega se separa de la respuesta pública. El proveedor de correo registra errores genéricos, sin contraseñas, enlaces ni tokens. El envío automático de verificación y los avisos de contraseña no usan una cola persistente: si el proceso se interrumpe puede ser necesario solicitar un enlace nuevo.
- Los enlaces llevan el token en el fragmento de Angular, se retiran de la dirección al abrir la pantalla y permanecen solo en memoria hasta enviar el formulario. No se guardan contraseñas ni enlaces en almacenamiento del navegador. Recargar esa pantalla exige abrir de nuevo el correo. Verificar requiere pulsar **Confirmar mi correo**; abrir el enlace no modifica la cuenta.
- Cambiar o recuperar la contraseña invalida todas las sesiones y enlaces pendientes en la misma transacción, y exige iniciar sesión de nuevo. Recuperar el acceso también confirma la posesión del correo. La edición administrativa de correo o contraseña invalida sesiones y enlaces; cambiar el correo elimina su verificación.
- Las sesiones incluyen navegador/sistema orientativos, inicio, actividad y vencimiento; no se almacena la IP ni la cadena completa del agente. La actividad se actualiza como máximo cada cinco minutos. Se permiten hasta 20 sesiones activas; iniciar otra cierra la más antigua. Vencen según JWT_EXPIRES_IN_SECONDS (por defecto siete días, rango permitido de un minuto a 30 días).
- Cerrar un dispositivo revoca realmente su sesión en el servidor. Cerrar las otras sesiones exige la contraseña actual. El cierre explícito intenta revocar la sesión y elimina el borrador local; si no hay conexión, el token remoto puede seguir activo hasta su vencimiento o hasta revocarlo desde otro dispositivo. El cierre por vencimiento o cambio de contraseña conserva los borradores pendientes de registro rápido de su propietario.
- La verificación es informativa en esta entrega; no bloquea los movimientos ni sustituye un segundo factor. MFA y recuperación mediante códigos de respaldo quedan para otra entrega.

### API y pruebas

Rutas nuevas bajo `/api/auth`: POST password/forgot, password/reset y email/verify son públicas; GET security, POST email/resend, password/change, logout, sessions/revoke-others y DELETE sessions/:id requieren una sesión activa. Las respuestas de autenticación se marcan para no almacenar en caché.

CI activa la suite con `RUN_ACCOUNT_SECURITY_DB_TESTS=true` únicamente contra PostgreSQL local. Comprueba propiedad, revocación real, concurrencia de enlaces, vencimiento, reutilización, Unicode, limitación de envíos, cambios administrativos y las contraseñas heredadas. Las pruebas HTTP de límites son independientes de las pruebas funcionales. El navegador se verifica con frontend de producción, API/base locales y correo simulado: formularios, navegación, enlaces sin persistencia, cierre de sesiones, recuperación, diseño adaptable, modo oscuro y accesibilidad. No se envían correos a personas ni se modifican datos de producción en estas pruebas.
