# CRM del equipo (panel admin) — design spec

**Fecha:** 15 de septiembre, 2026
**Estado:** Aprobado por Diego (diseño verbal), en implementación
**Proyecto:** 3 de 4 de la serie iniciada con el shell CRM del candidato (se adelantó sobre `protect.js` por decisión de Diego; `protect.js` sigue después)

## Contexto

Diego pidió (15 sep) que el equipo tenga "súper buena visibilidad de todo:
ingresos, cuánto se ha pagado de utilidades, inscripciones, etc.", mejorando
todo lo que hoy cuelga de `admin-index.html`, **con la misma estructura visual
ya desarrollada** para el candidato (shell CRM: sidebar, hero, tarjetas, tema
claro/oscuro).

Hoy el área admin son 5 páginas sueltas, cada una con su top-bar, sin sidebar
ni tema claro: `admin-index` (ligas), `admin-precios` (montos por fase, altas,
liberación manual), `admin-sesiones` (sesiones de Alineación en Google
Calendar/Zoom), `admin-kpis` (embudo, ingresos vs proyectado, reparto por lote)
y `admin-utilidades` (configuración del reparto por lote). Todas comparten los
mismos 9 tokens de `:root` que las páginas del flujo (verificado), así que el
tema claro se aplica igual.

Dos cosas no existen y las pidió explícitamente:
- **Ver en qué paso va cada candidato.** La fila de `candidatos_ec1375` solo la
  lee el propio candidato (RLS); el equipo no puede.
- **Cuánto se ha pagado de utilidades.** Solo existe el reparto teórico por
  lote (`reparto_utilidades`); ninguna tabla registra entregas reales.

## Decisiones tomadas con Diego

| Decisión | Elección |
|---|---|
| Lectura de candidatos por admins | RPC `admin_lista_candidatos()` security definer + `is_admin()` (mismo patrón que `admin_lista_nombres`), recortando foto/firmas/estado del motor. |
| Utilidades pagadas | Tabla nueva `utilidades_pagos` (lote, socio, monto, fecha, nota) con RLS admin; alta y baja desde `admin-utilidades.html`. |
| Estructura visual | Reutilizar `crm-shell.js`/`crm-shell.css` con un modo `admin` (sidebar del equipo), no una copia. |

## Arquitectura

### Módulos compartidos (extensiones, no archivos nuevos salvo uno)

- **`flow-status.js`** — se extrae `FlowStatus.computeSteps(ctx)` (función PURA,
  síncrona): recibe `{ row, localAuto, alineacionAuth, entregaAuth, esBypass }`
  y regresa los 10 pasos con `done/current/locked/reason`. `getSteps()` la
  llama con los datos de la sesión actual; el CRM admin la llama por cada
  candidato con su fila del RPC (`localAuto` = `row.autodiagnostico_data`,
  porque las respuestas y el NDA viven ahí también). Una sola lógica de
  "qué cuenta como completo", nunca una copia.
- **`crm-shell.js`** — `mount({ mode: 'admin', currentPageId })`. Misma
  mecánica que `full` (mueve el DOM a `<main>`, encabezado, tema), pero el
  sidebar pinta `ADMIN_NAV`: Panel (`admin-crm.html`), Candidatos
  (`admin-candidatos.html`), Precios y pagos (`admin-precios.html`), Sesiones
  (`admin-sesiones.html`), KPIs (`admin-kpis.html`), Utilidades
  (`admin-utilidades.html`), Índice de módulos (`admin-index.html`), y abajo
  "Ver como candidato" (`panel.html`). Pill "EQUIPO", usuario = correo admin.
  Auto-montaje con `<script src="crm-shell.js" data-crm-mode="admin"
  data-crm-page="admin-precios">`: al `load`, si hay sesión y `Auth.isAdmin`,
  monta.
- **`auth.js`** — `renderAdminGate()` entra directo si ya hay sesión de un
  correo admin (misma corrección que el gate del candidato); casilla
  "Mantener mi sesión iniciada" en los pasos de contraseña del admin.
- **`admin-data.js`** (NUEVO, compartido solo por páginas admin) — carga y
  cálculos que hoy están duplicados entre `admin-kpis` y `admin-utilidades`
  y que el panel y la lista de candidatos necesitan igual:
  `AdminData.cargar()` (Promise.allSettled de `candidatos_precio`,
  `candidatos_fase_pagos`, `reparto_utilidades`, `utilidades_pagos`,
  RPC `admin_lista_nombres`, RPC `admin_lista_candidatos`, y
  `GET /api/sesiones-alineacion` para próximas sesiones con inscritos),
  `AdminData.kpis(datos, lote)` (port exacto de `calcularKPIs` de admin-kpis),
  `AdminData.reparto(datos, lote)` (port de `calcularReparto`),
  `AdminData.utilidades(datos, lote)` (reparto + pagado + pendiente por socio),
  `AdminData.candidatos(datos)` (une precio + pagos + fila del RPC → por
  candidato: nombre, correo, lote, estado, fase pagada, pasos vía
  `FlowStatus.computeSteps`, documentos X/15 vía `CrmShell._helpers`,
  última actividad). Las páginas viejas (`admin-kpis`, `admin-utilidades`,
  `admin-precios`) NO se refactorizan para usarlo en este proyecto (fuera de
  alcance; backlog).

