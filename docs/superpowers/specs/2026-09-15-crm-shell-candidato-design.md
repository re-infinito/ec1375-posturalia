# Shell CRM del candidato + panel de control — design spec

**Fecha:** 15 de septiembre, 2026
**Estado:** Aprobado por Diego (diseño verbal), pendiente de revisión del spec escrito
**Proyecto:** 1 de 4 (ver "Contexto y descomposición")

## Contexto y descomposición

Diego pidió (15 sep) que la herramienta post-pago se sienta como un panel
tipo CRM — referencia: el dashboard de "Quiropráctica 360" de Quadri
Sistemas (sidebar fijo con módulos y badges, hero azul con tarjetas de
cifras, cuadrícula de tarjetas, chip de usuario con "Cerrar sesión", botón
"Modo oscuro") — para el candidato **y** para el equipo, y además que el
contenido quede protegido contra copia/captura.

Eso son cuatro proyectos independientes, cada uno con su propio spec, plan y
deploy, en este orden acordado:

1. **Shell CRM del candidato + panel de control** — este spec.
2. **`protect.js` (disuasión de copia/captura)** — marca de agua con el
   correo, bloqueo de selección/copiar/clic derecho/imprimir, atajos de
   DevTools, difuminado al perder foco, headers anti-embed en Vercel.
3. **CRM del equipo (`admin-crm.html`)** — lista de candidatos como
   "pacientes" con paso actual/fase pagada/documentos faltantes. Requiere
   migración SQL (lectura de todas las filas de `candidatos_ec1375` para
   `is_admin()`) y dividir `FlowStatus.getSteps` en una función pura que
   reciba una fila ajena.
4. **Contenido al servidor** — tabla `contenido_ec1375` en Supabase con
   RLS por fase pagada + bucket privado para las imágenes de
   `ruta-estudio` (4.7MB de los 5.4MB son base64). Cero funciones nuevas de
   Vercel (ya hay 12, el límite del plan Hobby).

Se acordó también que **bloquear screenshots de verdad es imposible en la
web** (SO, cámara, extensiones); lo que se construye en 2 y 4 es disuasión,
rastreo y no exponer el contenido valioso en el HTML.

## Hallazgos que condicionan el diseño (15 sep)

- Las 10 páginas del flujo + `recuperar.html` + `guion-maestro.html`
  comparten **exactamente los mismos 9 tokens** en `:root`: `--dark`,
  `--dark-light`, `--primary`, `--primary-light`, `--accent`, `--text`,
  `--text-bright`, `--danger`, `--success`. Un modo claro se logra
  redefiniendo esos 9 desde fuera, sin reescribir hojas de estilo.
- Lo que NO sale de tokens en esas páginas: ~70 bordes/fondos
  `rgba(255,255,255,0.05–0.15)` en CSS, el gradiente del `body`
  (`linear-gradient(135deg, var(--dark) 0%, #0a1530 100%)`), y ~60
  colores en `style=""` inline (casi todos semánticos: primary/success/
  danger, legibles en ambos temas).
- `ruta-estudio.html` y `ruta-alineacion.html` usan sistemas de tokens
  propios (31 tokens y ~200 hex hardcodeados en `ruta-alineacion`), se
  generan desde un pipeline externo de Diego (`v4/alineacion.py`, no vive
  en el repo) y tienen su propio `.topbar` sticky + `.app` de 100vh.
- Todas las páginas del flujo tienen la misma estructura de body:
  `<div class="top-bar">` + `<div class="container" id="app">`.
- Los PDF se generan con jsPDF dibujando sus propios colores; no hay
  `html2canvas`. Las firmas se capturan de un `<canvas>` con
  `strokeStyle '#000'` — `toDataURL` no incluye el fondo CSS. **El tema no
  afecta ningún PDF.**
- Hoy `recuperar.html` = login + lista vertical de 10 pasos (vía
  `flow-status.js`). Cada página del flujo pinta una barra fija de chips
  (`FlowStatus.renderProgressBar`) arriba del `.top-bar`.
- `Auth.renderAdminBar()` (cuenta bypass) prepende una barra fija de 40px
  y pone `body.style.paddingTop = '40px'`.

## Decisiones tomadas con Diego