### Páginas

- **`admin-crm.html`** (nueva, home del equipo). Gate admin → shell admin →
  hero "Panel del equipo" con cifras: candidatos activos, ingresos realizados
  vs proyectado, utilidades pagadas vs pendientes, inscritos a próximas
  sesiones. Tarjetas: Candidatos por paso (barras horizontales con los 10
  pasos), Ingresos por fase, Últimos pagos (10 más recientes de
  `candidatos_fase_pagos`, con origen MP/manual), Próximas sesiones (fecha,
  hora, inscritos/capacidad, liga Zoom), Utilidades por lote (pagado /
  pendiente por socio), Requieren atención (candidatos activos sin actividad
  en 30 días, sesiones abiertas sin liga de Zoom, candidatos con fase pagada
  y 0 documentos de esa fase), e Índice de módulos (las ligas que hoy vive en
  `admin-index`, agrupadas igual).
- **`admin-candidatos.html`** (nueva). Tabla tipo "Pacientes": nombre, correo,
  lote, estado, fase pagada, paso actual, documentos X/15, última actividad.
  Búsqueda por nombre/correo y filtros por lote y estado. Clic en una fila →
  panel de detalle (drawer) con los 10 pasos (✓/▶/🔒), los 15 documentos con
  estado y ruta en Nextcloud, y ligas rápidas a Precios/Sesiones.
- **`admin-utilidades.html`** — nueva sección "Pagos registrados — Lote N":
  formulario (socio, monto, fecha, nota) → `insert` en `utilidades_pagos`;
  lista de pagos con botón eliminar; y en el resumen del reparto, por socio:
  a repartir / pagado / pendiente.
- **`admin-index.html`** — pasa a redirigir a `admin-crm.html` (stub, igual
  que `recuperar.html`); el índice de módulos vive en una tarjeta del panel.
- **`admin-precios.html`, `admin-sesiones.html`, `admin-kpis.html`,
  `admin-utilidades.html`** — script del shell en modo admin + tokens
  `--border`/`--surface-2` + reemplazo mecánico de colores (mismo script del
  proyecto anterior). Sin cambios funcionales salvo lo dicho arriba.

### Datos y SQL (pendiente de correr por Diego)

- `_internal_no_publicar/02-sql/2026-09-15-admin-lista-candidatos.sql` — RPC.
- `_internal_no_publicar/02-sql/2026-09-15-utilidades-pagos.sql` — tabla + RLS.

Mientras no se corran: la lista de candidatos muestra solo lo que sale de
`candidatos_precio`/pagos (sin paso ni documentos) con un aviso "falta correr
el SQL", y la sección de pagos de utilidades muestra el mismo aviso. Nada
más se rompe.

## Errores y casos borde

- RPC/tabla inexistentes → aviso en la tarjeta correspondiente, resto del
  panel se pinta (`Promise.allSettled`).
- `/api/sesiones-alineacion` falla (local sin Vercel) → tarjeta "No pudimos
  cargar las sesiones", cifra "—".
- Candidato en `candidatos_precio` sin fila en `candidatos_ec1375` (pagó
  registro pero no ha entrado) → paso "Sin iniciar", 0/15 documentos.
- Cuenta bypass NO es admin (no está en `admins`): el shell admin nunca se
  monta para ella; Entrega se calcula con la regla real (`entregaAuth`) para
  cualquier candidato listado, y con `esBypass` solo si el correo listado es
  el de bypass.

## Verificación

Node: pruebas de `FlowStatus.computeSteps` (`tests/flow-status.test.js`) y de
`AdminData.kpis/utilidades/candidatos` con datos sintéticos
(`tests/admin-data.test.js`). Navegador (sesión admin en el pane): las 7
páginas admin con shell y tema claro, panel con cifras y tarjetas, lista de
candidatos con filtro y detalle, alta y baja de un pago de utilidades (solo
si el SQL ya corrió), móvil con hamburguesa, y redirección de `admin-index`.

## Fuera de alcance

Refactorizar `admin-kpis`/`admin-utilidades`/`admin-precios` para usar
`admin-data.js`; retirar `kpi-dashboard-live.html` (backlog #13, sigue igual);
`protect.js` (siguiente proyecto).