| Decisión | Elección |
|---|---|
| Alcance | Shell compartido en TODAS las páginas del flujo (no solo el dashboard, no reescritura tipo SPA). |
| Mecanismo | Módulo que envuelve el DOM existente en tiempo de ejecución (mismo patrón que `flow-status.js`), NO copiar el sidebar a mano en 12 HTML, NO iframes. |
| Tema | **Claro por default con toggle a oscuro** (como el botón "Modo oscuro" del CRM de referencia). |
| Audiencia de este proyecto | Solo candidato. Admin = Proyecto 3. |

## Arquitectura

### Archivos nuevos

- **`crm-shell.js`** — módulo compartido (tercera excepción deliberada a
  "páginas sin módulos compartidos", misma justificación que `auth.js` y
  `flow-status.js`: un sidebar copiado 12 veces se desincroniza). Inyecta
  él mismo `<link rel="stylesheet" href="crm-shell.css">` al cargarse, así
  cada página agrega UNA sola etiqueta.
- **`crm-shell.css`** — layout del shell, sidebar, encabezado, tarjetas del
  panel, y los dos bloques de tema (`html[data-theme="light"]` /
  `html[data-theme="dark"]`).

Orden de carga en cada página: `supabase-js` → `auth.js` → `flow-status.js`
→ `crm-shell.js` → script propio de la página.

### API pública (`window.CrmShell`)

```js
CrmShell.applyTheme()                      // se ejecuta solo al cargar el script
CrmShell.toggleTheme()                     // botón del encabezado/sidebar
CrmShell.mount({ currentPageId, steps, mode, title })
CrmShell.renderDashboard(container, data)  // solo recuperar.html
```

**`applyTheme()`** corre en cuanto el script se parsea (está en `<head>`,
antes del primer pintado): lee `localStorage['paideia-theme']`
(`'light'` | `'dark'`, default `'light'`) y pone
`document.documentElement.dataset.theme`. Si `localStorage` lanza (modo
privado), asume `'light'`. Nunca consulta `prefers-color-scheme`: la
preferencia es explícita del usuario, igual que en el CRM de referencia.

**`mount(opts)`** — idempotente (si ya existe `#crmShell`, no hace nada):

1. Crea `<div id="crmShell" class="crm-shell crm-mode-{full|rail}">` con
   `<aside class="crm-sidebar">`, `<div class="crm-backdrop">` (móvil) y
   `<main class="crm-main">`.
2. Mueve dentro de `<main>` el `.top-bar` (si existe) y el `#app` de la
   página — `appendChild`, sin clonar, así los listeners/estado del wizard
   no se pierden. El `.top-bar` original queda como sub-encabezado de
   contenido (los wizards muestran ahí su paso interno). Encima, el shell
   agrega su propio `<header class="crm-topbar">` con: botón hamburguesa
   (solo < 1024px), título (`opts.title` o el texto del `.top-bar-inner`),
   botón de tema (☀️/🌙) y chip de usuario (iniciales + nombre corto).
3. Pinta el sidebar a partir de `opts.steps` (el mismo arreglo que regresa
   `FlowStatus.getSteps()`) y resalta `opts.currentPageId`.
4. Si existe `#adminBypassBar` (cuenta bypass), lee su alto real y lo usa
   como `--crm-offset-top` para que sidebar y encabezado queden debajo. No
   toca `Auth.renderAdminBar()`.
5. `mode: 'full'` (default) | `'rail'` (ver "Modo rail").

**`renderDashboard(container, data)`** recibe un objeto ya resuelto (no
hace fetch) — ver "Panel del candidato".

### Cambio por página

La llamada `FlowStatus.renderProgressBar(flowSteps, 'X')` se reemplaza por
`CrmShell.mount({ currentPageId: 'X', steps: flowSteps })`. Ocurre en el
mismo punto del ciclo de vida que hoy (después de verificar sesión y de
`FlowStatus.getSteps()`), así que antes de iniciar sesión cada página
muestra su gate igual que hoy, sin sidebar (no hay pasos que mostrar sin
sesión).

`FlowStatus.renderProgressBar` se **elimina** de `flow-status.js` (queda sin
llamadores). `FlowStatus.renderNextStepCTA` se queda igual: el botón
"Siguiente: X →" dentro del contenido sigue siendo útil al terminar un
paso.

## Sidebar (`crm-mode-full`)

Estructura, de arriba a abajo (copiando la del CRM de referencia):

1. **Marca:** `Logo Paideia Tech - trimmed.png` (40px), "Paideia Tech",
   subtítulo "Certificación EC1375", badge "SEP · CONOCER".
2. **Navegación principal:**
   - "Panel" → `recuperar.html` (icono de tablero).
   - Los 10 pasos de `FLOW_STEPS_META`, en orden, cada uno con:
     - ✓ verde si `done`, ▶ con fondo `--primary` y borde si `current`
       (equivale al item "Dashboard" resaltado en la captura), 🔒 al 40%
       de opacidad y sin link si `locked` (con `title` explicando la razón,
       mismos textos que hoy: "Completa el paso anterior primero" /
       "Esperando el resultado de tu evaluador").
     - El paso `current` lleva un badge numérico con el número de
       documentos pendientes de ESE paso cuando aplica (ej. Autodiagnóstico
       4 documentos de registro, Documentos de Sesión 4, Evidencias 4,
       Plan de Evaluación 2, Encuesta 1); si el paso no genera documentos
       (Reforzamiento, Práctica, Examen, Alineación, Entrega), sin badge.
     - El item cuyo `id === currentPageId` lleva además un indicador "estás
       aquí" (barra lateral dorada, `--accent`), aunque ya esté `done`.
3. **Recursos:** "Biblioteca" → `biblioteca.html`, "Guion Maestro" →
   `guion-maestro.html`. Siempre visibles; esas páginas se gatean solas.
4. **Usuario:** avatar con iniciales (de `row.nombre`, fallback al correo),
   nombre y correo (`session.user.email`), botón "Modo oscuro" / "Modo
   claro" (texto según el tema activo), y "Cerrar sesión"
   (`Auth.signOut()` → `recuperar.html`).
5. **Pie:** tres badges informativos con icono: "Expediente digital",
   "Datos protegidos", "Certificación oficial SEP-CONOCER".

El nombre viene de `Auth.pullMyRow()`; para no duplicar la consulta, `mount`
acepta `opts.row` opcional (las páginas que ya tienen la fila la pasan) y
solo consulta si no se le pasa.

## Layout y responsive

- **≥ 1024px:** `display:grid; grid-template-columns: 260px 1fr`. Sidebar
  `position: sticky; top: var(--crm-offset-top); height: calc(100vh - offset)`
  con scroll propio. `<main>` scrollea con la página.
- **< 1024px:** sidebar off-canvas (`transform: translateX(-100%)`),
  abre con el botón hamburguesa del encabezado, se cierra con el backdrop,
  con `Esc`, o al hacer clic en cualquier link. Encabezado sticky arriba.
- El `.container` de cada página hoy tiene `max-width: 560px; margin: 0
  auto`. El shell lo sube a `max-width: 860px` (`.crm-main .container`)
  para que el contenido no quede flotando en una columna angosta dentro
  del área principal. Los wizards siguen centrados.
- El `body` deja de tener el `padding-top` que ponía `renderProgressBar`
  (esa función desaparece).

## Modo rail (`ruta-estudio.html`, `ruta-alineacion.html`)

Estas dos páginas son inmersivas (motor de estudio/presentación con su
propio `.topbar` sticky y `.app` de 100vh) y se regeneran desde el pipeline
externo. El shell **no** las envuelve ni mueve su DOM:

- ≥ 1024px: rail fijo de 64px a la izquierda (`position: fixed`), solo
  iconos de los 10 pasos con el mismo estado (✓/▶/🔒) y tooltip con el
  nombre, más el logo arriba y un botón "expandir" que abre el sidebar
  completo como overlay. `body { padding-left: 64px }`.
- < 1024px: sin rail; un botón flotante (esquina inferior izquierda) abre
  el sidebar off-canvas.
- El tema claro/oscuro **no** re-estiliza su contenido (siguen oscuras por
  diseño del motor, y sus tokens no son los 9 compartidos). El toggle
  sigue visible y cambia la preferencia global; solo afecta al rail ahí.
- En `ruta-estudio.html` la llamada actual (`renderProgressBar(flowSteps,
  flowStepId)` con `flowStepId` = `reforzamiento` | `practica`) se
  reemplaza por `mount({ mode: 'rail', ... })` con el mismo `flowStepId`.
  `ruta-alineacion.html` hoy no llama a `FlowStatus`; se le agrega la
  carga de `auth.js`/`flow-status.js`/`crm-shell.js` y un `mount` en modo
  rail con `currentPageId: 'alineacion'` **sólo si hay sesión** (si no,
  la página se muestra como hoy, sin rail, para no romper su uso como
  material abierto de la sesión en vivo). No se toca nada de las pantallas
  1–57.

## Panel del candidato (`recuperar.html`)

El gate de login (`Auth.renderAuthGate`) queda igual, centrado en una
tarjeta sobre el fondo del tema. Al verificar sesión, `handleVerified`:

1. Llama `Auth.pullMyRow()`, `FlowStatus.getSteps()`, `Auth.isPhaseAuthorized`
   para las 4 fases (`registro`, `alineacion`, `evaluacion`, `entrega`) y
   `GET /api/mis-inscripciones-alineacion?email=` (misma llamada que
   `sesiones-alineacion-component.js`, filtrando `estado === 'confirmada'
   && sesion`). Las cuatro cargas corren en paralelo (`Promise.allSettled`).
2. Monta el shell (`mount({ currentPageId: 'panel', steps, row })`) —
   `'panel'` es el id reservado del item "Panel" del sidebar, no un paso
   de `FLOW_STEPS_META`.
3. Llama `CrmShell.renderDashboard(container, data)`.

`renderDashboard` pinta:

**Hero** (gradiente azul `--primary` → `#0a2a6b`, como "Panel de control"):
- Badge superior "Certificación en curso" (o "Certificado entregado" si
  Entrega está `done`).
- "Hola, {nombre}" + "Tu panel de certificación EC1375".
- Línea de estado: 🔒 Datos protegidos · ☁️ Expediente en la nube ·
  🔄 "Sincronizado hace {tiempo relativo de row.updated_at}" (o "Sin datos
  sincronizados aún").
- Botón principal amarillo (`--accent`, como "Nuevo paciente"):
  "Continuar: {label del paso current} →" a su `href`. Si no hay `current`
  (todo hecho salvo Entrega): "Esperando a tu evaluador" deshabilitado.
- Botón secundario "Ver mis documentos" (scroll a la tarjeta de documentos).
- 4 tarjetas de cifras:

  | Cifra | Fuente |
  |---|---|
  | Pasos completados `X / 10` | `steps.filter(done).length` |
  | Documentos subidos `X / 15` | conteo de `documentosNextcloud` sobre las 15 claves oficiales (abajo) |
  | Fase pagada | la más alta autorizada: Registro → Alineación → Evaluación → Entrega |
  | Próxima sesión | fecha corta de la inscripción confirmada más próxima, o "Sin reservar" |

**Cuadrícula de tarjetas** (2 columnas ≥ 1024px, 1 en móvil):

1. **Tu progreso** — donut SVG dibujado a mano (sin librerías): segmentos
   verde (`done`), azul (`current`), gris (`locked`), número grande al
   centro = pasos completados, leyenda debajo. Mismo lenguaje visual que
   "Pacientes por estatus".
2. **Ruta de certificación** — los 10 pasos como línea de tiempo vertical
   con ✓/▶/🔒, link directo en los que se pueden abrir, y el motivo del
   bloqueo en los `locked`. Reemplaza la lista actual de `recuperar.html`.
3. **Documentos del expediente** — las 15 claves oficiales agrupadas por
   fase, cada una con estado: ✅ Subido (`documentosNextcloud[clave]`
   truthy y sin la marca de formulario alterno), ⬇️ Descargado
   (`documentosDescargados[clave]`), 📨 Enviado por formulario alterno
   (`FORM_FALLBACK_MARK` en `evidencias`), ⏳ Pendiente. Link a la página
   que lo genera.

   | Fase / columna JSONB | Claves |
   |---|---|
   | Registro / `autodiagnostico_data` | `autodiagnostico`, `fichaRegistro`, `acuseTriptico`, `acuseNda` |
   | Alineación / `plan_evaluacion_data` | `planEvaluacion`, `acusePlanEvaluacion` |
   | Evaluación / `documentos_sesion_data` | `ficha`, `consentimiento`, `plan_sesion`, `plan_seguimiento` |
   | Evaluación / `encuesta_data` | `encuesta` |
   | Evaluación / `evidencias_data` | `zoom`, `ine`, `curp`, `fotoDiploma` |

   (Los certificados previos y la foto para el diploma son opcionales y no
   se cuentan.)
4. **Pagos** — 4 filas (Registro 15% · Alineación 30% · Evaluación 40% ·
   Entrega 15%) con ✓ Pagado / ⏳ Pendiente según `isPhaseAuthorized`. La
   fase pendiente inmediata lleva botón "Pagar" a la página que ya cobra
   esa fase (`alineacion.html`, `plan-evaluacion.html`, `entrega.html`).
   Sin montos aquí (el monto exacto lo calcula cada página vía
   `api/monto-fase.js`; no se duplica esa lógica).
5. **Sesión de Alineación** — si hay inscripción confirmada: fecha y hora
   (México) y botón "Entrar a Zoom" (`zoom_link`). Si no hay:
   "Aún no has reservado tu sesión en vivo" + botón a `alineacion.html`
   (solo si Alineación está pagada; si no, el texto dice que se habilita
   al pagar esa fase).
6. **Requieren atención** — lista derivada, en orden de prioridad:
   documentos del paso `current` sin subir, siguiente fase sin pagar
   cuando el paso `current` la exige, sesión de Alineación sin reservar
   cuando Alineación está pagada y el paso Alineación no está `done`. Cada
   item con link. Si está vacía: "Todo en orden ✨".

Cuenta bypass: el panel se pinta con los datos placeholder que ya siembra
`ensureAdminPlaceholderData()`; Entrega nunca aparece pagada (lo garantiza
`FlowStatus.getSteps()`, no se re-implementa aquí).

## Tema claro / oscuro

### Tokens

`crm-shell.css` define, para las páginas que cargan el shell:

| Token | Oscuro (valores actuales, sin cambio) | Claro (nuevo) |
|---|---|---|
| `--dark` (fondo de página) | `#050a1a` | `#f4f6fb` |
| `--dark-light` (tarjetas) | `#0f1428` | `#ffffff` |
| `--primary` | `#0088FF` | `#0070e0` |
| `--primary-light` | `#00CCFF` | `#0088FF` |
| `--accent` | `#FFD700` | `#c9950a` |
| `--text` | `#D0D0D0` | `#3d4663` |
| `--text-bright` | `#FFFFFF` | `#0f1428` |
| `--danger` | `#FF3333` | `#d32020` |
| `--success` | `#00FF88` | `#0a9a5a` |
| `--border` (nuevo) | `rgba(255,255,255,0.12)` | `rgba(15,20,40,0.12)` |
| `--surface-2` (nuevo) | `rgba(255,255,255,0.05)` | `rgba(15,20,40,0.04)` |

Los bloques van bajo `html[data-theme="light"]` y `html[data-theme="dark"]`
(especificidad mayor que el `:root` de cada página, que se conserva como
fallback oscuro). El botón amarillo del hero usa `#FFD700` fijo con texto
`#050a1a` en ambos temas (es el CTA, debe verse igual que en la captura).

### Cambio mecánico por página (10 páginas: las 8 del flujo con contenido
propio — los stubs `reforzamiento`/`practica` redirigen a `ruta-estudio`,
que queda fuera del tema — más `recuperar.html` y `guion-maestro.html`)

1. Agregar `--border` y `--surface-2` al `:root` de la página (valores
   oscuros, para que siga viéndose igual sin el shell).
2. Reemplazar en el `<style>` y en `style=""` inline:
   `rgba(255,255,255,0.05)`–`0.06)` → `var(--surface-2)`;
   `rgba(255,255,255,0.08)`–`0.2)` → `var(--border)`. Los `rgba(255,255,255,
   0.3–0.5)` usados como texto tenue se cambian a `var(--text)` con
   `opacity`. Se revisa cada reemplazo, no es un `sed` ciego: los ~70
   casos caben en una pasada manual por página.
3. `body { background: linear-gradient(135deg, var(--dark) 0%, #0a1530
   100%) }` → `background: var(--dark)`.
4. Colores hex hardcodeados fuera de `:root` (1–4 por página): revisar
   uno por uno; los que sean fondos/bordes pasan a token, los semánticos
   se dejan.

### Fuera del tema (siguen oscuras siempre)

`index.html`, `quiz.html`, `success.html`, `pending.html`, `failure.html`,
`restablecer-password.html` (contexto pre-pago/marketing, otra decisión de
diseño), contenido interno de `ruta-estudio.html` y `ruta-alineacion.html`,
y todas las páginas `admin-*.html` (Proyecto 3).

## Páginas tocadas

| Archivo | Cambio |
|---|---|
| `crm-shell.js`, `crm-shell.css` | Nuevos. |
| `flow-status.js` | Se elimina `renderProgressBar`. |
| `recuperar.html` | Reescrito: login igual + panel completo. |
| `alineacion.html`, `plan-evaluacion.html`, `documentos-sesion.html`, `encuesta-satisfaccion.html`, `evidencias.html`, `entrega.html`, `examen-conocimientos.html`, `autodiagnostico.html` | `<script src="crm-shell.js">`, `renderProgressBar` → `mount`, tokens y reemplazos mecánicos de tema. |
| `guion-maestro.html` | Igual que arriba, más agregar `flow-status.js` y un `mount({currentPageId:'plan-evaluacion'})` tras verificar sesión (hoy solo carga `auth.js`). |
| `ruta-estudio.html` | `crm-shell.js`, `renderProgressBar` → `mount({mode:'rail'})`. Nada más. |
| `ruta-alineacion.html` | Carga de los 3 módulos + `mount` rail condicionado a sesión. Nada más. |
| `admin-index.html` | Sin cambio funcional; su descripción de `recuperar.html` se actualiza a "Login + panel del candidato". |
| `Claude.md` | Sección nueva "Shell CRM" y actualización de "Progreso del candidato". |

`reforzamiento.html`, `practica.html`, `biblioteca.html` (stubs que
redirigen) no cambian.

## Errores y casos borde

- Sin sesión: cada página muestra su gate como hoy; no se monta el shell.
- `FlowStatus.getSteps()` lanza: la página captura, monta el shell con
  `steps: FLOW_STEPS_META` marcados sin estado (ni ✓ ni 🔒, sin links de
  estado) y un aviso pequeño en el sidebar "No pudimos cargar tu progreso ·
  reintentar". El contenido de la página sigue funcionando.
- `/api/mis-inscripciones-alineacion` falla: la tarjeta de sesión muestra
  "No pudimos cargar tu sesión" + "Reintentar"; la cifra "Próxima sesión"
  muestra "—". El resto del panel se pinta.
- `mount` llamado dos veces (ej. re-render de un wizard): no-op por el
  chequeo de `#crmShell`. Si una página re-crea su `#app` por completo,
  debe hacerlo dentro del `<main>` ya existente (hoy ninguna reemplaza el
  nodo `#app`, solo su `innerHTML`; se verifica en el plan).
- Cuenta bypass: `#adminBypassBar` sigue arriba; el shell se desplaza por
  el alto real de esa barra (no un 40px fijo), incluso si en móvil la
  barra hace wrap a dos líneas.
- Tema guardado `dark` y página sin shell (landing): no aplica, esas
  páginas no cargan `crm-shell.js` y no leen la preferencia.

## Verificación (no hay suite de tests en el proyecto)

Con Playwright contra un servidor estático local (`python3 -m http.server`),
sesión de la cuenta bypass:

1. Las 12 páginas con shell × tema claro y oscuro × 1280px y 390px: captura
   de pantalla, cero errores de consola, el `#app` original sigue en el DOM
   dentro de `.crm-main`, el sidebar marca el paso correcto.
2. `recuperar.html`: las 4 cifras y las 6 tarjetas se pintan con los datos
   placeholder; "Continuar" apunta al `href` del paso `current` que regresa
   `FlowStatus.getSteps()`.
3. Toggle de tema: persiste entre páginas (localStorage) y no produce
   flash al cargar (screenshot en `domcontentloaded`).
4. `ruta-estudio.html?boot=remedial` y `ruta-alineacion.html`: rail visible
   en desktop, botón flotante en móvil, el motor navega igual que antes.
5. Generar un PDF en `encuesta-satisfaccion.html` en tema claro y comparar
   visualmente con uno en tema oscuro: idénticos.
6. Móvil: abrir/cerrar sidebar con hamburguesa, backdrop y `Esc`.

## Fuera de alcance de este proyecto

- Cualquier cambio a `auth.js`, a los gates, a los PDF, a la lógica de
  qué cuenta como "completo" (`FlowStatus.getSteps` no cambia).
- Panel admin, protección anti-copia, contenido al servidor (Proyectos
  2–4).
- Re-estilizar el interior de `ruta-estudio`/`ruta-alineacion`.
- Navegación sin recarga entre páginas.
- Nada pendiente en Supabase para Diego: este proyecto no toca tablas,
  RLS, buckets ni funciones de Vercel.
