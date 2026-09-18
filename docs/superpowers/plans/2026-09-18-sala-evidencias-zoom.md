# Sala de evidencias (Zoom) — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Los candidatos agendan un horario exclusivo en la sala de Zoom recurrente de Paideia desde el Plan de Evaluación, reciben el enlace solo dentro de su horario (Documentos de Sesión / Guion Maestro), ven su fecha límite, y el equipo copia la grabación de Zoom al NAS del candidato con un botón. Además: candados de fase ajustados (grabación = Alineación; Práctica/Examen/Encuesta/Evidencias = Evaluación) y el Guion Maestro se imprime a PDF con marca de agua del nombre del candidato.

**Architecture:** Sin funciones nuevas de Vercel (hay 12). Agenda y ventana viven en Supabase (tablas + RPC `security definer`, SQL nuevo). Un módulo compartido `sala-evidencias.js` (puro + navegador) pinta agenda, tarjeta de sala y aviso. La copia Zoom → NAS son acciones nuevas en `api/subir-portafolio.js`, con helpers en `lib/zoom.js` y `lib/nextcloud.js`; el navegador del equipo orquesta trozos de 32 MB con `grabacion-zoom.js`.

**Tech Stack:** HTML/JS vanilla sin build, Supabase (Postgres/RLS/RPC), Vercel Functions (Node 24, CommonJS), Nextcloud WebDAV (carga por trozos clásica), Zoom API (Server-to-Server OAuth), `node --test`.

**Spec:** `docs/superpowers/specs/2026-09-18-sala-evidencias-zoom-design.md`

**Convenciones del repo (leer antes):** `CLAUDE.md` en la raíz. Páginas autocontenidas; módulos compartidos UMD (`(function (root) { … })(typeof window !== 'undefined' ? window : this)` + `module.exports`), probados con `node --test tests/*.test.js`. Nunca publicar el enlace/clave de Zoom en archivos del repo. `_internal_no_publicar/` está en `.gitignore` (el SQL no se comitea). No hacer `git push` sin permiso de Diego (push a `main` = deploy a producción).

---

## Mapa de archivos

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `_internal_no_publicar/02-sql/2026-09-18-sala-evidencias.sql` | Crear | Tablas, RLS y RPC de la sala |
| `sala-evidencias.js` | Crear | Lógica pura (fechas MX, estado, límite, plantilla) + UI candidato (agenda, tarjeta, aviso, grabación) |
| `tests/sala-evidencias.test.js` | Crear | Pruebas del núcleo puro y del HTML |
| `grabacion-zoom.js` | Crear | Puros de la copia (trozos, nombre, archivo principal) + tarjeta admin "Grabación de la sesión" |
| `tests/grabacion-zoom.test.js` | Crear | Pruebas de los puros |
| `lib/nextcloud.js` | Crear | Conexión WebDAV, carpetas, carga por trozos, tamaño (extraído de `api/subir-portafolio.js`) |
| `lib/zoom.js` | Crear | Token S2S, buscar grabaciones, trozo con Range, papelera |
| `tests/zoom-nextcloud.test.js` | Crear | Pruebas de puros de `lib/` |
| `api/subir-portafolio.js` | Modificar | Usa `lib/nextcloud.js`; acciones `zoom-buscar/-trozo/-cerrar/-borrar` |
| `tests/subir-portafolio.test.js` | Modificar | Rechazos de las acciones nuevas |
| `admin-sala-evidencias.js` | Crear | Pestaña admin: configuración, plantilla semanal, horarios |
| `admin-sesiones.html` | Modificar | Pestaña "🎥 Sala de evidencias" |
| `admin-evaluacion.html` | Modificar | Tarjeta "Grabación de la sesión"; `planPortafolio(row, ev)` |
| `evaluacion.js`, `portafolio.js`, `tests/evaluacion.test.js` | Modificar | Liga del video desde `evaluaciones.video` |
| `admin-data.js`, `admin-crm.html`, `tests/admin-data.test.js` | Modificar | "Requieren atención": plazos y grabaciones sin copiar |
| `plan-evaluacion.html` | Modificar | Agenda de la sala en "📆 Agenda tu Evaluación" |
| `documentos-sesion.html` | Modificar | Candado Alineación, pago de Evaluación al final / `?pagar=evaluacion`, tarjeta de sala |
| `guion-maestro.html` | Modificar | Candado Alineación, tarjeta de sala, imprimir PDF con marca de agua |
| `encuesta-satisfaccion.html`, `evidencias.html`, `estudio.html` | Modificar | Candado Evaluación con liga a pagar |
| `evidencias.html`, `panel.html` | Modificar | Aviso de límite; fila "Grabación de tu sesión"; sin YouTube obligatorio |
| `sw.js` | Modificar | Precache `sala-evidencias.js`, versión `paideia-app-v10` |
| `docs/guias/2026-09-18-zoom-sala-evidencias.md` | Crear | Guía para Diego: app de Zoom, variables, ajustes de grabación |
| `CLAUDE.md` | Modificar | Documentar todo lo anterior |

Orden sugerido: Tareas 1–2 son independientes (se pueden desplegar solas). 3→5 es la base; 6–8 dependen de 5; 9–12 son la copia al NAS; 13–14 equipo; 15–16 cierre.

---

### Task 1: Candados de fase (grabación = Alineación; lo demás = Evaluación)

**Files:**
- Modify: `documentos-sesion.html` (~líneas 340, 685–720, 769–782, 1815–1844)
- Modify: `guion-maestro.html:380-389`
- Modify: `encuesta-satisfaccion.html:~321` (después del bloque "Verifica tu correo")
- Modify: `evidencias.html:~384` (después del bloque "Verifica tu correo")
- Modify: `estudio.html:269`

- [ ] **Step 1: `documentos-sesion.html` — bandera de pago.** Justo después de `let currentStepIndex = 0;` (línea ~343) agregar:

```js
    /* 18 sep: la grabación y sus documentos se habilitan con Alineación; el
       pago de Evaluación (Práctica, Examen, Encuesta y Evidencias) se hace al
       terminar esta página, o directo con documentos-sesion.html?pagar=evaluacion. */
    const PAGAR_EVALUACION = new URLSearchParams(location.search).get('pagar') === 'evaluacion';
```

- [ ] **Step 2: `documentos-sesion.html` — HTML del pago en una función.** Antes de `async function pagarFaseEvaluacion() {` agregar (es el mismo marcado que hoy vive dentro del candado):

```js
    /* Caja de pago de Evaluación (antes estaba dentro del candado de esta
       página). Si ya está pagada, lo dice y lleva a Práctica. */
    async function pagoEvaluacionHtml(email) {
        if (Auth._isBypassSession || await Auth.isPhaseAuthorized(email, 'evaluacion')) {
            return `<div class="card" style="text-align:center;margin-top:20px;">
                <p style="color:var(--success);font-weight:700;margin-bottom:12px;">✅ Tu Evaluación está pagada</p>
                <a href="estudio.html?modo=practica" class="btn btn-primary btn-full" style="display:block;text-decoration:none;">Siguiente: Práctica →</a></div>`;
        }
        const monto = await fetchMontoFase(email, 'evaluacion');
        const montoTxt = typeof monto === 'number' ? `$${monto.toLocaleString('es-MX')} MXN` : null;
        return `
            <div class="pay-box">
                <p><strong>Siguiente: paga tu Evaluación</strong><br>Con ella se abren la Práctica, el Examen de Conocimientos, la Encuesta y la entrega de tus Evidencias.</p>
                ${montoTxt ? `<div class="monto">${montoTxt}</div>` : ''}
                <button id="btnPagarEvaluacion" class="btn btn-primary btn-full" style="margin-top:16px;" onclick="pagarFaseEvaluacion()">💳 Pagar Evaluación</button>
                <p style="font-size:0.8rem;color:var(--text);">¿Dudas? <a href="https://wa.me/528115026729" style="color:var(--primary);" target="_blank">Escríbenos por WhatsApp</a></p>
                <p style="font-size:0.75rem;color:var(--text);margin-top:10px;">⚠️ Una vez realizado cualquier pago o anticipo, no aplican reembolsos — salvo que la causa sea responsabilidad del Centro Evaluador.</p>
            </div>
            ${renderTransferenciaCard(monto)}`;
    }
```

- [ ] **Step 3: `documentos-sesion.html` — reemplazar el candado de Evaluación.** Reemplazar todo el bloque que empieza con `if (step !== 'intro' && !Auth._isBypassSession && !(await Auth.isPhaseAuthorized(session.user.email, 'evaluacion'))) {` y termina en su `return;\n        }` por:

```js
        if (PAGAR_EVALUACION && session) {
            app.innerHTML = `<div class="hero"><div class="hero-icon">💳</div><h1 class="hero-title">Pago de Evaluación</h1>
                <p class="hero-subtitle">Práctica, Examen de Conocimientos, Encuesta y Evidencias</p></div>` + await pagoEvaluacionHtml(session.user.email);
            return;
        }

        if (step !== 'intro' && !Auth._isBypassSession && !(await Auth.isPhaseAuthorized(session.user.email, 'alineacion'))) {
            app.innerHTML = `
                <div class="hero"><div class="hero-icon">🩺</div><h1 class="hero-title">Documentos de Sesión</h1></div>
                <div class="blocked-box">
                    <p><strong>Primero necesitas tu Alineación</strong><br>La sesión grabada y sus documentos se habilitan con tu pago de Alineación.</p>
                    <a href="alineacion.html" class="btn btn-primary">🎓 Ir a mi Alineación</a>
                </div>`;
            return;
        }
```

Nota: `session` es `null` cuando `step === 'intro'`. Para que `?pagar=evaluacion` funcione aunque el paso guardado sea `intro`, cambiar la línea `const session = step !== 'intro' ? await Auth.getSession() : null;` por `const session = (step !== 'intro' || PAGAR_EVALUACION) ? await Auth.getSession() : null;` y la condición `if (step !== 'intro' && !session)` por `if ((step !== 'intro' || PAGAR_EVALUACION) && !session)`.

- [ ] **Step 4: `documentos-sesion.html` — pago al terminar.** En `renderResultado`, reemplazar:

```js
        const flowSteps = await FlowStatus.getSteps();
        CrmShell.mount({ currentPageId: 'documentos-sesion', steps: flowSteps });
        FlowStatus.renderNextStepCTA(flowSteps, 'documentos-sesion', document.getElementById('flowNextStepCta'));
```

por:

```js
        const flowSteps = await FlowStatus.getSteps();
        CrmShell.mount({ currentPageId: 'documentos-sesion', steps: flowSteps });
        const sesionRes = await Auth.getSession();
        const evaluacionPagada = Auth._isBypassSession || (sesionRes && await Auth.isPhaseAuthorized(sesionRes.user.email, 'evaluacion'));
        if (!evaluacionPagada && sesionRes) {
            const cta = document.getElementById('flowNextStepCta');
            if (cta) cta.innerHTML = await pagoEvaluacionHtml(sesionRes.user.email);
        } else {
            FlowStatus.renderNextStepCTA(flowSteps, 'documentos-sesion', document.getElementById('flowNextStepCta'));
        }
```

- [ ] **Step 5: `guion-maestro.html`.** En `render()`, cambiar `const autorizado = await Auth.isPhaseAuthorized(session.user.email, 'evaluacion');` por `const autorizado = Auth._isBypassSession || await Auth.isPhaseAuthorized(session.user.email, 'alineacion');` y el `pay-box` siguiente por:

```js
                <div class="pay-box">
                    <p>Este guion es tu apoyo para la sesión grabada, que se habilita con tu pago de <strong>Alineación</strong>.</p>
                    <a href="alineacion.html" class="btn btn-primary btn-full" style="margin-top:16px;">Ir a mi Alineación →</a>
                </div>`;
```

Antes de ese `if`, asegurar que `Auth._isBypassSession` ya se calculó: agregar `await Auth.isBypassSession();` justo después del bloque "Verifica tu correo".

- [ ] **Step 6: `encuesta-satisfaccion.html` y `evidencias.html` — candado de Evaluación.** En ambos `render()`, justo después del bloque `if (!(await Auth.getSession())) { … return; }` insertar (en Evidencias cambiar el título del hero a "Carga de Evidencias" e ícono 📤; en Encuesta "Encuesta de Satisfacción" e ícono 📝):

```js
        const sesionFase = await Auth.getSession();
        if (!Auth._isBypassSession && !(await Auth.isPhaseAuthorized(sesionFase.user.email, 'evaluacion'))) {
            app.innerHTML = `
                <div class="hero">
                    <div class="hero-icon">📝</div>
                    <h1 class="hero-title">Encuesta de Satisfacción</h1>
                    <p class="hero-subtitle">Parte de tu fase de Evaluación</p>
                </div>
                <div class="blocked-box">
                    <p><strong>Paga tu Evaluación para continuar</strong><br>La Encuesta, el Examen, la Práctica y la entrega de tus Evidencias son parte de la fase de Evaluación.</p>
                    <a href="documentos-sesion.html?pagar=evaluacion" class="btn btn-primary">💳 Pagar Evaluación</a>
                </div>`;
            return;
        }
```

- [ ] **Step 7: `estudio.html:269`.** Reemplazar la línea

```js
    else pantallaBloqueo('Primero completa tus Documentos de Sesión', MODO.titulo + ' se habilita con la fase de Evaluación.', 'documentos-sesion.html', 'Ir a Documentos de Sesión');
```

por

```js
    else pantallaBloqueo('Paga tu Evaluación', MODO.titulo + ' se abre con tu pago de Evaluación.', 'documentos-sesion.html?pagar=evaluacion', 'Pagar Evaluación');
```

- [ ] **Step 8: Pruebas existentes.** Run: `node --test tests/*.test.js` → Expected: todas pasan (no cambió lógica probada).

- [ ] **Step 9: Verificación rápida en navegador** (preview `ec1375-static`, puerto 8420): abrir `documentos-sesion.html?pagar=evaluacion` sin sesión → pide iniciar sesión; `estudio.html?modo=practica` sin fase → botón "Pagar Evaluación" apunta a `documentos-sesion.html?pagar=evaluacion`. Con sesión simulada se verifica en la Tarea 16.

- [ ] **Step 10: Commit**

```bash
git add documentos-sesion.html guion-maestro.html encuesta-satisfaccion.html evidencias.html estudio.html
git commit -m "Candados: la grabación y sus documentos abren con Alineación; Evaluación se paga al terminar Documentos de Sesión

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Guion Maestro — imprimir o guardar en PDF con marca de agua del candidato

**Files:**
- Modify: `guion-maestro.html` (CSS en `<style>`, `render()`, función nueva)

`protect.js` ya permite imprimir esta página (`data-protect-print="allow"`); su marca de agua de pantalla (`#ptWatermark`) es un fondo que normalmente no se imprime. Se agrega una capa propia solo para impresión con el **nombre del candidato**, correo y fecha, que se repite en cada hoja (`position: fixed` se repite por página en Chrome, Safari y Firefox).

- [ ] **Step 1: CSS de impresión.** Al final del `<style>` de `guion-maestro.html` agregar:

```css
        .guion-marca-print { display: none; }
        .btn-imprimir-guion { margin: 0 0 18px; }
        @media print {
            .crm-sidebar, .crm-bar, .crm-backdrop, .crm-fab, .btn-imprimir-guion, [data-sala-tarjeta], [data-sala-aviso], #ptWatermark, .no-print { display: none !important; }
            .crm-main, .crm-shell, body { margin: 0 !important; padding: 0 !important; background: #fff !important; color: #000 !important; }
            .container { max-width: none !important; }
            .guion-section { break-inside: avoid-page; }
            .guion-marca-print {
                display: block !important; position: fixed; inset: 0; z-index: 9999; pointer-events: none;
                background-repeat: repeat; background-size: 460px 300px; opacity: 0.16;
                -webkit-print-color-adjust: exact; print-color-adjust: exact;
            }
        }
```

- [ ] **Step 2: Funciones.** Antes de `async function render()` agregar:

```js
    /* 18 sep (pedido de Diego): imprimir o guardar el guion en PDF, con el
       nombre del candidato como marca de agua en cada hoja. */
    function marcaImpresionSvg(nombre, correo, fecha) {
        const x = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="460" height="300">' +
            '<g transform="rotate(-28 230 150)" font-family="Helvetica,Arial,sans-serif" fill="#0f1428">' +
            '<text x="230" y="140" text-anchor="middle" font-size="22" font-weight="700">' + x(nombre) + '</text>' +
            '<text x="230" y="166" text-anchor="middle" font-size="12">' + x(correo) + ' · ' + x(fecha) + '</text></g></svg>';
        return 'url("data:image/svg+xml;utf8,' + encodeURIComponent(svg) + '")';
    }
    function prepararImpresion(nombre, correo) {
        let capa = document.querySelector('.guion-marca-print');
        if (!capa) { capa = document.createElement('div'); capa.className = 'guion-marca-print'; capa.setAttribute('aria-hidden', 'true'); document.body.appendChild(capa); }
        const fecha = new Date().toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City', day: '2-digit', month: '2-digit', year: 'numeric' });
        capa.style.backgroundImage = marcaImpresionSvg(nombre, correo, fecha);
    }
    let detallesAbiertosAntes = [];
    window.addEventListener('beforeprint', () => {
        detallesAbiertosAntes = [...document.querySelectorAll('details')].filter(d => !d.open);
        detallesAbiertosAntes.forEach(d => { d.open = true; });
    });
    window.addEventListener('afterprint', () => { detallesAbiertosAntes.forEach(d => { d.open = false; }); detallesAbiertosAntes = []; });
    function imprimirGuion() { window.print(); }
```

- [ ] **Step 3: Botón y capa en `render()`.** Reemplazar `app.innerHTML = renderGuionContent();` por:

```js
        app.innerHTML = renderGuionContent();
        const nombreMarca = (result && result.personalData && result.personalData.nombre) || session.user.email;
        prepararImpresion(nombreMarca, session.user.email);
        const heroGuion = app.querySelector('.hero');
        (heroGuion || app).insertAdjacentHTML(heroGuion ? 'afterend' : 'afterbegin',
            `<button type="button" class="btn btn-secondary btn-full btn-imprimir-guion" onclick="imprimirGuion()">🖨️ Imprimir o guardar en PDF</button>
             <p class="no-print" style="font-size:0.78rem;color:var(--text);margin:-10px 0 18px;">En la ventana de impresión elige "Guardar como PDF". Cada hoja lleva tu nombre como marca de agua.</p>`);
```

(`result` ya existe en `render()`: es `loadAutodiagnosticoResult()`. Si la variable tiene otro nombre en ese punto, usar la del bloque "Primero necesitas completar tu Autodiagnóstico".)

- [ ] **Step 4: Verificar PDF.** Con la preview y sesión simulada (Tarea 16) o con la cuenta demo: `page.emulateMedia({ media: 'print' })` + `page.pdf({ path: 'scratchpad/guion.pdf' })` en Playwright. Revisar con `pdftoppm -r 50 -png guion.pdf` que: (a) no aparecen sidebar ni botones, (b) la marca con el nombre se ve en **todas** las hojas, (c) las secciones plegadas salen abiertas.

- [ ] **Step 5: Commit**

```bash
git add guion-maestro.html
git commit -m "Guion Maestro: imprimir o guardar en PDF con el nombre del candidato como marca de agua

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---
### Task 3: SQL de la sala (`2026-09-18-sala-evidencias.sql`)

**Files:**
- Create: `_internal_no_publicar/02-sql/2026-09-18-sala-evidencias.sql` (gitignored — no se comitea; Diego lo corre en el SQL Editor)

Depende de funciones que ya existen: `puede_evaluar()` (2026-09-18-centro-evaluador.sql), `is_admin(text)`, `is_fase_authorized(text, text)`, `is_current_user_flow_bypass_admin()` y la tabla `evaluaciones`.

- [ ] **Step 1: Escribir el archivo completo**

```sql
-- 2026-09-18 · Sala de evidencias (Zoom)
-- Spec: docs/superpowers/specs/2026-09-18-sala-evidencias-zoom-design.md
-- Correr completo en el SQL Editor de Supabase (proyecto numsuiuwrvpprhnxovmh)
-- DESPUÉS de 2026-09-18-centro-evaluador.sql. Re-ejecutable.
-- El enlace y la clave de Zoom NO van aquí: se capturan en admin-sesiones.html.

-- 0. ¿La sesión está exenta de candados? (equipo o cuenta demo)
create or replace function sala_exento()
returns boolean language sql security definer stable set search_path = public as $$
  select coalesce(puede_evaluar(), false) or coalesce(is_current_user_flow_bypass_admin(), false);
$$;
grant execute on function sala_exento() to authenticated;

-- 1. Configuración (una fila) ------------------------------------------------
create table if not exists sala_evidencias_config (
  id int primary key default 1 check (id = 1),
  zoom_url text,
  zoom_id text,
  zoom_clave text,
  dias_limite int not null default 30 check (dias_limite between 1 and 365),
  minutos_antes int not null default 10 check (minutos_antes between 0 and 60),
  horas_cambio int not null default 24 check (horas_cambio between 0 and 168),
  updated_at timestamptz not null default now(),
  updated_by text
);
insert into sala_evidencias_config (id) values (1) on conflict (id) do nothing;
alter table sala_evidencias_config enable row level security;
drop policy if exists "sala config: equipo" on sala_evidencias_config;
create policy "sala config: equipo" on sala_evidencias_config for all to authenticated
  using (puede_evaluar()) with check (puede_evaluar());

-- 2. Horarios (sin traslapes, colchón incluido) -------------------------------
create table if not exists horarios_evidencia (
  id uuid primary key default gen_random_uuid(),
  inicio timestamptz not null,
  fin timestamptz not null,
  colchon_min int not null default 15 check (colchon_min between 0 and 120),
  fin_con_colchon timestamptz not null,
  creado_por text,
  created_at timestamptz not null default now(),
  check (fin > inicio),
  -- timestamptz + interval no es IMMUTABLE, por eso el fin con colchón se
  -- guarda en una columna (la llena el trigger de abajo).
  constraint horarios_evidencia_sin_traslape exclude using gist (tstzrange(inicio, fin_con_colchon) with &&)
);
create or replace function horarios_evidencia_colchon()
returns trigger language plpgsql as $$
begin
  new.fin_con_colchon := new.fin + make_interval(mins => new.colchon_min);
  return new;
end;
$$;
drop trigger if exists horarios_evidencia_colchon on horarios_evidencia;
create trigger horarios_evidencia_colchon before insert or update on horarios_evidencia
  for each row execute function horarios_evidencia_colchon();
alter table horarios_evidencia enable row level security;
drop policy if exists "horarios evidencia: equipo" on horarios_evidencia;
create policy "horarios evidencia: equipo" on horarios_evidencia for all to authenticated
  using (puede_evaluar()) with check (puede_evaluar());

-- 3. Reservas (un candidato por horario, una activa por candidato) -----------
create table if not exists reservas_evidencia (
  id uuid primary key default gen_random_uuid(),
  horario_id uuid not null references horarios_evidencia(id) on delete cascade,
  email text not null,
  estado text not null default 'reservada' check (estado in ('reservada','cancelada','asistio','no_asistio')),
  por text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists reservas_evidencia_un_candidato_por_horario
  on reservas_evidencia (horario_id) where estado in ('reservada','asistio');
create unique index if not exists reservas_evidencia_una_activa
  on reservas_evidencia (email) where estado = 'reservada';
alter table reservas_evidencia enable row level security;
drop policy if exists "reservas evidencia: equipo" on reservas_evidencia;
create policy "reservas evidencia: equipo" on reservas_evidencia for all to authenticated
  using (puede_evaluar()) with check (puede_evaluar());

-- 4. Evaluaciones: extensión de plazo y grabación ----------------------------
alter table evaluaciones add column if not exists limite_evidencia date;
alter table evaluaciones add column if not exists video jsonb;

-- 5. Fecha límite: extensión o autorización de Alineación + días -------------
create or replace function limite_evidencia_para(p_email text)
returns date language plpgsql security definer stable set search_path = public as $$
declare
  correo text := lower(trim(p_email));
  ext date; aut timestamptz; dias int;
begin
  if correo is null or not (coalesce(puede_evaluar(), false) or correo = lower(auth.jwt()->>'email')) then
    return null;
  end if;
  select limite_evidencia into ext from evaluaciones where email = correo;
  if ext is not null then return ext; end if;
  select min(autorizado_en) into aut from candidatos_fase_pagos where lower(email) = correo and fase = 'alineacion';
  if aut is null then return null; end if;
  select dias_limite into dias from sala_evidencias_config where id = 1;
  return (aut at time zone 'America/Mexico_City')::date + coalesce(dias, 30);
end;
$$;
grant execute on function limite_evidencia_para(text) to authenticated;

-- 6. RPC del candidato ------------------------------------------------------
create or replace function horarios_evidencia_disponibles()
returns table(id uuid, inicio timestamptz, fin timestamptz)
language sql security definer stable set search_path = public as $$
  select h.id, h.inicio, h.fin
  from horarios_evidencia h
  where h.inicio > now() + interval '2 hours'
    and not exists (select 1 from reservas_evidencia r where r.horario_id = h.id and r.estado in ('reservada','asistio'))
    and (sala_exento() or is_fase_authorized(auth.jwt()->>'email', 'alineacion'))
  order by h.inicio
  limit 500;
$$;
grant execute on function horarios_evidencia_disponibles() to authenticated;

create or replace function reservar_horario_evidencia(p_horario uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  correo text := lower(auth.jwt()->>'email');
  horas int;
  h_inicio timestamptz; h_fin timestamptz;
  actual_id uuid; actual_inicio timestamptz;
  nueva_id uuid;
begin
  if correo is null then raise exception 'Inicia sesión para reservar'; end if;
  if not (sala_exento() or is_fase_authorized(correo, 'alineacion')) then
    raise exception 'Primero necesitas tu Alineación pagada';
  end if;
  select horas_cambio into horas from sala_evidencias_config where id = 1;
  select inicio, fin into h_inicio, h_fin from horarios_evidencia where id = p_horario;
  if h_inicio is null or h_inicio <= now() + interval '2 hours' then
    raise exception 'Ese horario ya no está disponible. Elige otro.';
  end if;
  select r.id, h.inicio into actual_id, actual_inicio
    from reservas_evidencia r join horarios_evidencia h on h.id = r.horario_id
    where r.email = correo and r.estado = 'reservada'
    for update of r;
  if actual_id is not null then
    if actual_inicio - now() < make_interval(hours => coalesce(horas, 24)) then
      raise exception 'Ya no se puede cambiar tu horario (faltan menos de % h). Escríbenos por WhatsApp.', coalesce(horas, 24);
    end if;
    update reservas_evidencia set estado = 'cancelada', updated_at = now(), por = correo where id = actual_id;
  end if;
  begin
    insert into reservas_evidencia (horario_id, email, por) values (p_horario, correo, correo) returning id into nueva_id;
  exception when unique_violation then
    -- Otra persona lo tomó en el mismo instante. El raise revierte TODO,
    -- incluida la cancelación de la reserva anterior.
    raise exception 'Ese horario acaba de ocuparse. Elige otro.';
  end;
  return jsonb_build_object('id', nueva_id, 'inicio', h_inicio, 'fin', h_fin, 'estado', 'reservada');
end;
$$;
grant execute on function reservar_horario_evidencia(uuid) to authenticated;

create or replace function cancelar_mi_horario_evidencia()
returns boolean language plpgsql security definer set search_path = public as $$
declare
  correo text := lower(auth.jwt()->>'email');
  horas int; actual_id uuid; actual_inicio timestamptz;
begin
  select horas_cambio into horas from sala_evidencias_config where id = 1;
  select r.id, h.inicio into actual_id, actual_inicio
    from reservas_evidencia r join horarios_evidencia h on h.id = r.horario_id
    where r.email = correo and r.estado = 'reservada' for update of r;
  if actual_id is null then return false; end if;
  if actual_inicio - now() < make_interval(hours => coalesce(horas, 24)) then
    raise exception 'Ya no se puede cancelar (faltan menos de % h). Escríbenos por WhatsApp.', coalesce(horas, 24);
  end if;
  update reservas_evidencia set estado = 'cancelada', updated_at = now(), por = correo where id = actual_id;
  return true;
end;
$$;
grant execute on function cancelar_mi_horario_evidencia() to authenticated;

-- El enlace y la clave SOLO al dueño del horario, dentro de su ventana.
create or replace function mi_sala_evidencia()
returns jsonb language plpgsql security definer stable set search_path = public as $$
declare
  correo text := lower(auth.jwt()->>'email');
  cfg sala_evidencias_config;
  r_id uuid; r_estado text; r_ini timestamptz; r_fin timestamptz;
  habilitada boolean;
  vid jsonb; ext date;
  sala jsonb := null;
begin
  if correo is null then return null; end if;
  select * into cfg from sala_evidencias_config where id = 1;
  select r.id, r.estado, h.inicio, h.fin into r_id, r_estado, r_ini, r_fin
    from reservas_evidencia r join horarios_evidencia h on h.id = r.horario_id
    where r.email = correo and r.estado in ('reservada','asistio','no_asistio')
    order by case when r.estado = 'reservada' then 0 else 1 end, h.inicio desc
    limit 1;
  habilitada := sala_exento() or is_fase_authorized(correo, 'alineacion');
  if r_id is not null and r_estado in ('reservada','asistio') and habilitada
     and cfg.zoom_url is not null
     and now() >= r_ini - make_interval(mins => cfg.minutos_antes) and now() <= r_fin then
    sala := jsonb_build_object('url', cfg.zoom_url, 'id', cfg.zoom_id, 'clave', cfg.zoom_clave);
  end if;
  select video, limite_evidencia into vid, ext from evaluaciones where email = correo;
  return jsonb_build_object(
    'reserva', case when r_id is null then null else jsonb_build_object('id', r_id, 'inicio', r_ini, 'fin', r_fin, 'estado', r_estado) end,
    'limite', limite_evidencia_para(correo),
    'limite_extendido', ext is not null,
    'minutos_antes', cfg.minutos_antes,
    'horas_cambio', cfg.horas_cambio,
    'sala', sala,
    'grabacion', jsonb_build_object(
      'en_expediente', coalesce(jsonb_path_exists(vid, '$.partes[*].nas.ruta'), false),
      'fecha', (select max(p->'nas'->>'fecha') from jsonb_array_elements(coalesce(vid->'partes', '[]'::jsonb)) p))
  );
end;
$$;
grant execute on function mi_sala_evidencia() to authenticated;
```

- [ ] **Step 2: Revisión en seco.** Sin acceso al SQL Editor, revisar a ojo: cada `create or replace function` tiene su `grant`; ninguna tabla nueva tiene política para el candidato (solo RPC); `reservar_horario_evidencia` devuelve error legible en los 4 casos (sin sesión, sin Alineación, horario pasado/ocupado, cambio a menos de N h).

- [ ] **Step 3: Sin commit** (carpeta ignorada). Anotar en el resumen final que Diego debe correrlo **después** de `2026-09-18-centro-evaluador.sql` (si ese no se ha corrido, correr ambos en ese orden).

---
### Task 4: `sala-evidencias.js` — núcleo puro (TDD)

**Files:**
- Create: `tests/sala-evidencias.test.js`
- Create: `sala-evidencias.js`

Fechas: México no tiene horario de verano desde oct 2022 → UTC−6 fijo. Todas las fechas "de calendario" (`YYYY-MM-DD`) son en hora de México.

- [ ] **Step 1: Escribir las pruebas que fallan** (`tests/sala-evidencias.test.js`)

```js
// tests/sala-evidencias.test.js — correr con: node --test tests/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../sala-evidencias.js');

const MIN = 60000;
const T = Date.parse('2026-09-25T16:00:00Z'); // jueves 25 sep 2026, 10:00 en México
const reserva = (estado) => ({ id: 'r1', inicio: '2026-09-25T16:00:00.000Z', fin: '2026-09-25T17:30:00.000Z', estado: estado || 'reservada' });
const SALA = { url: 'https://us06web.zoom.us/j/82757263451?pwd=abc', id: '827 5726 3451', clave: 'PAIDEIA' };

test('fechas en hora de México (UTC−6, sin horario de verano)', () => {
    assert.equal(S.mxAIso('2026-09-25', '10:00'), '2026-09-25T16:00:00.000Z');
    assert.equal(S.hora('2026-09-25T16:00:00Z'), '10:00');
    assert.equal(S.hora('2026-09-25T06:05:00Z'), '00:05');
    assert.equal(S.horarioTexto('2026-09-25T16:00:00Z', '2026-09-25T17:30:00Z'), '10:00 a 11:30 h');
    assert.equal(S.fechaISO(Date.parse('2026-09-26T05:30:00Z')), '2026-09-25'); // 23:30 del 25 en México
    assert.match(S.fechaLarga('2026-10-15'), /15 de octubre de 2026/);
});

test('limiteDesde: día de la autorización en México + N días', () => {
    assert.equal(S.limiteDesde('2026-09-10T16:00:00Z', 30), '2026-10-10');
    assert.equal(S.limiteDesde('2026-09-11T03:00:00Z', 30), '2026-10-10'); // 21:00 del 10 en México
    assert.equal(S.limiteDesde(null, 30), null);
    assert.equal(S.limiteDesde('no es fecha', 30), null);
});

test('limiteInfo: ok, pronto (≤7 y último día), vencido, entregada, sin límite', () => {
    assert.deepEqual(S.limiteInfo('2026-10-15', '2026-10-03', false), { clave: 'ok', dias: 12, limite: '2026-10-15' });
    assert.equal(S.limiteInfo('2026-10-15', '2026-10-08', false).clave, 'pronto');
    assert.deepEqual(S.limiteInfo('2026-10-15', '2026-10-15', false), { clave: 'pronto', dias: 0, limite: '2026-10-15' });
    assert.deepEqual(S.limiteInfo('2026-10-15', '2026-10-16', false), { clave: 'vencido', dias: -1, limite: '2026-10-15' });
    assert.equal(S.limiteInfo('2026-10-15', '2026-10-16', true).clave, 'entregada');
    assert.equal(S.limiteInfo(null, '2026-10-16', false), null);
});

test('estado: sin reserva y cancelada', () => {
    assert.equal(S.estado({ reserva: null }, T).clave, 'sin_reserva');
    assert.equal(S.estado({ reserva: reserva('cancelada') }, T).clave, 'sin_reserva');
    assert.equal(S.estado(null, T).clave, 'sin_reserva');
});

test('estado: antes de la ventana, con cuenta regresiva a la apertura', () => {
    const e = S.estado({ reserva: reserva(), minutos_antes: 10, sala: null }, T - 11 * MIN);
    assert.equal(e.clave, 'antes');
    assert.equal(e.abreEnMs, MIN);
});

test('estado: la ventana abre exactamente N min antes y cierra exactamente al fin', () => {
    assert.equal(S.estado({ reserva: reserva(), minutos_antes: 10, sala: SALA }, T - 10 * MIN).clave, 'abierta');
    assert.equal(S.estado({ reserva: reserva(), minutos_antes: 10, sala: SALA }, T + 90 * MIN).clave, 'abierta');
    assert.equal(S.estado({ reserva: reserva(), minutos_antes: 10, sala: SALA }, T + 90 * MIN + 1).clave, 'terminada');
});

test('estado: en la ventana pero sin enlace del servidor → sigue "antes" esperando', () => {
    const e = S.estado({ reserva: reserva(), minutos_antes: 10, sala: null }, T);
    assert.equal(e.clave, 'antes');
    assert.equal(e.esperandoServidor, true);
});

test('estado: no asistió y asistió (ya pasó)', () => {
    assert.equal(S.estado({ reserva: reserva('no_asistio') }, T).clave, 'no_asistio');
    assert.equal(S.estado({ reserva: reserva('asistio') }, T + 200 * MIN).clave, 'terminada');
});

test('puedeCambiar: solo con N horas o más de anticipación', () => {
    assert.equal(S.puedeCambiar(reserva(), 24, T - 24 * 60 * MIN), true);
    assert.equal(S.puedeCambiar(reserva(), 24, T - 23 * 60 * MIN), false);
    assert.equal(S.puedeCambiar(null, 24, T), false);
});

test('cuentaRegresiva', () => {
    assert.equal(S.cuentaRegresiva(59 * MIN), '59 min');
    assert.equal(S.cuentaRegresiva(90 * MIN), '1 h 30 min');
    assert.equal(S.cuentaRegresiva(26 * 60 * MIN), '1 día 2 h');
    assert.equal(S.cuentaRegresiva(3 * 24 * 60 * MIN), '3 días');
    assert.equal(S.cuentaRegresiva(0), 'ya');
});

const PLANTILLA = { dias: [4], horas: ['09:00', '10:00', '11:00'], duracion: 90, colchon: 15, desde: '2026-09-24', hasta: '2026-10-01' };
const AHORA = Date.parse('2026-09-20T00:00:00Z');

test('generarHorarios: jueves, sin traslapes entre sí (colchón incluido)', () => {
    const r = S.generarHorarios(PLANTILLA, [], AHORA);
    assert.deepEqual(r.nuevos.map(h => h.inicio), [
        '2026-09-24T15:00:00.000Z', '2026-09-24T17:00:00.000Z',
        '2026-10-01T15:00:00.000Z', '2026-10-01T17:00:00.000Z'
    ]);
    assert.equal(r.nuevos[0].fin, '2026-09-24T16:30:00.000Z');
    assert.equal(r.nuevos[0].colchon_min, 15);
    assert.equal(r.omitidos.length, 2); // las de 10:00 chocan con 09:00 + 90 + 15
    assert.ok(r.omitidos.every(o => /traslapa/.test(o.motivo)));
});

test('generarHorarios: respeta los horarios que ya existen y omite los pasados', () => {
    const existentes = [{ inicio: '2026-09-24T17:00:00Z', fin: '2026-09-24T18:30:00Z', colchon_min: 15 }];
    const r = S.generarHorarios(PLANTILLA, existentes, AHORA);
    assert.ok(!r.nuevos.some(h => h.inicio === '2026-09-24T17:00:00.000Z'));
    const pasado = S.generarHorarios(PLANTILLA, [], Date.parse('2026-09-28T00:00:00Z'));
    assert.ok(pasado.nuevos.every(h => h.inicio.startsWith('2026-10-01')));
    assert.ok(pasado.omitidos.some(o => o.motivo === 'ya pasó'));
});

test('generarHorarios: datos inválidos → error sin horarios', () => {
    assert.ok(S.generarHorarios(Object.assign({}, PLANTILLA, { duracion: 0 }), [], AHORA).error);
    assert.ok(S.generarHorarios(Object.assign({}, PLANTILLA, { hasta: '2026-09-01' }), [], AHORA).error);
});

test('agruparPorDia: por fecha de México, en orden', () => {
    const g = S.agruparPorDia([
        { id: 'b', inicio: '2026-09-25T17:00:00Z', fin: '2026-09-25T18:30:00Z' },
        { id: 'a', inicio: '2026-09-25T15:00:00Z', fin: '2026-09-25T16:30:00Z' },
        { id: 'c', inicio: '2026-09-26T05:00:00Z', fin: '2026-09-26T06:30:00Z' } // 23:00 del 25 en México
    ]);
    assert.equal(g.length, 1);
    assert.deepEqual(g[0].horarios.map(h => h.id), ['a', 'b', 'c']);
    assert.equal(g[0].fecha, '2026-09-25');
});

test('esUrlZoom: solo enlaces https de zoom.us', () => {
    assert.equal(S.esUrlZoom('https://us06web.zoom.us/j/82757263451?pwd=abc.1'), true);
    assert.equal(S.esUrlZoom('https://evil.com/zoom.us/j/1'), false);
    assert.equal(S.esUrlZoom('javascript:alert(1)'), false);
    assert.equal(S.esUrlZoom('http://zoom.us/j/1'), false);
});
```

- [ ] **Step 2: Correr y ver que falla.** Run: `node --test tests/sala-evidencias.test.js` → Expected: FAIL `Cannot find module '../sala-evidencias.js'`.

- [ ] **Step 3: Implementar el núcleo** — crear `sala-evidencias.js`:

```js
/* =========================================================
   sala-evidencias.js — Sala de Zoom para grabar la evidencia (18 sep 2026).

   La sala es UNA reunión recurrente de Zoom con enlace y clave fijos para
   todos. La plataforma evita que se conecten 2 a la vez con horarios
   exclusivos (la base de datos no deja reservar un horario dos veces) y
   entregando el enlace SOLO al dueño del horario y SOLO dentro de su
   ventana (RPC mi_sala_evidencia(); el enlace nunca está en el HTML).

   Módulo compartido (como firma-candidato.js): la regla de qué se muestra
   y cuándo vive en un solo lugar. Lo usan plan-evaluacion.html (agenda),
   documentos-sesion.html y guion-maestro.html (tarjeta de la sala),
   panel.html y evidencias.html (aviso de fecha límite), y el equipo
   (admin-sala-evidencias.js, admin-data.js, grabacion-zoom.js).
   Spec: docs/superpowers/specs/2026-09-18-sala-evidencias-zoom-design.md
   Pruebas: tests/sala-evidencias.test.js
========================================================= */
(function (root) {
    'use strict';

    var TZ = 'America/Mexico_City';
    /* México no tiene horario de verano desde octubre de 2022: siempre UTC−6. */
    var OFFSET_MX = '-06:00';
    var MIN_MS = 60000, DIA_MS = 86400000;
    var LUGAR_SALA = 'En línea — Sala Zoom PAIDEIA · Grabación de evidencias';
    var WHATSAPP = 'https://wa.me/528115026729';

    /* ---------- fechas (puras) ---------- */
    function esc(s) {
        return String(s === null || s === undefined ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function esFechaISO(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s); }
    function aMs(v) { return esFechaISO(v) ? Date.parse(v + 'T12:00:00' + OFFSET_MX) : Date.parse(v); }
    function fechaISO(ms) { return new Date(ms).toLocaleDateString('en-CA', { timeZone: TZ }); }
    function fechaLarga(v) { return new Date(aMs(v)).toLocaleDateString('es-MX', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); }
    function fechaCorta(v) { return new Date(aMs(v)).toLocaleDateString('es-MX', { timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric' }); }
    function hora(v) { return new Date(v).toLocaleTimeString('es-MX', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }); }
    function horarioTexto(inicio, fin) { return hora(inicio) + ' a ' + hora(fin) + ' h'; }
    function mxAIso(fecha, hhmm) { return new Date(fecha + 'T' + hhmm + ':00' + OFFSET_MX).toISOString(); }
    function sumarDias(fecha, n) { var d = new Date(fecha + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
    function diasEntre(a, b) { return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / DIA_MS); }

    /* Misma regla que limite_evidencia_para() del SQL. */
    function limiteDesde(autorizadoEn, dias) {
        var t = Date.parse(autorizadoEn || '');
        return isNaN(t) ? null : sumarDias(fechaISO(t), Number(dias) || 30);
    }
    function limiteInfo(limite, hoy, entregada) {
        if (!esFechaISO(limite)) return null;
        if (entregada) return { clave: 'entregada', dias: null, limite: limite };
        var dias = diasEntre(hoy, limite);
        return { clave: dias < 0 ? 'vencido' : dias <= 7 ? 'pronto' : 'ok', dias: dias, limite: limite };
    }
    function esUrlZoom(u) { return typeof u === 'string' && /^https:\/\/([a-z0-9-]+\.)*zoom\.us\/[^\s"'<>]*$/i.test(u); }

    function cuentaRegresiva(ms) {
        if (!(ms > 0)) return 'ya';
        var min = Math.ceil(ms / MIN_MS);
        if (min < 60) return min + ' min';
        var h = Math.floor(min / 60), m = min % 60;
        if (h < 24) return h + ' h' + (m ? ' ' + m + ' min' : '');
        var d = Math.floor(h / 24), hr = h % 24;
        return d + (d === 1 ? ' día' : ' días') + (hr ? ' ' + hr + ' h' : '');
    }

    /* ---------- estado de la tarjeta (puro) ----------
       d = respuesta de mi_sala_evidencia(). El enlace (d.sala) solo llega del
       servidor dentro de la ventana; si el reloj local ya está en la ventana
       pero aún no hay enlace, se sigue esperando (y se vuelve a pedir). */
    function estado(d, ahoraMs) {
        var r = d && d.reserva;
        if (!r || r.estado === 'cancelada') return { clave: 'sin_reserva' };
        if (r.estado === 'no_asistio') return { clave: 'no_asistio' };
        var ini = Date.parse(r.inicio), fin = Date.parse(r.fin);
        var abre = ini - (Number(d.minutos_antes) || 0) * MIN_MS;
        if (ahoraMs > fin) return { clave: 'terminada' };
        if (ahoraMs < abre) return { clave: 'antes', abreEnMs: abre - ahoraMs };
        if (d.sala) return { clave: 'abierta', terminaEnMs: fin - ahoraMs };
        return { clave: 'antes', abreEnMs: 0, esperandoServidor: true };
    }
    function puedeCambiar(r, horasCambio, ahoraMs) {
        if (!r || !r.inicio) return false;
        return Date.parse(r.inicio) - ahoraMs >= (Number(horasCambio) || 0) * 60 * MIN_MS;
    }

    /* ---------- plantilla semanal (pura) ----------
       p = { dias: [0..6 como getUTCDay: 0 = domingo], horas: ['09:00'], duracion, colchon, desde, hasta } */
    function intervalo(h) { var ini = Date.parse(h.inicio); return { ini: ini, finC: Date.parse(h.fin) + (Number(h.colchon_min) || 0) * MIN_MS }; }
    function traslapa(a, b) { return a.ini < b.finC && b.ini < a.finC; }
    function generarHorarios(p, existentes, ahoraMs) {
        p = p || {};
        var dur = Number(p.duracion), col = Number(p.colchon) || 0;
        if (!(dur > 0) || col < 0 || !esFechaISO(p.desde) || !esFechaISO(p.hasta) || p.hasta < p.desde) {
            return { nuevos: [], omitidos: [], error: 'Revisa la duración y el rango de fechas.' };
        }
        var horas = (p.horas || []).filter(function (h) { return /^\d{2}:\d{2}$/.test(h); }).sort();
        var ocupados = (existentes || []).map(intervalo);
        var nuevos = [], omitidos = [];
        for (var f = p.desde, n = 0; f <= p.hasta && n < 400; f = sumarDias(f, 1), n++) {
            if ((p.dias || []).indexOf(new Date(f + 'T00:00:00Z').getUTCDay()) < 0) continue;
            horas.forEach(function (hh) {
                var inicio = mxAIso(f, hh);
                var cand = { inicio: inicio, fin: new Date(Date.parse(inicio) + dur * MIN_MS).toISOString(), colchon_min: col };
                var iv = intervalo(cand);
                if (iv.ini <= ahoraMs) { omitidos.push({ inicio: inicio, motivo: 'ya pasó' }); return; }
                if (ocupados.some(function (o) { return traslapa(iv, o); })) { omitidos.push({ inicio: inicio, motivo: 'se traslapa con otro horario' }); return; }
                ocupados.push(iv);
                nuevos.push(cand);
            });
        }
        return { nuevos: nuevos, omitidos: omitidos };
    }

    function agruparPorDia(horarios) {
        var dias = {}, orden = [];
        (horarios || []).slice().sort(function (a, b) { return Date.parse(a.inicio) - Date.parse(b.inicio); }).forEach(function (h) {
            var f = fechaISO(Date.parse(h.inicio));
            if (!dias[f]) {
                dias[f] = { fecha: f, etiqueta: new Date(aMs(f)).toLocaleDateString('es-MX', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' }), horarios: [] };
                orden.push(f);
            }
            dias[f].horarios.push({ id: h.id, inicio: h.inicio, fin: h.fin, texto: horarioTexto(h.inicio, h.fin) });
        });
        return orden.map(function (f) { return dias[f]; });
    }

    var api = {
        TZ: TZ, LUGAR_SALA: LUGAR_SALA, WHATSAPP: WHATSAPP, _esc: esc,
        fechaISO: fechaISO, fechaLarga: fechaLarga, fechaCorta: fechaCorta, hora: hora, horarioTexto: horarioTexto,
        mxAIso: mxAIso, sumarDias: sumarDias, limiteDesde: limiteDesde, limiteInfo: limiteInfo, esUrlZoom: esUrlZoom,
        cuentaRegresiva: cuentaRegresiva, estado: estado, puedeCambiar: puedeCambiar,
        generarHorarios: generarHorarios, agruparPorDia: agruparPorDia
    };
    /* (La capa de navegador se agrega en la Tarea 5, antes de este bloque.) */
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.SalaEvidencias = api;
})(typeof window !== 'undefined' ? window : this);
```

- [ ] **Step 4: Correr y ver que pasa.** Run: `node --test tests/sala-evidencias.test.js` → Expected: PASS (16 pruebas). Si `fechaLarga`/`agruparPorDia` fallan por ICU, verificar `node -p "Intl.DateTimeFormat('es-MX').format(0)"` (Node 24 trae ICU completo).

- [ ] **Step 5: Suite completa y commit**

```bash
node --test tests/*.test.js
git add sala-evidencias.js tests/sala-evidencias.test.js
git commit -m "Sala de evidencias: núcleo puro (hora de México, ventana, plazo, plantilla semanal)

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---
### Task 5: `sala-evidencias.js` — HTML y capa de navegador (agenda, tarjeta, aviso, grabación)

**Files:**
- Modify: `sala-evidencias.js` (agregar antes del bloque `var api = {`)
- Modify: `tests/sala-evidencias.test.js` (agregar al final)

- [ ] **Step 1: Pruebas de HTML que fallan** — agregar a `tests/sala-evidencias.test.js`:

```js
test('tarjetaHtml abierta: botón con el enlace, ID y clave escapados', () => {
    const d = { reserva: reserva(), minutos_antes: 10, sala: { url: SALA.url, id: '827 5726 3451', clave: '<b>x</b>' } };
    const h = S.tarjetaHtml(d, S.estado(d, T));
    assert.match(h, /Entrar a la sala de Zoom/);
    assert.match(h, /href="https:\/\/us06web\.zoom\.us\/j\/82757263451\?pwd=abc"/);
    assert.match(h, /&lt;b&gt;x&lt;\/b&gt;/);
    assert.ok(!/<b>x<\/b>/.test(h));
    assert.match(h, /Si al entrar ves a otra persona/);
});

test('tarjetaHtml: un enlace que no es de zoom.us nunca se vuelve liga', () => {
    const d = { reserva: reserva(), minutos_antes: 10, sala: { url: 'javascript:alert(1)', id: '1', clave: '' } };
    const h = S.tarjetaHtml(d, S.estado(d, T));
    assert.ok(!/javascript:/.test(h));
    assert.match(h, /no es válido/);
});

test('tarjetaHtml antes: botón deshabilitado y cuenta regresiva; sin reserva: liga a agendar', () => {
    const d = { reserva: reserva(), minutos_antes: 10, sala: null };
    const h = S.tarjetaHtml(d, S.estado(d, T - 70 * MIN));
    assert.match(h, /disabled/);
    assert.match(h, /1 h/);
    assert.match(S.tarjetaHtml({ reserva: null }, S.estado({ reserva: null }, T)), /plan-evaluacion\.html/);
});

test('avisoHtml: colores y textos por estado', () => {
    assert.match(S.avisoHtml(S.limiteInfo('2026-10-15', '2026-10-03', false)), /sala-aviso-info[\s\S]*faltan 12 días/);
    assert.match(S.avisoHtml(S.limiteInfo('2026-10-15', '2026-10-14', false)), /sala-aviso-warn[\s\S]*faltan 1 día/);
    assert.match(S.avisoHtml(S.limiteInfo('2026-10-15', '2026-10-15', false)), /hoy es el último día/);
    assert.match(S.avisoHtml(S.limiteInfo('2026-10-15', '2026-10-20', false)), /sala-aviso-bad[\s\S]*venció/);
    assert.match(S.avisoHtml(S.limiteInfo('2026-10-15', '2026-10-20', true)), /Evidencia entregada/);
    assert.equal(S.avisoHtml(null), '');
});

test('grabacionHtml: pendiente o guardada en el expediente', () => {
    assert.match(S.grabacionHtml({ grabacion: { en_expediente: false } }), /Pendiente/);
    assert.match(S.grabacionHtml({ grabacion: { en_expediente: true, fecha: '2026-09-26T18:00:00Z' } }), /Guardada en tu expediente/);
});

test('selectorHtml: días y horarios como botones; sin horarios avisa', () => {
    const dias = S.agruparPorDia([{ id: 'h1', inicio: '2026-09-25T16:00:00Z', fin: '2026-09-25T17:30:00Z' }]);
    const h = S.selectorHtml(dias, null);
    assert.match(h, /data-sala-dia="2026-09-25"/);
    assert.match(h, /data-sala-horario="h1"[^>]*>10:00 a 11:30 h/);
    assert.match(S.selectorHtml([], null), /No hay horarios disponibles/);
});
```

- [ ] **Step 2: Correr y ver que falla.** Run: `node --test tests/sala-evidencias.test.js` → Expected: FAIL `S.tarjetaHtml is not a function`.

- [ ] **Step 3: Implementar.** En `sala-evidencias.js`, antes de `var api = {`, agregar:

```js
    /* ---------- HTML (puro) ---------- */
    var REGLAS = [
        'La sala es individual: entra solo en tu horario.',
        '<strong>Si al entrar ves a otra persona, sal de inmediato y avísanos por WhatsApp.</strong>',
        'No compartas el enlace ni la clave.',
        '<strong>La grabación empieza en cuanto entras</strong>: llega con tu usuario, tu equipo listo y esta página abierta.',
        'Pon tu nombre completo en Zoom (así se identifica tu grabación).',
        'Cámara y micrófono encendidos todo el tiempo.',
        'Al terminar, sal completamente de Zoom ("Salir de la reunión" y cierra la app).'
    ];
    function reglasHtml(abiertas) {
        return '<details class="sala-reglas"' + (abiertas ? ' open' : '') + '><summary>Reglas de la sala</summary><ol>' +
            REGLAS.map(function (r) { return '<li>' + r + '</li>'; }).join('') + '</ol></details>';
    }
    function tarjetaHtml(d, est, opts) {
        opts = opts || {};
        var r = d && d.reserva;
        var cuando = r ? esc(fechaLarga(r.inicio)) + ' · ' + esc(horarioTexto(r.inicio, r.fin)) : '';
        var antes = Number(d && d.minutos_antes) || 0;
        var h = '<div class="sala-card sala-' + est.clave + '"><h2>🎥 Tu sala de evidencia</h2>';
        if (est.clave === 'sin_reserva') {
            h += '<p>Aún no tienes horario para grabar tu sesión. Cada horario es para una sola persona.</p>' +
                 '<a class="sala-btn" href="plan-evaluacion.html">Agendar mi horario</a>';
        } else if (est.clave === 'antes') {
            h += '<p class="sala-cuando">' + cuando + '</p>' +
                 (est.esperandoServidor ? '<p>Abriendo la sala…</p>'
                    : '<p>La sala se abre ' + (antes ? antes + ' min antes de tu horario' : 'a la hora de tu horario') + ' · faltan <strong>' + esc(cuentaRegresiva(est.abreEnMs)) + '</strong></p>') +
                 '<button type="button" class="sala-btn" disabled>Se habilita ' + (antes ? antes + ' min antes' : 'a tu hora') + '</button>';
        } else if (est.clave === 'abierta') {
            var s = d.sala;
            h += '<p class="sala-cuando">' + cuando + ' · <strong>la sala está abierta</strong></p>';
            if (s.url === null) h += '<button type="button" class="sala-btn sala-btn-ok" data-sala-demo>Entrar a la sala de Zoom</button>';
            else if (esUrlZoom(s.url)) h += '<a class="sala-btn sala-btn-ok" data-sala-entrar href="' + esc(s.url) + '" target="_blank" rel="noopener noreferrer">Entrar a la sala de Zoom</a>';
            else h += '<p class="sala-msg">El enlace de la sala no es válido. Escríbenos por WhatsApp.</p>';
            h += '<p class="sala-datos">ID de reunión: <strong>' + esc(s.id || '') + '</strong>' +
                 (s.clave ? ' · Clave: <strong>' + esc(s.clave) + '</strong> <button type="button" class="sala-copiar" data-sala-copiar="' + esc(s.clave) + '">Copiar</button>' : '') + '</p>' +
                 '<p class="sala-nota">Tu horario termina a las ' + esc(hora(r.fin)) + ' h. Al terminar, sal completamente de Zoom.</p>';
        } else if (est.clave === 'terminada') {
            h += '<p class="sala-cuando">' + cuando + '</p><p>¿Ya grabaste? Sigue con tus documentos. Si algo falló, agenda otro horario.</p>' +
                 '<a class="sala-btn sala-btn-sec" href="plan-evaluacion.html">Agendar otro horario</a>';
        } else if (est.clave === 'no_asistio') {
            h += '<p>No se registró tu sesión del ' + esc(fechaLarga(r.inicio)) + '.</p><a class="sala-btn" href="plan-evaluacion.html">Agendar otro horario</a>';
        }
        if (est.clave === 'antes' || est.clave === 'abierta') h += reglasHtml(opts.reglasAbiertas);
        return h + '<p class="sala-ayuda">¿Algún problema? <a href="' + WHATSAPP + '" target="_blank" rel="noopener">Escríbenos por WhatsApp</a></p></div>';
    }
    function avisoHtml(info) {
        if (!info) return '';
        if (info.clave === 'entregada') return '<div class="sala-aviso sala-aviso-ok">✅ Evidencia entregada</div>';
        var f = '<strong>' + esc(fechaLarga(info.limite)) + '</strong>';
        if (info.clave === 'vencido') {
            return '<div class="sala-aviso sala-aviso-bad" role="alert">⏰ Tu plazo para entregar tu evidencia venció el ' + f +
                '. <a href="' + WHATSAPP + '" target="_blank" rel="noopener">Escríbenos por WhatsApp</a></div>';
        }
        var faltan = info.dias === 0 ? 'hoy es el último día' : 'faltan ' + info.dias + (info.dias === 1 ? ' día' : ' días');
        return '<div class="sala-aviso ' + (info.clave === 'pronto' ? 'sala-aviso-warn' : 'sala-aviso-info') + '">📅 Tienes hasta el ' + f + ' para entregar tu evidencia · ' + faltan + '</div>';
    }
    function grabacionHtml(d) {
        var g = d && d.grabacion;
        if (g && g.en_expediente) return '<span class="sala-chip sala-chip-ok">✅ Guardada en tu expediente' + (g.fecha ? ' (' + esc(fechaCorta(g.fecha)) + ')' : '') + '</span>';
        return '<span class="sala-chip">⏳ Pendiente — el equipo la guardará en tu expediente</span>';
    }
    function selectorHtml(dias, diaSel) {
        if (!dias || !dias.length) return '<p class="sala-nota">No hay horarios disponibles por ahora.</p>';
        var sel = dias.filter(function (x) { return x.fecha === diaSel; })[0] || dias[0];
        return '<p class="sala-nota">1. Elige el día · 2. Elige la hora</p><div class="sala-dias" role="group" aria-label="Días disponibles">' +
            dias.map(function (x) { var on = x.fecha === sel.fecha; return '<button type="button" class="sala-dia' + (on ? ' on' : '') + '" data-sala-dia="' + x.fecha + '" aria-pressed="' + on + '">' + esc(x.etiqueta) + '</button>'; }).join('') +
            '</div><div class="sala-horas" role="group" aria-label="Horarios">' +
            sel.horarios.map(function (h) { return '<button type="button" class="sala-hora" data-sala-horario="' + esc(h.id) + '">' + esc(h.texto) + '</button>'; }).join('') + '</div>';
    }
    function reservaHtml(d, ahoraMs) {
        var r = d.reserva, cambia = puedeCambiar(r, d.horas_cambio, ahoraMs);
        return '<div class="sala-reservada"><p>✅ Tu horario: <strong>' + esc(fechaLarga(r.inicio)) + ' · ' + esc(horarioTexto(r.inicio, r.fin)) + '</strong></p>' +
            '<p class="sala-nota">Ese día entras a la sala desde Documentos de Sesión o el Guion Maestro; el botón se habilita ' + (Number(d.minutos_antes) || 0) + ' min antes.</p>' +
            '<div class="sala-acciones"><button type="button" class="sala-btn sala-btn-sec" data-sala-cambiar' + (cambia ? '' : ' disabled') + '>Cambiar horario</button>' +
            '<button type="button" class="sala-btn sala-btn-sec" data-sala-cancelar' + (cambia ? '' : ' disabled') + '>Cancelar</button></div>' +
            (cambia ? '' : '<p class="sala-nota">Faltan menos de ' + esc(d.horas_cambio) + ' h: para cambiarlo <a href="' + WHATSAPP + '" target="_blank" rel="noopener">escríbenos por WhatsApp</a>.</p>') + '</div>';
    }

    /* ---------- navegador ---------- */
    var ESTILOS = '.sala-card,.sala-reservada{background:var(--surface-2,rgba(127,127,127,.08));border:1px solid var(--border,rgba(127,127,127,.3));border-radius:12px;padding:16px;margin:0 0 18px}' +
        '.sala-card h2{font-size:1.05rem;margin:0 0 8px;color:var(--text-bright)}.sala-card p,.sala-reservada p{margin:0 0 10px;color:var(--text)}' +
        '.sala-cuando{color:var(--text-bright)!important;font-weight:600}.sala-nota,.sala-ayuda{font-size:.82rem}' +
        '.sala-btn{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:10px 18px;border-radius:10px;border:0;background:var(--primary,#0088FF);color:#fff;font-weight:700;text-decoration:none;cursor:pointer;margin:4px 8px 8px 0}' +
        '.sala-btn[disabled]{opacity:.55;cursor:not-allowed}.sala-btn-ok{background:var(--success,#00a86b)}.sala-btn-sec{background:transparent;color:var(--text-bright);border:1px solid var(--border,rgba(127,127,127,.4))}' +
        '.sala-copiar,.sala-link{background:none;border:1px solid var(--border,rgba(127,127,127,.4));border-radius:6px;padding:2px 8px;color:var(--text-bright);cursor:pointer;font-size:.8rem}' +
        '.sala-reglas{margin-top:8px}.sala-reglas summary{cursor:pointer;font-weight:600;color:var(--text-bright)}.sala-reglas ol{margin:8px 0 0 20px;color:var(--text);font-size:.86rem}.sala-reglas li{margin-bottom:4px}' +
        '.sala-aviso{border-radius:10px;padding:12px 14px;margin:0 0 16px;font-size:.9rem;border:1px solid}.sala-aviso-info{border-color:var(--primary,#0088FF);color:var(--text-bright)}' +
        '.sala-aviso-warn{border-color:#d4a017;background:rgba(212,160,23,.12);color:var(--text-bright)}.sala-aviso-bad{border-color:var(--danger,#FF3333);background:rgba(255,51,51,.1);color:var(--text-bright)}.sala-aviso-ok{border-color:var(--success,#00a86b);color:var(--text-bright)}' +
        '.sala-dias,.sala-horas{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 12px}.sala-dia,.sala-hora{min-height:44px;padding:8px 14px;border-radius:10px;border:1px solid var(--border,rgba(127,127,127,.4));background:transparent;color:var(--text-bright);cursor:pointer;font-weight:600}' +
        '.sala-dia.on{background:var(--primary,#0088FF);color:#fff;border-color:transparent}.sala-hora:hover,.sala-dia:hover{border-color:var(--primary,#0088FF)}' +
        '.sala-chip{display:inline-block;padding:4px 10px;border-radius:999px;background:var(--surface-2,rgba(127,127,127,.12));font-size:.82rem;color:var(--text)}.sala-chip-ok{color:var(--success,#00a86b)}' +
        '.sala-msg{font-weight:600;color:var(--text-bright)}';
    function inyectarEstilos() {
        if (typeof document === 'undefined' || document.getElementById('salaEvidenciasCss')) return;
        var st = document.createElement('style'); st.id = 'salaEvidenciasCss'; st.textContent = ESTILOS;
        document.head.appendChild(st);
    }
    function leerLS(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
    function escribirLS(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* sin storage */ } }

    /* Cuenta demo (paideia.tech@outlook.com): datos ficticios, nunca el
       enlace real ni llamadas a las RPC de reserva. */
    var demo = null, demoHorarios = null;
    function esDemo() { return !!(root.Auth && root.Auth._isBypassSession === true); }
    function datosDemo() {
        var ahora = Date.now();
        if (!demo) demo = {
            reserva: { id: 'demo', inicio: new Date(ahora - 5 * MIN_MS).toISOString(), fin: new Date(ahora + 85 * MIN_MS).toISOString(), estado: 'reservada' },
            limite: sumarDias(fechaISO(ahora), 12), limite_extendido: false, minutos_antes: 10, horas_cambio: 24,
            sala: { url: null, id: '000 0000 0000', clave: 'DEMO' }, grabacion: { en_expediente: false, fecha: null }
        };
        return demo;
    }
    function sb() { return root.supabaseClient || null; }
    function mensajeError(e) { return (e && (e.message || e.error_description)) || String(e || 'Error'); }

    async function cargar() {
        if (root.Auth && root.Auth.isBypassSession) { try { await root.Auth.isBypassSession(); } catch (e) { /* sin sesión */ } }
        if (esDemo()) return datosDemo();
        if (!sb()) return null;
        try {
            var r = await sb().rpc('mi_sala_evidencia');
            if (r.error) { console.warn('mi_sala_evidencia:', mensajeError(r.error)); return null; }
            return r.data || null;
        } catch (e) { console.warn('mi_sala_evidencia:', e); return null; }
    }
    async function disponibles() {
        if (esDemo()) {
            if (!demoHorarios) { var b = Date.now() + 2 * DIA_MS; demoHorarios = [0, 1, 2].map(function (i) { return { id: 'demo-' + i, inicio: new Date(b + i * 2 * 3600000).toISOString(), fin: new Date(b + i * 2 * 3600000 + 90 * MIN_MS).toISOString() }; }); }
            return demoHorarios;
        }
        var r = await sb().rpc('horarios_evidencia_disponibles');
        if (r.error) throw new Error(mensajeError(r.error));
        return r.data || [];
    }
    async function reservar(id) {
        if (esDemo()) { var h = (demoHorarios || []).filter(function (x) { return x.id === id; })[0]; datosDemo().reserva = { id: 'demo', inicio: h.inicio, fin: h.fin, estado: 'reservada' }; return datosDemo().reserva; }
        var r = await sb().rpc('reservar_horario_evidencia', { p_horario: id });
        if (r.error) throw new Error(mensajeError(r.error));
        return r.data;
    }
    async function cancelar() {
        if (esDemo()) { datosDemo().reserva = null; return true; }
        var r = await sb().rpc('cancelar_mi_horario_evidencia');
        if (r.error) throw new Error(mensajeError(r.error));
        return r.data;
    }

    /* Tarjeta de la sala: se repinta cada 30 s (la ventana se abre sola) y,
       si el reloj ya está en la ventana pero el servidor aún no mandó el
       enlace, lo vuelve a pedir (máximo cada 25 s). */
    async function tarjeta(el, opts) {
        if (!el) return;
        opts = opts || {};
        inyectarEstilos();
        var d = 'datos' in opts ? opts.datos : await cargar();
        if (!d) { el.innerHTML = ''; return; }
        var reglasVistas = leerLS('paideia-sala-reglas-vistas') === '1', ultima = Date.now(), timer = null;
        function pintar() {
            if (!document.body.contains(el)) { clearInterval(timer); return; }
            var ahora = Date.now(), est = estado(d, ahora);
            if (est.esperandoServidor && ahora - ultima > 25000) {
                ultima = ahora;
                cargar().then(function (n) { if (n) { d = n; pintar(); } });
            }
            var det = el.querySelector('details.sala-reglas');
            el.innerHTML = tarjetaHtml(d, est, { reglasAbiertas: det ? det.open : !reglasVistas });
            el.querySelectorAll('[data-sala-copiar]').forEach(function (b) {
                b.addEventListener('click', function () {
                    var t = b.getAttribute('data-sala-copiar');
                    (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { b.textContent = '¡Copiada!'; }, function () { b.textContent = t; });
                });
            });
            var dm = el.querySelector('[data-sala-demo]');
            if (dm) dm.addEventListener('click', function () { alert('Cuenta demo: aquí se abriría la sala de Zoom de Paideia.'); });
        }
        timer = setInterval(pintar, 30000);
        pintar();
        escribirLS('paideia-sala-reglas-vistas', '1');
    }

    async function avisoLimite(el, d) {
        if (!el) return;
        inyectarEstilos();
        if (d === undefined) d = await cargar();
        if (!d || !d.limite) { el.innerHTML = ''; return; }
        var entregada = false;
        try {
            var steps = root.FlowStatus ? await root.FlowStatus.getSteps() : [];
            var ev = steps.filter(function (s) { return s.id === 'evidencias'; })[0];
            entregada = !!(ev && ev.done);
        } catch (e) { /* sin pasos: se muestra el plazo */ }
        el.innerHTML = avisoHtml(limiteInfo(d.limite, fechaISO(Date.now()), entregada));
    }

    /* Monta todo lo que encuentre: [data-sala-tarjeta], [data-sala-aviso],
       [data-sala-grabacion]. Una sola llamada a mi_sala_evidencia(). */
    async function montar(contenedor) {
        contenedor = contenedor || document;
        inyectarEstilos();
        var t = contenedor.querySelectorAll('[data-sala-tarjeta]'), a = contenedor.querySelectorAll('[data-sala-aviso]'), g = contenedor.querySelectorAll('[data-sala-grabacion]');
        if (!t.length && !a.length && !g.length) return null;
        var d = await cargar();
        t.forEach(function (el) { tarjeta(el, { datos: d }); });
        a.forEach(function (el) { avisoLimite(el, d); });
        g.forEach(function (el) { el.innerHTML = d ? grabacionHtml(d) : ''; });
        return d;
    }
    function montarDespuesDelHero(app, opts) {
        opts = opts || {};
        var html = '<div data-sala-aviso></div>' + (opts.tarjeta === false ? '' : '<div data-sala-tarjeta></div>');
        var hero = app.querySelector('.hero');
        if (hero) hero.insertAdjacentHTML('afterend', html); else app.insertAdjacentHTML('afterbegin', html);
        return montar(app);
    }

    /* Agenda del Plan de Evaluación. Resuelve { activa, reserva } donde
       reserva = { fecha: 'YYYY-MM-DD', horario: '10:00 a 11:30 h', inicio, fin } o null.
       activa = false → la página conserva el modo de hoy (WhatsApp + fecha
       manual): sin SQL, o sin horarios y sin reserva. opts.onCambio(reserva|null). */
    async function agenda(el, opts) {
        opts = opts || {};
        inyectarEstilos();
        var d = await cargar();
        if (!d) { el.innerHTML = ''; return { activa: false, reserva: null }; }
        var lista = [], diaSel = null, mensaje = '', modoCambio = false;
        function vigente() { var r = d.reserva; return !!(r && r.estado === 'reservada' && Date.parse(r.fin) > Date.now()); }
        function resumen() { var r = d.reserva; return r && r.estado !== 'cancelada' ? { fecha: fechaISO(Date.parse(r.inicio)), horario: horarioTexto(r.inicio, r.fin), inicio: r.inicio, fin: r.fin } : null; }
        async function refrescar() { try { lista = agruparPorDia(await disponibles()); } catch (e) { lista = []; mensaje = 'No pudimos cargar los horarios: ' + mensajeError(e); } }
        function pintar() {
            var html = mensaje ? '<p class="sala-msg" role="status">' + esc(mensaje) + '</p>' : '';
            if (vigente() && !modoCambio) html += reservaHtml(d, Date.now());
            else {
                var r = d.reserva;
                if (r && !vigente() && r.estado !== 'cancelada') html += '<p class="sala-nota">Tu sesión anterior fue el ' + esc(fechaLarga(r.inicio)) + '. Si necesitas grabar de nuevo, elige otro horario.</p>';
                if (modoCambio) html += '<p class="sala-nota">Elige tu nuevo horario; el anterior se libera al confirmar. <button type="button" class="sala-link" data-sala-volver>Conservar mi horario</button></p>';
                html += selectorHtml(lista, diaSel);
            }
            el.innerHTML = html;
            el.querySelectorAll('[data-sala-dia]').forEach(function (b) { b.addEventListener('click', function () { diaSel = b.getAttribute('data-sala-dia'); mensaje = ''; pintar(); }); });
            el.querySelectorAll('[data-sala-horario]').forEach(function (b) { b.addEventListener('click', function () { elegir(b.getAttribute('data-sala-horario')); }); });
            var c = el.querySelector('[data-sala-cambiar]'); if (c) c.addEventListener('click', async function () { modoCambio = true; mensaje = ''; await refrescar(); pintar(); });
            var v = el.querySelector('[data-sala-volver]'); if (v) v.addEventListener('click', function () { modoCambio = false; pintar(); });
            var x = el.querySelector('[data-sala-cancelar]'); if (x) x.addEventListener('click', cancelarHorario);
        }
        async function elegir(id) {
            var h = null;
            lista.forEach(function (dia) { dia.horarios.forEach(function (x) { if (x.id === id) h = x; }); });
            if (!h || !confirm('¿Reservar el ' + fechaLarga(h.inicio) + ' de ' + horarioTexto(h.inicio, h.fin) + '?\n\nEse horario queda solo para ti.')) return;
            try {
                d.reserva = await reservar(id);
                modoCambio = false; mensaje = '✅ Horario reservado.';
                if (opts.onCambio) opts.onCambio(resumen());
            } catch (e) { mensaje = mensajeError(e); await refrescar(); }
            pintar();
        }
        async function cancelarHorario() {
            if (!confirm('¿Cancelar tu horario? Lo podrá tomar otra persona.')) return;
            try { await cancelar(); d.reserva = null; mensaje = 'Tu horario se canceló.'; await refrescar(); if (opts.onCambio) opts.onCambio(null); }
            catch (e) { mensaje = mensajeError(e); }
            pintar();
        }
        if (!vigente()) await refrescar();
        if (!vigente() && !lista.length && !(d.reserva && d.reserva.estado !== 'cancelada')) {
            el.innerHTML = mensaje ? '<p class="sala-msg">' + esc(mensaje) + '</p>' : '';
            return { activa: false, reserva: null };
        }
        pintar();
        return { activa: true, reserva: resumen() };
    }
```

Y en el objeto `api` agregar las claves nuevas:

```js
        tarjetaHtml: tarjetaHtml, avisoHtml: avisoHtml, grabacionHtml: grabacionHtml, selectorHtml: selectorHtml, reservaHtml: reservaHtml,
        cargar: cargar, disponibles: disponibles, reservar: reservar, cancelar: cancelar,
        tarjeta: tarjeta, avisoLimite: avisoLimite, montar: montar, montarDespuesDelHero: montarDespuesDelHero, agenda: agenda
```

- [ ] **Step 4: Correr.** Run: `node --test tests/sala-evidencias.test.js` → Expected: PASS (22 pruebas). Luego `node --test tests/*.test.js` → todas pasan.

- [ ] **Step 5: Commit**

```bash
git add sala-evidencias.js tests/sala-evidencias.test.js
git commit -m "Sala de evidencias: tarjeta, aviso de plazo, agenda y cuenta demo

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---
### Task 6: Plan de Evaluación — agenda de la sala

**Files:**
- Modify: `plan-evaluacion.html` (script tag línea ~17; tarjeta "📆 Agenda tu Evaluación" líneas ~908–947; `render()` ~línea 1000; `getValidationStatus`/`getMissingFields` ~1096–1118; `renderGeneratedState` ~1221)

- [ ] **Step 1: Cargar el módulo.** Después de `<script src="firma-candidato.js"></script>` agregar `<script src="sala-evidencias.js"></script>`.

- [ ] **Step 2: Tarjeta de agenda.** Reemplazar:

```html
                <p class="desc">Selecciona fecha y hora disponible directamente en el calendario de tu evaluador.</p>
                ${GOOGLE_CALENDAR_BOOKING_URL ? `
                    <iframe id="calendarFrame" src="${GOOGLE_CALENDAR_BOOKING_URL}"></iframe>
                ` : `
                    <div class="calendar-cta-box">
```

por:

```html
                <p class="desc">Elige el día y la hora en que vas a grabar tu sesión con tu usuario en la sala de Zoom de Paideia. Cada horario es para una sola persona.</p>
                <div id="agendaSala"><p class="desc">Cargando horarios…</p></div>
                <div id="agendaManual" hidden>
                ${GOOGLE_CALENDAR_BOOKING_URL ? `
                    <iframe id="calendarFrame" src="${GOOGLE_CALENDAR_BOOKING_URL}"></iframe>
                ` : `
                    <div class="calendar-cta-box">
```

y cerrar el `<div id="agendaManual">` justo después del `` `} `` que cierra el ternario (antes de `<div class="field-group" style="margin-top:16px;">`): agregar la línea `                </div>`. En el `<p>` "📌 La fecha que agendaste por WhatsApp o Google Calendar" agregar `id="hintFechaManual"`.

- [ ] **Step 3: Lógica.** Antes de `function attachFieldListeners() {` agregar:

```js
    /* Sala de evidencias (18 sep): con horarios en la plataforma, la fecha,
       el horario y el lugar salen del horario reservado (solo lectura). Sin
       SQL o sin horarios, vuelve el modo de antes (WhatsApp + fecha manual). */
    let agendaActiva = false, reservaSala = null;
    function aplicarReservaAlPlan(r) {
        reservaSala = r;
        const antes = JSON.stringify([planData.fechaEvaluacion, planData.horarioDesarrollo, planData.lugarDesarrollo]);
        if (r) {
            planData.fechaEvaluacion = r.fecha;
            planData.horarioDesarrollo = r.horario;
            planData.lugarDesarrollo = SalaEvidencias.LUGAR_SALA;
        } else if (planData.lugarDesarrollo === SalaEvidencias.LUGAR_SALA) {
            planData.fechaEvaluacion = '';
            planData.horarioDesarrollo = '';
            planData.lugarDesarrollo = 'Instalaciones del Centro Evaluador';
        }
        if (antes !== JSON.stringify([planData.fechaEvaluacion, planData.horarioDesarrollo, planData.lugarDesarrollo])) savePlanProgress();
        pintarCamposAgenda();
        updateGenerateButton();
    }
    function pintarCamposAgenda() {
        ['fechaEvaluacion', 'horarioDesarrollo', 'lugarDesarrollo'].forEach(k => {
            const el = document.getElementById('f_' + k);
            if (!el) return;
            el.value = planData[k] || '';
            el.readOnly = agendaActiva;
            el.title = agendaActiva ? 'Se llena al elegir tu horario en la sala de Zoom' : '';
        });
        const hint = document.getElementById('hintFechaManual');
        if (hint) hint.textContent = agendaActiva ? '📌 Se llena sola al elegir tu horario' : '📌 La fecha que agendaste por WhatsApp o Google Calendar';
    }
    async function montarAgenda() {
        const el = document.getElementById('agendaSala');
        if (!el) return;
        const r = await SalaEvidencias.agenda(el, { onCambio: aplicarReservaAlPlan });
        agendaActiva = r.activa;
        const manual = document.getElementById('agendaManual');
        if (manual) manual.hidden = r.activa;
        if (r.activa) aplicarReservaAlPlan(r.reserva); else { pintarCamposAgenda(); updateGenerateButton(); }
    }
```

En `render()`, en el bloque donde se llama `updateGenerateButton();` después de `FirmaCandidato.ofrecer(...)`, agregar en la línea siguiente `montarAgenda();` (sin `await`: la página no espera la red).

- [ ] **Step 4: Validación.** En `getValidationStatus()` cambiar `const fechaCompleta = !!planData.fechaEvaluacion;` por `const fechaCompleta = agendaActiva ? !!reservaSala : !!planData.fechaEvaluacion;`. En `getMissingFields()` cambiar `if (!status.fecha) missing.push('✓ Completar la fecha de tu evaluación');` por `if (!status.fecha) missing.push(agendaActiva ? '✓ Elegir tu horario en la sala de Zoom' : '✓ Completar la fecha de tu evaluación');`.

- [ ] **Step 5: Tarjeta de la sala en el resultado.** En `renderGeneratedState`, después de `pintarEstadoDocsAlineacion();` agregar:

```js
        const cajaExito = app.querySelector('.success-box');
        if (cajaExito) { cajaExito.insertAdjacentHTML('afterend', '<div style="margin-top:20px;" data-sala-tarjeta></div>'); SalaEvidencias.montar(app); }
```

- [ ] **Step 6: Verificar** (preview + stub de la Tarea 16, o cuenta demo): sin SQL → aparece el botón de WhatsApp y la fecha manual como hoy; con horarios → selector, reservar llena fecha/horario/lugar en solo lectura, "Generar" se habilita solo con reserva; el PDF del Plan muestra "En línea — Sala Zoom PAIDEIA · Grabación de evidencias". `node --test tests/*.test.js` pasa.

- [ ] **Step 7: Commit**

```bash
git add plan-evaluacion.html
git commit -m "Plan de Evaluación: agenda de la sala de Zoom; la fecha sale del horario reservado

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Tarjeta de la sala y aviso de plazo (Documentos de Sesión, Guion, Panel, Evidencias)

**Files:**
- Modify: `documentos-sesion.html` (script tag; `renderStep()` intro y prep)
- Modify: `guion-maestro.html` (script tag; `render()`)
- Modify: `panel.html` (script tag; `render()`)
- Modify: `evidencias.html` (script tag; `EVIDENCIAS_REQUERIDAS`; control; `updateGenerateButton`; PDF; WhatsApp; `render()`)

- [ ] **Step 1: Script tag** en las 4 páginas, después de `flow-status.js`: `<script src="sala-evidencias.js"></script>`.

- [ ] **Step 2: `documentos-sesion.html`.** Cambiar

```js
        if (step === 'intro') { app.innerHTML = renderIntro(); attachNav(); return; }
        if (step === 'prep') { app.innerHTML = renderPrep(); attachNav(); applyChecklistState(); return; }
```

por

```js
        if (step === 'intro') { app.innerHTML = renderIntro(); SalaEvidencias.montarDespuesDelHero(app); attachNav(); return; }
        if (step === 'prep') { app.innerHTML = renderPrep(); SalaEvidencias.montarDespuesDelHero(app); attachNav(); applyChecklistState(); return; }
```

- [ ] **Step 3: `guion-maestro.html`.** Después de `applyChecklistState();` (el que sigue a `renderGuionContent()`, ya con el botón de impresión de la Tarea 2) agregar `SalaEvidencias.montarDespuesDelHero(app);`. La tarjeta y el aviso quedan ocultos al imprimir (CSS de la Tarea 2).

- [ ] **Step 4: `panel.html`.** Reemplazar

```js
        const pintar = () => CrmShell.renderDashboard(app, {
            nombre: row && row.nombre ? row.nombre : 'candidato/a',
            steps: steps || [],
            row, fases, inscripciones, evaluacion,
            onRetryInscripciones: async () => { inscripciones = await cargarInscripciones(email); pintar(); }
        });
```

por

```js
        const pintar = () => {
            CrmShell.renderDashboard(app, {
                nombre: row && row.nombre ? row.nombre : 'candidato/a',
                steps: steps || [],
                row, fases, inscripciones, evaluacion,
                onRetryInscripciones: async () => { inscripciones = await cargarInscripciones(email); pintar(); }
            });
            /* Aviso de fecha límite de la evidencia (sala de Zoom, 18 sep). */
            app.insertAdjacentHTML('afterbegin', '<div data-sala-aviso></div>');
            SalaEvidencias.montar(app);
        };
```

- [ ] **Step 5: `evidencias.html` — fila de la grabación.** En `EVIDENCIAS_REQUERIDAS`, reemplazar la entrada `{ icon: '🔗', titulo: 'Liga al video completo (YouTube u otra plataforma)', … isLink: true },` por:

```js
        { icon: '🎥', titulo: 'Grabación de tu sesión', desc: 'Tu sesión se grabó en la sala de Zoom de Paideia. El equipo la guarda en tu expediente y la integra a tu portafolio: no tienes que subirla.', required: false, isGrabacion: true },
```

En el `map` del render, reemplazar `const control = e.isLink` y su rama por:

```js
                    const control = e.isGrabacion
                        ? `<div data-sala-grabacion style="margin-top:10px;"></div>
                           <details style="margin-top:10px;"${planData.videoLink ? ' open' : ''}><summary style="cursor:pointer;font-size:0.82rem;color:var(--text);">¿Grabaste fuera de la sala de Paideia? Pega aquí tu liga</summary>
                           <input type="text" id="f_videoLink" value="${escapeHtml(planData.videoLink)}" placeholder="https://youtube.com/..." oninput="updateVideoLink(this.value)" style="width:100%;margin-top:10px;padding:10px 12px;background:var(--dark);border:1px solid var(--border);border-radius:6px;color:var(--text-bright);font-size:0.85rem;"></details>`
```

(la rama `: \`<input type="file" …` se queda igual). La etiqueta: cambiar `${e.required ? '<span class="evidence-tag required">OBLIGATORIO</span>' : '<span class="evidence-tag" …>OPCIONAL</span>'}` por `${e.required ? '<span class="evidence-tag required">OBLIGATORIO</span>' : e.isGrabacion ? '<span class="evidence-tag" style="background:var(--surface-2);color:var(--text);">LA GUARDA EL EQUIPO</span>' : '<span class="evidence-tag" style="background:var(--surface-2);color:var(--text);">OPCIONAL</span>'}`.

- [ ] **Step 6: `evidencias.html` — ya no se exige la liga.** En `updateGenerateButton()` borrar las líneas `const hasVideoLink = …` y `if (!hasVideoLink) missing.push('liga a tu video de sesión');`. En el PDF (`['Liga al video:', planData.videoLink || 'No proporcionada']`) poner `['Grabación:', planData.videoLink || 'Sala de Zoom de Paideia (la integra el equipo)']`. En el mensaje de WhatsApp (`Liga al video: ${planData.videoLink || 'No proporcionada'}`) poner `Grabación: ${planData.videoLink || 'en la sala de Zoom de Paideia'}`. Cambiar el subtítulo del hero "Sube tu video y documentos de tu evaluación práctica" por "Sube tus documentos y las capturas de tu sesión".

- [ ] **Step 7: `evidencias.html` — montar.** Justo después del `app.innerHTML = \`…\`` del formulario (el que incluye "📤 Tus evidencias") agregar `SalaEvidencias.montarDespuesDelHero(app, { tarjeta: false });` (pinta el aviso y llena `[data-sala-grabacion]`).

- [ ] **Step 8: Verificar** con la cuenta demo o stub: Documentos de Sesión (intro y preparación) muestran aviso + tarjeta "abierta" con botón demo; Guion igual; Panel con aviso; Evidencias sin campo obligatorio de video, "Confirmar Entrega" se habilita sin liga. A 375 px sin desborde. `node --test tests/*.test.js` pasa.

- [ ] **Step 9: Commit**

```bash
git add documentos-sesion.html guion-maestro.html panel.html evidencias.html
git commit -m "Sala de evidencias: tarjeta en Documentos de Sesión y Guion, aviso de plazo; Evidencias ya no pide liga de YouTube

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---
### Task 8: La liga del video del portafolio sale de la grabación de Zoom

**Files:**
- Modify: `evaluacion.js:128-155` (y el objeto exportado ~línea 195)
- Modify: `portafolio.js:296`
- Modify: `admin-evaluacion.html:198`
- Modify: `tests/evaluacion.test.js`

- [ ] **Step 1: Pruebas que fallan** — en `tests/evaluacion.test.js`, en la prueba `'planPortafolio: distingue "no lo subió"…'` cambiar `assert.ok(p.avisos.some(a => /liga al video/.test(a)));` por `assert.ok(p.avisos.some(a => /grabación de Zoom/.test(a)));` y agregar al final:

```js
test('ligaVideo: la grabación de Zoom que ligó el equipo gana sobre la liga del candidato', () => {
    const ev = { video: { partes: [{ zoom: { share_url: 'https://zoom.us/rec/share/abc', clave: 'x1' } }] } };
    assert.equal(E.ligaVideo(ev, fila()), 'https://zoom.us/rec/share/abc (clave: x1)');
    const p = E.planPortafolio(fila(), ev);
    assert.equal(p.videoLink, 'https://zoom.us/rec/share/abc (clave: x1)');
});

test('ligaVideo: varias partes se enumeran; sin grabación usa la liga de Evidencias', () => {
    const ev = { video: { partes: [{ zoom: { share_url: 'https://zoom.us/rec/share/a' } }, { zoom: { share_url: 'https://zoom.us/rec/share/b' } }] } };
    assert.equal(E.ligaVideo(ev, null), 'Parte 1: https://zoom.us/rec/share/a  ·  Parte 2: https://zoom.us/rec/share/b');
    assert.equal(E.ligaVideo(null, fila()), 'https://youtu.be/x');
    assert.equal(E.ligaVideo({ video: { partes: [] } }, { evidencias_data: {} }), null);
});
```

- [ ] **Step 2: Correr.** `node --test tests/evaluacion.test.js` → FAIL (`E.ligaVideo is not a function`).

- [ ] **Step 3: Implementar** en `evaluacion.js`, antes de `function planPortafolio(row) {`:

```js
    /* Liga del video para el portafolio (18 sep): la grabación de la sala de
       Zoom que ligó el equipo (evaluaciones.video.partes); si no hay, la liga
       que el candidato pegó en Evidencias (grabaciones anteriores a la sala). */
    function ligaVideo(evaluacion, row) {
        var partes = evaluacion && evaluacion.video && Array.isArray(evaluacion.video.partes) ? evaluacion.video.partes : [];
        var ligas = partes.map(function (p, i) {
            var z = p && p.zoom;
            if (!z || !texto(z.share_url)) return null;
            return (partes.length > 1 ? 'Parte ' + (i + 1) + ': ' : '') + texto(z.share_url) + (texto(z.clave) ? ' (clave: ' + texto(z.clave) + ')' : '');
        }).filter(Boolean);
        if (ligas.length) return ligas.join('  ·  ');
        var ev = row && row.evidencias_data && typeof row.evidencias_data === 'object' ? row.evidencias_data : {};
        return texto(ev.planData && ev.planData.videoLink) || null;
    }
```

En `planPortafolio`: cambiar la firma a `function planPortafolio(row, evaluacion) {`; borrar la línea `var ev = row.evidencias_data && …;` y la de `var videoLink = texto(ev.planData && ev.planData.videoLink) || null;`, y en su lugar poner `var videoLink = ligaVideo(evaluacion, row);`. Cambiar el aviso a `if (!videoLink) avisos.push('Falta ligar la grabación de Zoom (Centro Evaluador → Grabación de la sesión)');`. Exportar `ligaVideo: ligaVideo` en el objeto `api`.

- [ ] **Step 4: Llamadas.** `portafolio.js:296`: `var plan = E.planPortafolio(ctx.row, ctx.evaluacion);`. `admin-evaluacion.html:198`: `const plan = E.planPortafolio(row || {}, ev);`.

- [ ] **Step 5: Correr.** `node --test tests/*.test.js` → PASS.

- [ ] **Step 6: Commit**

```bash
git add evaluacion.js portafolio.js admin-evaluacion.html tests/evaluacion.test.js
git commit -m "Portafolio: la liga del video es la grabación de Zoom ligada por el equipo

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9: `grabacion-zoom.js` — funciones puras de la copia (TDD)

**Files:**
- Create: `tests/grabacion-zoom.test.js`
- Create: `grabacion-zoom.js`

- [ ] **Step 1: Pruebas que fallan**

```js
// tests/grabacion-zoom.test.js — correr con: node --test tests/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../grabacion-zoom.js');
const MB = 1024 * 1024;

test('planTrozos: trozos de 32 MB, el último parcial; archivo vacío = sin trozos', () => {
    const t = G.planTrozos(100 * MB);
    assert.equal(t.length, 4);
    assert.deepEqual(t[0], { n: 1, desde: 0, hasta: 32 * MB - 1 });
    assert.deepEqual(t[3], { n: 4, desde: 96 * MB, hasta: 100 * MB - 1 });
    assert.deepEqual(G.planTrozos(0), []);
    assert.equal(G.TROZO, 32 * MB);
});

test('archivoPrincipal: prefiere pantalla + orador, luego el más grande', () => {
    const a = [
        { id: 'g', tipo: 'gallery_view', bytes: 900 },
        { id: 's', tipo: 'shared_screen_with_speaker_view', bytes: 500 },
        { id: 'x', tipo: 'raro', bytes: 9999 }
    ];
    assert.equal(G.archivoPrincipal(a).id, 's');
    assert.equal(G.archivoPrincipal([{ id: 'x', tipo: 'raro', bytes: 1 }, { id: 'y', tipo: 'otro', bytes: 5 }]).id, 'y');
    assert.equal(G.archivoPrincipal([]), null);
});

test('nombreGrabacion: fecha y hora de México; "_parteN" solo con varias partes', () => {
    assert.equal(G.nombreGrabacion('2026-09-25T16:00:00Z', 1, 1), 'Grabacion_Sesion_2026-09-25_1000.mp4');
    assert.equal(G.nombreGrabacion('2026-09-26T05:30:00Z', 2, 2), 'Grabacion_Sesion_2026-09-25_2330_parte2.mp4');
});

test('ventanaBusqueda: 15 min antes del inicio a 60 min después del fin', () => {
    assert.deepEqual(G.ventanaBusqueda({ inicio: '2026-09-25T16:00:00Z', fin: '2026-09-25T17:30:00Z' }),
        { desde: '2026-09-25T15:45:00.000Z', hasta: '2026-09-25T18:30:00.000Z' });
    assert.equal(G.ventanaBusqueda(null), null);
});

test('esIdSubida / nuevoIdSubida', () => {
    assert.equal(G.esIdSubida(G.nuevoIdSubida()), true);
    assert.equal(G.esIdSubida('../x'), false);
    assert.equal(G.esIdSubida('corto'), false);
});

test('puedeBorrarDeZoom: todas las partes en el NAS y certificado entregado', () => {
    const ok = { etapas: { entregado: { fecha: 'x' } }, video: { partes: [{ nas: { ruta: 'Portafolios/A/03-Evaluacion/g.mp4' } }] } };
    assert.equal(G.puedeBorrarDeZoom(ok), true);
    assert.equal(G.puedeBorrarDeZoom(Object.assign({}, ok, { etapas: {} })), false);
    assert.equal(G.puedeBorrarDeZoom({ etapas: ok.etapas, video: { partes: [{ nas: null }] } }), false);
    assert.equal(G.puedeBorrarDeZoom({ etapas: ok.etapas, video: { partes: [] } }), false);
});
```

- [ ] **Step 2: Correr.** `node --test tests/grabacion-zoom.test.js` → FAIL (módulo no existe).

- [ ] **Step 3: Implementar** — crear `grabacion-zoom.js` (la tarjeta de admin se agrega en la Tarea 12, antes de `var api`):

```js
/* =========================================================
   grabacion-zoom.js — Copia de la grabación de la sala de Zoom al NAS
   (18 sep 2026). Las funciones puras las usan también lib/zoom.js y
   api/subir-portafolio.js (mismo nombre de archivo, mismo tamaño de trozo).
   La tarjeta "Grabación de la sesión" de admin-evaluacion.html vive aquí.
   Spec: docs/superpowers/specs/2026-09-18-sala-evidencias-zoom-design.md
   Pruebas: tests/grabacion-zoom.test.js
========================================================= */
(function (root) {
    'use strict';

    var TZ = 'America/Mexico_City';
    /* 32 MB por trozo: Cloudflare (delante del NAS) corta en 100 MB, y cada
       llamada a la función queda muy por debajo de su tiempo máximo. */
    var TROZO = 32 * 1024 * 1024;
    var PREFERENCIA = ['shared_screen_with_speaker_view', 'shared_screen_with_gallery_view', 'active_speaker', 'gallery_view', 'shared_screen'];

    function planTrozos(bytes, tam) {
        tam = tam || TROZO;
        var out = [];
        for (var d = 0, n = 1; d < bytes; d += tam, n++) out.push({ n: n, desde: d, hasta: Math.min(d + tam, bytes) - 1 });
        return out;
    }
    function rango(tipo) { var i = PREFERENCIA.indexOf(tipo); return i < 0 ? PREFERENCIA.length : i; }
    function archivoPrincipal(archivos) {
        if (!archivos || !archivos.length) return null;
        return archivos.slice().sort(function (a, b) { return rango(a.tipo) - rango(b.tipo) || (b.bytes - a.bytes); })[0];
    }
    function nombreGrabacion(inicioISO, parte, partes) {
        var t = new Date(inicioISO);
        var f = t.toLocaleDateString('en-CA', { timeZone: TZ });
        var h = t.toLocaleTimeString('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).replace(':', '');
        return 'Grabacion_Sesion_' + f + '_' + h + (partes > 1 ? '_parte' + parte : '') + '.mp4';
    }
    function ventanaBusqueda(reserva) {
        if (!reserva || !reserva.inicio || !reserva.fin) return null;
        return { desde: new Date(Date.parse(reserva.inicio) - 15 * 60000).toISOString(), hasta: new Date(Date.parse(reserva.fin) + 60 * 60000).toISOString() };
    }
    function esIdSubida(s) { return typeof s === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(s); }
    function nuevoIdSubida() { return 'sala-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10); }
    function partesDe(ev) { return ev && ev.video && Array.isArray(ev.video.partes) ? ev.video.partes : []; }
    function puedeBorrarDeZoom(ev) {
        var p = partesDe(ev);
        return !!(ev && ev.etapas && ev.etapas.entregado) && p.length > 0 && p.every(function (x) { return !!(x && x.nas && x.nas.ruta); });
    }

    var api = {
        TROZO: TROZO, planTrozos: planTrozos, archivoPrincipal: archivoPrincipal, nombreGrabacion: nombreGrabacion,
        ventanaBusqueda: ventanaBusqueda, esIdSubida: esIdSubida, nuevoIdSubida: nuevoIdSubida,
        partesDe: partesDe, puedeBorrarDeZoom: puedeBorrarDeZoom
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.GrabacionZoom = api;
})(typeof window !== 'undefined' ? window : this);
```

- [ ] **Step 4: Correr.** `node --test tests/grabacion-zoom.test.js` → PASS (6).

- [ ] **Step 5: Commit**

```bash
git add grabacion-zoom.js tests/grabacion-zoom.test.js
git commit -m "Grabación de la sala: funciones puras de la copia Zoom → NAS

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---
### Task 10: `lib/nextcloud.js` y `lib/zoom.js` (TDD de los puros)

**Files:**
- Create: `lib/nextcloud.js` (mueve helpers de `api/subir-portafolio.js`)
- Create: `lib/zoom.js`
- Create: `tests/zoom-nextcloud.test.js`

`lib/` no cuenta contra el límite de 12 funciones de Vercel (ver CLAUDE.md). Carga por trozos de Nextcloud en formato **clásico** (sin `Destination` en MKCOL, sin tamaño mínimo): `MKCOL /remote.php/dav/uploads/<usuario>/<id>`, `PUT …/<id>/00001`, …, `MOVE …/<id>/.file` → destino.

- [ ] **Step 1: Pruebas que fallan**

```js
// tests/zoom-nextcloud.test.js — correr con: node --test tests/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const Nc = require('../lib/nextcloud.js');
const Z = require('../lib/zoom.js');

test('nextcloud: helpers movidos sin cambiar comportamiento', () => {
    assert.equal(Nc.normalizarNextcloudUrl('https://x.net/index.php/login/'), 'https://x.net');
    assert.equal(Nc.carpetaCandidato('José Ñúñez', 'ABCD900101HNLXXX09'), 'Jose_Nunez_ABCD900101HNLXXX09');
    assert.equal(Nc.carpetaCandidato('', ''), 'candidato_sin_identificar');
});

test('nextcloud: nombre de trozo ordenable y URL de archivo codificada', () => {
    assert.equal(Nc.nombreTrozo(1), '00001');
    assert.equal(Nc.nombreTrozo(123), '00123');
    const cx = { dav: 'https://nas/remote.php/dav', user: 'svc paideia', headers: {} };
    assert.equal(Nc.urlArchivo(cx, 'Portafolios/A B/03-Evaluacion/g.mp4'), 'https://nas/remote.php/dav/files/svc%20paideia/Portafolios/A%20B/03-Evaluacion/g.mp4');
    assert.equal(Nc.urlSubida(cx, 'sala-abc12345'), 'https://nas/remote.php/dav/uploads/svc%20paideia/sala-abc12345');
});

test('nextcloud: leerTamano del PROPFIND', () => {
    assert.equal(Nc.leerTamano('<d:multistatus><d:response><d:propstat><d:prop><d:getcontentlength>734003200</d:getcontentlength></d:prop></d:propstat></d:response></d:multistatus>'), 734003200);
    assert.equal(Nc.leerTamano('<x/>'), null);
});

test('zoom: uuid en la ruta (doble codificación si empieza con / o trae //)', () => {
    assert.equal(Z.uuidEnRuta('abc=='), 'abc%3D%3D');
    assert.equal(Z.uuidEnRuta('/abc=='), '%252Fabc%253D%253D');
    assert.equal(Z.uuidEnRuta('ab//c'), 'ab%252F%252Fc');
});

test('zoom: filtrarGrabaciones por ID de la sala y ventana; solo MP4 listos', () => {
    const meetings = [
        { id: 82757263451, uuid: 'u1', start_time: '2026-09-25T16:02:00Z', duration: 88, share_url: 'https://zoom.us/rec/share/a', recording_play_passcode: 'p1',
          recording_files: [
            { id: 'f1', file_type: 'MP4', file_size: 500, recording_type: 'shared_screen_with_speaker_view', status: 'completed' },
            { id: 'f2', file_type: 'M4A', file_size: 50, recording_type: 'audio_only', status: 'completed' }] },
        { id: 99999999999, uuid: 'otra', start_time: '2026-09-25T16:05:00Z', recording_files: [{ id: 'z', file_type: 'MP4', file_size: 5 }] },
        { id: 82757263451, uuid: 'u2', start_time: '2026-09-27T16:00:00Z', recording_files: [{ id: 'f3', file_type: 'MP4', file_size: 7 }] },
        { id: 82757263451, uuid: 'u3', start_time: '2026-09-25T16:50:00Z', recording_files: [{ id: 'f4', file_type: 'MP4', file_size: 9, status: 'processing' }] }
    ];
    const r = Z.filtrarGrabaciones(meetings, '827 5726 3451', Date.parse('2026-09-25T15:45:00Z'), Date.parse('2026-09-25T18:30:00Z'));
    assert.equal(r.length, 1);
    assert.equal(r[0].uuid, 'u1');
    assert.equal(r[0].clave, 'p1');
    assert.deepEqual(r[0].archivos.map(a => a.id), ['f1']);
});

test('zoom: validarTrozo', () => {
    const ok = { uuid: 'u1', fileId: 'f1', uploadId: 'sala-abc12345', n: 1, desde: 0, hasta: 32 * 1024 * 1024 - 1 };
    assert.equal(Z.validarTrozo(ok), null);
    assert.match(Z.validarTrozo(Object.assign({}, ok, { n: 0 })), /trozo/);
    assert.match(Z.validarTrozo(Object.assign({}, ok, { hasta: 32 * 1024 * 1024 })), /32 MB/);
    assert.match(Z.validarTrozo(Object.assign({}, ok, { uploadId: '../x' })), /subida/);
    assert.match(Z.validarTrozo(Object.assign({}, ok, { desde: 10, hasta: 5 })), /rango/);
});
```

- [ ] **Step 2: Correr.** `node --test tests/zoom-nextcloud.test.js` → FAIL (módulos no existen).

- [ ] **Step 3: Crear `lib/nextcloud.js`**

```js
/* lib/nextcloud.js — WebDAV del NAS (Nextcloud de Humberto, detrás de
   Cloudflare Tunnel + Access). Movido de api/subir-portafolio.js el 18 sep
   para compartirlo con la copia de grabaciones de Zoom. Fuera de api/ a
   propósito: no cuenta contra el límite de 12 funciones de Vercel. */

function normalizarNextcloudUrl(url) {
    let normalized = (url || '').trim().replace(/\/+$/, '');
    normalized = normalized.replace(/\/index\.php\/login$/i, '').replace(/\/login$/i, '');
    return normalized;
}
function slugify(text) {
    return (text || '')
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-zA-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
}
function carpetaCandidato(nombre, curp) {
    const partes = [slugify(nombre), slugify(curp)].filter(Boolean);
    return partes.join('_') || 'candidato_sin_identificar';
}
function cloudflareAccessHeaders() {
    const clientId = process.env.CF_ACCESS_CLIENT_ID;
    const clientSecret = process.env.CF_ACCESS_CLIENT_SECRET;
    if (!clientId || !clientSecret) return {};
    return { 'CF-Access-Client-Id': clientId, 'CF-Access-Client-Secret': clientSecret };
}
async function ensureFolder(baseWebdavUrl, baseHeaders, folderPath) {
    const partes = folderPath.split('/').filter(Boolean);
    let acumulado = '';
    for (const parte of partes) {
        acumulado += `/${encodeURIComponent(parte)}`;
        const resp = await fetch(`${baseWebdavUrl}${acumulado}`, { method: 'MKCOL', headers: baseHeaders });
        // 201 = creada. 405 = ya existía. Cualquier otra cosa es un error real.
        if (resp.status !== 201 && resp.status !== 405) {
            throw new Error(`No se pudo crear la carpeta ${acumulado} (status ${resp.status})`);
        }
    }
}

/* Conexión desde las variables de entorno, o null si faltan. */
function conexion() {
    const url = normalizarNextcloudUrl(process.env.NEXTCLOUD_URL);
    const user = process.env.NEXTCLOUD_USERNAME, pass = process.env.NEXTCLOUD_APP_PASSWORD;
    if (!url || !user || !pass) return null;
    return { dav: `${url}/remote.php/dav`, user, headers: { Authorization: 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64'), ...cloudflareAccessHeaders() } };
}
function baseArchivos(cx) { return `${cx.dav}/files/${encodeURIComponent(cx.user)}`; }
function urlArchivo(cx, ruta) { return `${baseArchivos(cx)}/${ruta.split('/').map(encodeURIComponent).join('/')}`; }
function urlSubida(cx, uploadId) { return `${cx.dav}/uploads/${encodeURIComponent(cx.user)}/${uploadId}`; }
function nombreTrozo(n) { return String(n).padStart(5, '0'); }
function leerTamano(xml) { const m = /<[a-z]*:?getcontentlength>(\d+)</i.exec(xml || ''); return m ? Number(m[1]) : null; }

/* Un trozo de la carga por trozos (formato clásico). Reintenta ante
   423/429/5xx/sin respuesta, igual que la subida normal. */
async function subirTrozo(cx, uploadId, n, buffer) {
    const dir = urlSubida(cx, uploadId);
    if (n === 1) {
        const m = await fetch(dir, { method: 'MKCOL', headers: cx.headers, signal: AbortSignal.timeout(30000) });
        if (m.status !== 201 && m.status !== 405) throw Object.assign(new Error(`El NAS no abrió la carga por trozos (status ${m.status})`), { status: 502 });
    }
    let st = 0;
    for (let intento = 1; intento <= 3; intento++) {
        try {
            const r = await fetch(`${dir}/${nombreTrozo(n)}`, { method: 'PUT', headers: { ...cx.headers, 'Content-Type': 'application/octet-stream' }, body: buffer, signal: AbortSignal.timeout(180000) });
            st = r.status;
        } catch (e) { st = 0; }
        if (st === 201 || st === 204) return;
        if (!(st === 0 || st === 423 || st === 429 || st >= 500) || intento === 3) break;
        await new Promise(r => setTimeout(r, 1500 * intento));
    }
    throw Object.assign(new Error(`El NAS rechazó el trozo ${n} (status ${st || 'sin respuesta'})`), { status: 502 });
}

/* Arma el archivo final. Cloudflare corta a los ~100 s aunque el NAS siga
   armando un archivo grande: en ese caso regresa { pendiente: true } y el
   equipo verifica después con tamano(). */
async function ensamblar(cx, uploadId, ruta) {
    let st = 0;
    try {
        const r = await fetch(`${urlSubida(cx, uploadId)}/.file`, { method: 'MOVE', headers: { ...cx.headers, Destination: urlArchivo(cx, ruta), Overwrite: 'T' }, signal: AbortSignal.timeout(250000) });
        st = r.status;
    } catch (e) { st = 0; }
    if (st === 201 || st === 204) return { pendiente: false };
    if (st === 0 || st === 502 || st === 504 || st === 524) return { pendiente: true };
    throw Object.assign(new Error(`El NAS no pudo armar el archivo (status ${st})`), { status: 502 });
}
async function tamano(cx, ruta) {
    const r = await fetch(urlArchivo(cx, ruta), {
        method: 'PROPFIND', headers: { ...cx.headers, Depth: '0', 'Content-Type': 'application/xml' },
        body: '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:getcontentlength/></d:prop></d:propfind>',
        signal: AbortSignal.timeout(30000)
    });
    if (r.status === 404) return null;
    if (r.status !== 207) throw Object.assign(new Error(`El NAS respondió ${r.status} al consultar el archivo`), { status: 502 });
    return leerTamano(await r.text());
}

module.exports = {
    normalizarNextcloudUrl, slugify, carpetaCandidato, cloudflareAccessHeaders, ensureFolder,
    conexion, baseArchivos, urlArchivo, urlSubida, nombreTrozo, leerTamano, subirTrozo, ensamblar, tamano
};
```

- [ ] **Step 4: Crear `lib/zoom.js`**

```js
/* lib/zoom.js — API de Zoom (app Server-to-Server OAuth) para la sala de
   evidencias (18 sep). Solo lee grabaciones y las manda a la papelera.
   Variables: ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET.
   Guía: docs/guias/2026-09-18-zoom-sala-evidencias.md */
const GZ = require('../grabacion-zoom.js');
const API = 'https://api.zoom.us/v2';
let cache = null;

function error(msg, status) { return Object.assign(new Error(msg), { status: status || 502 }); }
function soloDigitos(s) { return String(s === undefined || s === null ? '' : s).replace(/\D/g, ''); }
function uuidEnRuta(uuid) {
    const u = String(uuid);
    return (u.charAt(0) === '/' || u.indexOf('//') >= 0) ? encodeURIComponent(encodeURIComponent(u)) : encodeURIComponent(u);
}

async function token() {
    const id = process.env.ZOOM_ACCOUNT_ID, cid = process.env.ZOOM_CLIENT_ID, sec = process.env.ZOOM_CLIENT_SECRET;
    if (!id || !cid || !sec) throw error('Zoom no está configurado (faltan ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID o ZOOM_CLIENT_SECRET en Vercel)', 500);
    if (cache && cache.vence > Date.now() + 60000) return cache.token;
    const r = await fetch('https://zoom.us/oauth/token?grant_type=account_credentials&account_id=' + encodeURIComponent(id), {
        method: 'POST', headers: { Authorization: 'Basic ' + Buffer.from(cid + ':' + sec).toString('base64') }, signal: AbortSignal.timeout(20000)
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.access_token) throw error('Zoom rechazó las credenciales (' + r.status + ')');
    cache = { token: j.access_token, vence: Date.now() + (Number(j.expires_in) || 3600) * 1000 };
    return cache.token;
}
async function get(ruta) {
    const r = await fetch(API + ruta, { headers: { Authorization: 'Bearer ' + await token() }, signal: AbortSignal.timeout(20000) });
    if (r.status === 404) throw error('Zoom no encontró ' + ruta.split('?')[0], 404);
    if (!r.ok) throw error('Zoom respondió ' + r.status + ' en ' + ruta.split('?')[0]);
    return r.json();
}

/* Solo la sala (por ID), dentro de [desdeMs, hastaMs], y de cada
   grabación solo los MP4 ya procesados. */
function filtrarGrabaciones(meetings, zoomId, desdeMs, hastaMs) {
    const id = soloDigitos(zoomId);
    return (meetings || []).filter(m => soloDigitos(m.id) === id).map(m => ({
        uuid: m.uuid, inicio: m.start_time, duracion: Number(m.duration) || 0,
        share_url: m.share_url || null, clave: m.recording_play_passcode || m.password || '',
        archivos: (m.recording_files || [])
            .filter(f => f.file_type === 'MP4' && f.status !== 'processing' && Number(f.file_size) > 0)
            .map(f => ({ id: f.id, bytes: Number(f.file_size), tipo: f.recording_type || '', inicio: f.recording_start || m.start_time, fin: f.recording_end || null }))
    })).filter(m => { const t = Date.parse(m.inicio); return t >= desdeMs && t <= hastaMs && m.archivos.length; })
      .sort((a, b) => Date.parse(a.inicio) - Date.parse(b.inicio));
}

/* Las grabaciones de una reunión recurrente comparten ID; se listan las del
   anfitrión de la sala en el rango y se filtran por ID. */
async function buscar(zoomId, desdeISO, hastaISO) {
    const reunion = await get('/meetings/' + soloDigitos(zoomId));
    const desde = Date.parse(desdeISO), hasta = Date.parse(hastaISO);
    const from = new Date(desde - 86400000).toISOString().slice(0, 10), to = new Date(hasta + 86400000).toISOString().slice(0, 10);
    let todas = [], next = '';
    for (let i = 0; i < 10; i++) {
        const j = await get('/users/' + encodeURIComponent(reunion.host_id) + '/recordings?page_size=300&from=' + from + '&to=' + to + (next ? '&next_page_token=' + encodeURIComponent(next) : ''));
        todas = todas.concat(j.meetings || []);
        next = j.next_page_token || '';
        if (!next) break;
    }
    return filtrarGrabaciones(todas, zoomId, desde, hasta);
}

function validarTrozo(b) {
    if (!b || typeof b.uuid !== 'string' || !b.uuid || b.uuid.length > 200) return 'Falta la grabación (uuid)';
    if (typeof b.fileId !== 'string' || !b.fileId || b.fileId.length > 200) return 'Falta el archivo (fileId)';
    if (!GZ.esIdSubida(b.uploadId)) return 'Identificador de subida inválido';
    if (!Number.isInteger(b.n) || b.n < 1 || b.n > 10000) return 'Número de trozo inválido';
    if (!Number.isInteger(b.desde) || !Number.isInteger(b.hasta) || b.desde < 0 || b.hasta < b.desde) return 'Rango inválido';
    if (b.hasta - b.desde + 1 > GZ.TROZO) return 'Cada trozo es de 32 MB como máximo';
    return null;
}

/* Un rango del MP4. El download_url se pide cada vez (caduca). */
async function trozo(uuid, fileId, desde, hasta) {
    const j = await get('/meetings/' + uuidEnRuta(uuid) + '/recordings');
    const f = (j.recording_files || []).find(x => x.id === fileId);
    if (!f || !f.download_url) throw error('Ese archivo ya no está en Zoom', 404);
    const total = Number(f.file_size);
    if (desde >= total) throw error('Rango fuera del archivo', 416);
    const fin = Math.min(hasta, total - 1);
    const r = await fetch(f.download_url, { headers: { Authorization: 'Bearer ' + await token(), Range: `bytes=${desde}-${fin}` }, redirect: 'follow', signal: AbortSignal.timeout(120000) });
    if (r.status === 200 && !(desde === 0 && fin === total - 1)) {
        try { await r.body.cancel(); } catch (e) { /* nada */ }
        throw error('Zoom no respetó el rango pedido');
    }
    if (r.status !== 206 && r.status !== 200) throw error('Zoom respondió ' + r.status + ' al descargar');
    const buffer = Buffer.from(await r.arrayBuffer());
    if (buffer.length !== fin - desde + 1) throw error('Trozo incompleto desde Zoom (' + buffer.length + ' bytes)');
    return { buffer, total };
}

async function aPapelera(uuid) {
    const r = await fetch(API + '/meetings/' + uuidEnRuta(uuid) + '/recordings?action=trash', { method: 'DELETE', headers: { Authorization: 'Bearer ' + await token() }, signal: AbortSignal.timeout(20000) });
    if (r.status !== 204 && r.status !== 200) throw error('Zoom respondió ' + r.status + ' al borrar');
}

module.exports = { uuidEnRuta, filtrarGrabaciones, buscar, validarTrozo, trozo, aPapelera, soloDigitos };
```

- [ ] **Step 5: Correr.** `node --test tests/zoom-nextcloud.test.js` → PASS (6).

- [ ] **Step 6: Commit**

```bash
git add lib/nextcloud.js lib/zoom.js tests/zoom-nextcloud.test.js
git commit -m "lib: WebDAV del NAS con carga por trozos y API de Zoom para grabaciones

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---
### Task 11: Acciones de Zoom en `api/subir-portafolio.js`

**Files:**
- Modify: `api/subir-portafolio.js`
- Modify: `tests/subir-portafolio.test.js`

- [ ] **Step 1: Pruebas que fallan** — agregar a `tests/subir-portafolio.test.js`:

```js
test('POST con accion: sin token responde 401 antes de tocar Zoom o el NAS', async () => {
    for (const accion of ['zoom-buscar', 'zoom-trozo', 'zoom-cerrar', 'zoom-borrar']) {
        const res = resFalsa();
        await handler({ method: 'POST', body: { accion }, headers: {} }, res);
        assert.equal(res.code, 401, accion);
    }
});

test('validarCierre: nombre de archivo y carpeta los arma el servidor', () => {
    const ok = { uploadId: 'sala-abc12345', nombre: 'Ana Demo', curp: 'ABCD900101MNLXXX01', inicio: '2026-09-25T16:00:00Z', parte: 1, partes: 1, bytes: 1000 };
    assert.equal(handler._validarCierre(ok), null);
    assert.match(handler._validarCierre(Object.assign({}, ok, { bytes: 0 })), /tamaño/);
    assert.match(handler._validarCierre(Object.assign({}, ok, { parte: 3, partes: 2 })), /parte/);
    assert.match(handler._validarCierre(Object.assign({}, ok, { inicio: 'x' })), /inicio/);
    assert.equal(handler._rutaGrabacion(ok), 'Portafolios/Ana_Demo_ABCD900101MNLXXX01/03-Evaluacion/Grabacion_Sesion_2026-09-25_1000.mp4');
});
```

- [ ] **Step 2: Correr.** `node --test tests/subir-portafolio.test.js` → FAIL (401 no se cumple: hoy responde 400 "Faltan campos"; `_validarCierre` no existe).

- [ ] **Step 3: Mover helpers a `lib/nextcloud.js`.** En `api/subir-portafolio.js` borrar las definiciones locales de `normalizarNextcloudUrl`, `slugify`, `carpetaCandidato`, `cloudflareAccessHeaders` y `ensureFolder`, y arriba agregar:

```js
const Nc = require('../lib/nextcloud.js');
const Zoom = require('../lib/zoom.js');
const GZ = require('../grabacion-zoom.js');
const { normalizarNextcloudUrl, slugify, carpetaCandidato, cloudflareAccessHeaders, ensureFolder } = Nc;
```

(el resto del archivo sigue llamándolas igual; los `handler._…` del final siguen exportando las mismas funciones).

- [ ] **Step 4: Acciones.** Antes de `async function handler(req, res) {` agregar:

```js
/* ---- Sala de evidencias (18 sep): grabación de Zoom → NAS -------------
   POST { accion, … } con la sesión del equipo (admin o evaluador). El
   archivo nunca pasa por el navegador: el servidor pide cada rango a Zoom
   y lo sube a la carga por trozos de Nextcloud. Ver lib/zoom.js. */
function esIsoFecha(s) { return typeof s === 'string' && !isNaN(Date.parse(s)); }
function validarCierre(b) {
    if (!b || !GZ.esIdSubida(b.uploadId)) return 'Identificador de subida inválido';
    if (typeof b.nombre !== 'string' || typeof b.curp !== 'string' || !(b.nombre.trim() || b.curp.trim())) return 'Faltan nombre y CURP del candidato';
    if (!esIsoFecha(b.inicio)) return 'Fecha de inicio inválida';
    if (!Number.isInteger(b.partes) || b.partes < 1 || b.partes > 20 || !Number.isInteger(b.parte) || b.parte < 1 || b.parte > b.partes) return 'Número de parte inválido';
    if (!Number.isInteger(b.bytes) || b.bytes < 1) return 'Falta el tamaño esperado';
    return null;
}
function rutaGrabacion(b) {
    return `Portafolios/${carpetaCandidato(b.nombre, b.curp)}/03-Evaluacion/${GZ.nombreGrabacion(b.inicio, b.parte, b.partes)}`;
}

async function handleZoom(req, res) {
    const b = req.body || {};
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) return res.status(401).json({ success: false, error: 'Falta el token de sesión' });
    const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data: u, error: ue } = await anon.auth.getUser(token);
    if (ue || !u || !u.user) return res.status(401).json({ success: false, error: 'Sesión inválida o expirada' });
    if (!(await esDelEquipo(token, u.user.email))) return res.status(403).json({ success: false, error: 'Solo el equipo evaluador' });
    const conSesion = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: 'Bearer ' + token } } });

    if (b.accion === 'zoom-buscar') {
        if (!esIsoFecha(b.desde) || !esIsoFecha(b.hasta) || Date.parse(b.hasta) < Date.parse(b.desde) || Date.parse(b.hasta) - Date.parse(b.desde) > 31 * 86400000) {
            return res.status(400).json({ success: false, error: 'Rango de búsqueda inválido (máximo 31 días)' });
        }
        const cfg = await conSesion.from('sala_evidencias_config').select('zoom_id').eq('id', 1).maybeSingle();
        if (cfg.error || !cfg.data || !cfg.data.zoom_id) return res.status(400).json({ success: false, error: 'Falta el ID de la sala en Sesiones → Sala de evidencias' });
        const grabaciones = await Zoom.buscar(cfg.data.zoom_id, b.desde, b.hasta);
        return res.status(200).json({ success: true, grabaciones });
    }
    const cx = Nc.conexion();
    if (!cx) return res.status(500).json({ success: false, error: 'Almacenamiento no configurado' });

    if (b.accion === 'zoom-trozo') {
        const malo = Zoom.validarTrozo(b);
        if (malo) return res.status(400).json({ success: false, error: malo });
        const t = await Zoom.trozo(b.uuid, b.fileId, b.desde, b.hasta);
        await Nc.subirTrozo(cx, b.uploadId, b.n, t.buffer);
        return res.status(200).json({ success: true, bytes: t.buffer.length, total: t.total });
    }
    if (b.accion === 'zoom-cerrar') {
        const malo = validarCierre(b);
        if (malo) return res.status(400).json({ success: false, error: malo });
        const ruta = rutaGrabacion(b);
        await ensureFolder(Nc.baseArchivos(cx), cx.headers, ruta.split('/').slice(0, -1).join('/'));
        let tam = await Nc.tamano(cx, ruta);
        if (tam !== b.bytes && !b.soloVerificar) {
            const mv = await Nc.ensamblar(cx, b.uploadId, ruta);
            if (mv.pendiente) return res.status(202).json({ success: false, pendiente: true, ruta });
            tam = await Nc.tamano(cx, ruta);
        }
        if (tam === null && b.soloVerificar) return res.status(202).json({ success: false, pendiente: true, ruta });
        if (tam !== b.bytes) return res.status(502).json({ success: false, error: `El NAS tiene ${tam === null ? 'ningún' : tam} bytes y Zoom ${b.bytes}. Vuelve a copiar.` });
        return res.status(200).json({ success: true, ruta, bytes: tam });
    }
    if (b.accion === 'zoom-borrar') {
        if (typeof b.uuid !== 'string' || !b.uuid || typeof b.email !== 'string') return res.status(400).json({ success: false, error: 'Faltan grabación o candidato' });
        const ev = await conSesion.from('evaluaciones').select('etapas,video').eq('email', b.email.toLowerCase()).maybeSingle();
        const e = ev.data || {};
        const parte = GZ.partesDe(e).find(p => p && p.zoom && p.zoom.uuid === b.uuid);
        if (!(e.etapas && e.etapas.entregado)) return res.status(409).json({ success: false, error: 'Solo se borra de Zoom después de entregar el certificado' });
        if (!parte || !parte.nas || !parte.nas.ruta) return res.status(409).json({ success: false, error: 'Primero copia esa grabación al NAS' });
        await Zoom.aPapelera(b.uuid);
        return res.status(200).json({ success: true });
    }
    return res.status(400).json({ success: false, error: 'Acción desconocida' });
}
```

- [ ] **Step 5: Enrutar.** En `handler`, justo después de `if (req.method !== 'POST') { … }`, agregar:

```js
    if (req.body && typeof req.body.accion === 'string') {
        try { return await handleZoom(req, res); }
        catch (e) {
            console.error('subir-portafolio zoom:', req.body.accion, e);
            return res.status(e.status || 500).json({ success: false, error: e.message || 'Error interno' });
        }
    }
```

Al final del archivo, junto a los otros `handler._…`, agregar `handler._validarCierre = validarCierre;` y `handler._rutaGrabacion = rutaGrabacion;`.

- [ ] **Step 6: Límite de funciones.** Run: `find api -name "*.js" | wc -l` → Expected: `12` (no cambió).

- [ ] **Step 7: Correr.** `node --test tests/*.test.js` → PASS.

- [ ] **Step 8: Commit**

```bash
git add api/subir-portafolio.js tests/subir-portafolio.test.js
git commit -m "subir-portafolio: acciones del equipo para copiar la grabación de Zoom al NAS por trozos

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---
### Task 12: Tarjeta "Grabación de la sesión" en `admin-evaluacion.html`

**Files:**
- Modify: `grabacion-zoom.js` (agregar antes de `var api = {` y exportar `montarTarjeta`, `copiarParte`)
- Modify: `admin-evaluacion.html` (scripts; `render()`; al final de `render()`)

- [ ] **Step 1: Copia orquestada y tarjeta.** En `grabacion-zoom.js`, antes de `var api = {`:

```js
    /* ---------- navegador (equipo) ---------- */
    function esperar(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
    async function llamar(token, body) {
        var r = await fetch('/api/subir-portafolio', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify(body) });
        var j = await r.json().catch(function () { return { success: false, error: 'Respuesta inválida (' + r.status + ')' }; });
        if (!j.success && !j.pendiente) throw new Error(j.error || ('Error ' + r.status));
        return j;
    }

    /* Copia UNA parte Zoom → NAS. Reanuda desde migracion.trozos_ok (se
       guarda después de cada trozo). o = { token(), parte, indice, total,
       nombre, curp, onProgreso(txt), guardarMigracion(mig) } */
    async function copiarParte(o) {
        var z = o.parte.zoom, trozos = planTrozos(z.bytes), et = 'Parte ' + (o.indice + 1) + ': ';
        var m0 = o.parte.migracion;
        var mig = m0 && esIdSubida(m0.upload_id) && m0.total === trozos.length ? m0 : { upload_id: nuevoIdSubida(), trozos_ok: 0, total: trozos.length };
        for (var i = mig.trozos_ok; i < trozos.length; i++) {
            var t = trozos[i], ok = false, ultimo = null;
            for (var intento = 1; intento <= 3 && !ok; intento++) {
                try { await llamar(await o.token(), { accion: 'zoom-trozo', uuid: z.uuid, fileId: z.file_id, uploadId: mig.upload_id, n: t.n, desde: t.desde, hasta: t.hasta }); ok = true; }
                catch (e) { ultimo = e; await esperar(2000 * intento); }
            }
            if (!ok) throw new Error(et + 'se detuvo en el trozo ' + t.n + ' de ' + trozos.length + ' (' + (ultimo && ultimo.message) + '). Vuelve a oprimir el botón: continúa donde se quedó.');
            mig = { upload_id: mig.upload_id, trozos_ok: t.n, total: trozos.length };
            await o.guardarMigracion(mig);
            o.onProgreso(et + Math.round(100 * (t.hasta + 1) / z.bytes) + ' % (trozo ' + t.n + ' de ' + trozos.length + ')');
        }
        o.onProgreso(et + 'armando el archivo en el NAS…');
        var cuerpo = { accion: 'zoom-cerrar', uploadId: mig.upload_id, nombre: o.nombre, curp: o.curp, inicio: z.inicio, parte: o.indice + 1, partes: o.total, bytes: z.bytes };
        var r = await llamar(await o.token(), cuerpo);
        for (var k = 0; r.pendiente && k < 40; k++) {
            o.onProgreso(et + 'el NAS sigue armando el archivo (puede tardar unos minutos)…');
            await esperar(15000);
            r = await llamar(await o.token(), Object.assign({}, cuerpo, { soloVerificar: true }));
        }
        if (r.pendiente) throw new Error(et + 'el NAS no terminó de armar el archivo. Vuelve a oprimir el botón en unos minutos.');
        return { ruta: r.ruta, bytes: r.bytes };
    }

    function mb(b) { return (b / 1048576).toFixed(0) + ' MB'; }
    function aLocalMx(iso) { var S = root.SalaEvidencias; return S.fechaISO(Date.parse(iso)) + 'T' + S.hora(iso); }
    function deLocalMx(v) { var p = String(v || '').split('T'); return p.length === 2 ? root.SalaEvidencias.mxAIso(p[0], p[1].slice(0, 5)) : null; }

    /* ctx = { email, row, ev: () => evaluacion actual, guardar(cambios) → Promise<bool>,
               token: async () => access_token, yo, faltaSql } */
    async function montarTarjeta(el, ctx) {
        if (!el) return;
        var S = root.SalaEvidencias, esc = S._esc, sb = root.supabaseClient;
        var st = { reserva: null, limite: null, error: '', resultados: null, prog: '', ocupado: false };
        var pd = (ctx.row && ctx.row.autodiagnostico_data && ctx.row.autodiagnostico_data.personalData) || {};
        var nombre = pd.nombre || (ctx.row && ctx.row.nombre) || '', curp = pd.curp || (ctx.row && ctx.row.curp) || '';
        try {
            var r = await Promise.all([
                sb.from('reservas_evidencia').select('id,estado,created_at,horarios_evidencia(inicio,fin)').eq('email', ctx.email).neq('estado', 'cancelada').order('created_at', { ascending: false }).limit(1),
                sb.rpc('limite_evidencia_para', { p_email: ctx.email })
            ]);
            if (r[0].error) st.error = 'Para la sala de evidencias hay que correr 2026-09-18-sala-evidencias.sql (' + (r[0].error.message || r[0].error) + ')';
            var x = (r[0].data || [])[0];
            st.reserva = x && x.horarios_evidencia ? { estado: x.estado, inicio: x.horarios_evidencia.inicio, fin: x.horarios_evidencia.fin } : null;
            st.limite = r[1].error ? null : r[1].data;
        } catch (e) { st.error = String(e.message || e); }

        function partes() { return partesDe(ctx.ev()); }
        async function guardarPartes(lista, extra) {
            var v = Object.assign({}, (ctx.ev() && ctx.ev().video) || {}, { partes: lista }, extra || {});
            return ctx.guardar({ video: v });
        }
        function html() {
            var ev = ctx.ev() || {}, ps = partes(), v = ventanaBusqueda(st.reserva);
            var h = st.error ? '<div class="crm-note">' + esc(st.error) + '</div>' : '';
            h += '<p><strong>Horario en la sala:</strong> ' + (st.reserva ? esc(S.fechaLarga(st.reserva.inicio)) + ' · ' + esc(S.horarioTexto(st.reserva.inicio, st.reserva.fin)) + ' <span class="crm-chip">' + esc(st.reserva.estado) + '</span>' : '<span class="crm-muted">sin horario</span>') + '</p>';
            h += '<p><strong>Fecha límite de evidencia:</strong> ' + (st.limite ? esc(S.fechaLarga(st.limite)) + (ev.limite_evidencia ? ' <span class="crm-chip info">extendida</span>' : '') : '<span class="crm-muted">— (Alineación sin pagar)</span>') + '</p>';
            h += '<div class="ev-acciones"><input type="date" id="gzLimite" value="' + esc(ev.limite_evidencia || '') + '" aria-label="Nueva fecha límite">' +
                 '<button type="button" class="crm-btn crm-btn-sm crm-btn-primary" id="gzGuardarLimite"' + (ctx.faltaSql ? ' disabled' : '') + '>Extender fecha límite</button>' +
                 (ev.limite_evidencia ? '<button type="button" class="crm-btn crm-btn-sm crm-btn-ghost" id="gzQuitarLimite">Quitar extensión</button>' : '') + '</div>';
            h += '<h3 style="margin:14px 0 6px;font-size:.95rem;">Grabación ligada</h3>';
            if (!ps.length) h += '<p class="crm-muted">Todavía no se liga ninguna grabación. Búscala abajo.</p>';
            ps.forEach(function (p, i) {
                var z = p.zoom || {};
                var estado = p.nas && p.nas.ruta ? '<span class="crm-chip ok">En el NAS</span> <span class="crm-muted" style="word-break:break-all;">' + esc(p.nas.ruta) + '</span>'
                    : p.migracion ? '<span class="crm-chip">Copiado ' + p.migracion.trozos_ok + ' de ' + p.migracion.total + '</span>' : '<span class="crm-chip">Solo en Zoom</span>';
                h += '<div class="ev-etapa"><div class="nombre"><strong>Parte ' + (i + 1) + '</strong> · ' + esc(S.fechaCorta(z.inicio)) + ' ' + esc(S.hora(z.inicio)) + ' h · ' + mb(z.bytes || 0) +
                     (z.share_url ? ' · <a href="' + esc(z.share_url) + '" target="_blank" rel="noopener">ver en Zoom</a>' : '') + '<div>' + estado + '</div></div>' +
                     '<div class="acciones">' + (p.nas && p.nas.ruta ? '' : '<button type="button" class="crm-btn crm-btn-sm crm-btn-primary" data-gz-copiar="' + i + '"' + (st.ocupado ? ' disabled' : '') + '>' + (p.migracion ? 'Continuar copia' : 'Copiar al expediente (NAS)') + '</button>') + '</div></div>';
            });
            if (ps.length) {
                var puede = puedeBorrarDeZoom(ev);
                h += '<div class="ev-acciones"><button type="button" class="crm-btn crm-btn-sm crm-btn-danger" id="gzBorrar"' + (puede && !st.ocupado ? '' : ' disabled') + ' title="' + (puede ? '' : 'Se habilita con todas las partes en el NAS y el certificado entregado') + '">Borrar de Zoom</button>' +
                     (ev.video && ev.video.borrada_zoom ? '<span class="crm-chip">Borrada de Zoom ' + esc(S.fechaCorta(ev.video.borrada_zoom.fecha)) + '</span>' : '') + '</div>';
            }
            h += '<div class="ev-progreso" id="gzProg" role="status">' + esc(st.prog) + '</div>';
            h += '<h3 style="margin:14px 0 6px;font-size:.95rem;">Buscar en Zoom</h3><div class="ev-acciones">' +
                 '<label>Desde <input type="datetime-local" id="gzDesde" value="' + esc(v ? aLocalMx(v.desde) : '') + '"></label>' +
                 '<label>Hasta <input type="datetime-local" id="gzHasta" value="' + esc(v ? aLocalMx(v.hasta) : '') + '"></label>' +
                 '<button type="button" class="crm-btn crm-btn-sm crm-btn-primary" id="gzBuscar"' + (st.ocupado ? ' disabled' : '') + '>Buscar grabación en Zoom</button></div>';
            if (st.resultados) {
                h += st.resultados.length ? '<ul class="ev-items">' + st.resultados.map(function (g, i) {
                    var a = archivoPrincipal(g.archivos);
                    return '<li><label><input type="checkbox" data-gz-sel="' + i + '"> ' + esc(S.fechaCorta(g.inicio)) + ' ' + esc(S.hora(g.inicio)) + ' h · ' + g.duracion + ' min · ' + mb(a.bytes) + ' · ' + esc(a.tipo) + '</label></li>';
                }).join('') + '</ul><button type="button" class="crm-btn crm-btn-sm crm-btn-primary" id="gzLigar">Ligar seleccionadas</button>'
                    : '<p class="crm-muted">No hay grabaciones de la sala en ese rango (Zoom tarda unos minutos en procesarlas).</p>';
            }
            return h;
        }
        function prog(t) { st.prog = t; var p = el.querySelector('#gzProg'); if (p) p.textContent = t; }
        function pintar() { el.innerHTML = html(); conectar(); }
        async function conToken() { return ctx.token(); }
        function conectar() {
            var q = function (s) { return el.querySelector(s); };
            if (q('#gzGuardarLimite')) q('#gzGuardarLimite').addEventListener('click', async function () {
                var f = q('#gzLimite').value; if (!f) { prog('Elige la nueva fecha límite.'); return; }
                if (await ctx.guardar({ limite_evidencia: f })) { st.limite = f; pintar(); prog('Fecha límite extendida al ' + S.fechaLarga(f) + '.'); }
            });
            if (q('#gzQuitarLimite')) q('#gzQuitarLimite').addEventListener('click', async function () {
                if (!confirm('¿Quitar la extensión? Vuelve la fecha calculada desde el pago de Alineación.')) return;
                if (await ctx.guardar({ limite_evidencia: null })) { var r = await sb.rpc('limite_evidencia_para', { p_email: ctx.email }); st.limite = r.error ? null : r.data; pintar(); }
            });
            if (q('#gzBuscar')) q('#gzBuscar').addEventListener('click', async function () {
                var d = deLocalMx(q('#gzDesde').value), h = deLocalMx(q('#gzHasta').value);
                if (!d || !h) { prog('Indica desde y hasta.'); return; }
                st.ocupado = true; pintar(); prog('Buscando en Zoom…');
                try { var r = await llamar(await conToken(), { accion: 'zoom-buscar', desde: d, hasta: h }); st.resultados = r.grabaciones || []; prog(''); }
                catch (e) { prog('No se pudo buscar: ' + e.message); }
                st.ocupado = false; pintar();
            });
            if (q('#gzLigar')) q('#gzLigar').addEventListener('click', async function () {
                var sel = [].slice.call(el.querySelectorAll('[data-gz-sel]:checked')).map(function (c) { return st.resultados[Number(c.getAttribute('data-gz-sel'))]; });
                if (!sel.length) { prog('Marca al menos una grabación.'); return; }
                if (partes().some(function (p) { return p.nas && p.nas.ruta; }) && !confirm('Ya hay partes copiadas al NAS. ¿Reemplazar la grabación ligada? (los archivos del NAS no se borran)')) return;
                var lista = sel.map(function (g) { var a = archivoPrincipal(g.archivos); return { zoom: { uuid: g.uuid, file_id: a.id, inicio: a.inicio || g.inicio, bytes: a.bytes, share_url: g.share_url, clave: g.clave } }; });
                if (await guardarPartes(lista)) { st.resultados = null; pintar(); prog(lista.length + (lista.length === 1 ? ' grabación ligada. ' : ' grabaciones ligadas. ') + 'Ahora cópiala al NAS.'); }
            });
            el.querySelectorAll('[data-gz-copiar]').forEach(function (b) {
                b.addEventListener('click', async function () {
                    var i = Number(b.getAttribute('data-gz-copiar'));
                    if (!nombre && !curp) { prog('El candidato no tiene nombre ni CURP en su Autodiagnóstico.'); return; }
                    st.ocupado = true; pintar();
                    try {
                        var res = await copiarParte({
                            token: conToken, parte: partes()[i], indice: i, total: partes().length, nombre: nombre, curp: curp, onProgreso: prog,
                            guardarMigracion: function (mig) { var l = partes().slice(); l[i] = Object.assign({}, l[i], { migracion: mig }); return guardarPartes(l); }
                        });
                        var l = partes().slice(); l[i] = Object.assign({}, l[i], { nas: { ruta: res.ruta, bytes: res.bytes, fecha: new Date().toISOString(), por: ctx.yo } });
                        delete l[i].migracion;
                        await guardarPartes(l);
                        st.ocupado = false; pintar(); prog('Parte ' + (i + 1) + ' guardada en el NAS (' + mb(res.bytes) + ', mismo tamaño que en Zoom).');
                    } catch (e) { st.ocupado = false; pintar(); prog(e.message); }
                });
            });
            if (q('#gzBorrar')) q('#gzBorrar').addEventListener('click', async function () {
                if (!confirm('¿Mandar la grabación a la papelera de Zoom? Se puede recuperar en Zoom durante 30 días. La copia del NAS se queda.')) return;
                st.ocupado = true; pintar();
                try {
                    for (var i = 0; i < partes().length; i++) { prog('Borrando parte ' + (i + 1) + ' de Zoom…'); await llamar(await conToken(), { accion: 'zoom-borrar', uuid: partes()[i].zoom.uuid, email: ctx.email }); }
                    await guardarPartes(partes(), { borrada_zoom: { fecha: new Date().toISOString(), por: ctx.yo } });
                    st.ocupado = false; pintar(); prog('Grabación enviada a la papelera de Zoom.');
                } catch (e) { st.ocupado = false; pintar(); prog('No se pudo borrar: ' + e.message); }
            });
        }
        pintar();
    }
```

Y en `api` agregar `copiarParte: copiarParte, montarTarjeta: montarTarjeta`.

- [ ] **Step 2: `admin-evaluacion.html` — scripts.** Después de `<script src="portafolio.js"></script>` agregar `<script src="sala-evidencias.js"></script>` y `<script src="grabacion-zoom.js"></script>`.

- [ ] **Step 3: `admin-evaluacion.html` — sección.** En `render()`, antes de `<section class="crm-card"><div class="crm-card-h"><span class="crm-stat-ico">${ic('folder', 18)}</span>Portafolio de Evidencias</div>…`, agregar:

```html
            <section class="crm-card" style="margin-bottom:16px;"><div class="crm-card-h"><span class="crm-stat-ico">${ic('video', 18)}</span>Grabación de la sesión</div><div id="grabacionZoom"></div></section>
```

y al final de `render()`, después de `conectar();`:

```js
        GrabacionZoom.montarTarjeta(document.getElementById('grabacionZoom'), {
            email, row, yo, faltaSql,
            ev: () => ev,
            guardar: cambios => guardar(cambios),
            token: async () => (await Auth.getSession()).access_token
        });
```

- [ ] **Step 4: Verificar** con Supabase simulado (Tarea 17): la tarjeta muestra horario y límite; "Extender" guarda `limite_evidencia`; "Buscar" con `/api/subir-portafolio` simulado lista grabaciones; "Ligar" guarda `video.partes`; "Copiar" hace N llamadas `zoom-trozo` + `zoom-cerrar` y marca "En el NAS"; si una llamada falla 3 veces, el mensaje dice que continúa donde se quedó y un segundo clic arranca desde `trozos_ok + 1`; "Borrar de Zoom" deshabilitado hasta `etapas.entregado`. `node --test tests/*.test.js` pasa.

- [ ] **Step 5: Commit**

```bash
git add grabacion-zoom.js admin-evaluacion.html
git commit -m "Centro Evaluador: tarjeta Grabación de la sesión (buscar en Zoom, copiar al NAS, extender plazo)

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---
### Task 13: Pestaña "🎥 Sala de evidencias" en `admin-sesiones.html`

**Files:**
- Create: `admin-sala-evidencias.js`
- Modify: `admin-sesiones.html` (scripts ~línea 14; `render()` ~618; tabs)

Nota: `admin-sesiones.html` todavía no tiene candado de admin (hay un `TODO` en `init()`). Las tablas nuevas están protegidas por RLS (`puede_evaluar()`), así que un no-admin solo verá errores/vacío; el candado de la página queda fuera de alcance (mencionarlo en el resumen final).

- [ ] **Step 1: Crear `admin-sala-evidencias.js`**

```js
/* =========================================================
   admin-sala-evidencias.js — Pestaña "Sala de evidencias" de
   admin-sesiones.html (18 sep 2026): configuración de la sala de Zoom,
   plantilla semanal de horarios y lista de horarios con quién reservó.
   La lógica de la plantilla es SalaEvidencias.generarHorarios (probada).
========================================================= */
(function (root) {
    'use strict';
    var S = root.SalaEvidencias, esc = S._esc;
    var DIAS = [[1, 'Lun'], [2, 'Mar'], [3, 'Mié'], [4, 'Jue'], [5, 'Vie'], [6, 'Sáb'], [0, 'Dom']];
    var st = { el: null, yo: '', cfg: {}, horarios: [], reservas: [], nombres: {}, error: '', vista: null, msg: '' };
    function sb() { return root.supabaseClient; }

    async function cargar() {
        var desde = new Date(Date.now() - 14 * 86400000).toISOString();
        var r = await Promise.all([
            sb().from('sala_evidencias_config').select('*').eq('id', 1).maybeSingle(),
            sb().from('horarios_evidencia').select('id,inicio,fin,colchon_min').gte('inicio', desde).order('inicio'),
            sb().from('reservas_evidencia').select('id,horario_id,email,estado').in('estado', ['reservada', 'asistio', 'no_asistio']),
            sb().rpc('admin_lista_nombres')
        ]);
        var err = r[0].error || r[1].error || r[2].error;
        st.error = err ? 'Hay que correr 2026-09-18-sala-evidencias.sql en Supabase (' + (err.message || err) + ')' : '';
        st.cfg = r[0].data || {}; st.horarios = r[1].data || []; st.reservas = r[2].data || [];
        st.nombres = {}; (r[3].data || []).forEach(function (x) { if (x && x.email) st.nombres[x.email.toLowerCase()] = x.nombre; });
    }
    function reservaDe(hid) { return st.reservas.filter(function (x) { return x.horario_id === hid; })[0] || null; }
    function manana() { return S.sumarDias(S.fechaISO(Date.now()), 1); }

    function html() {
        var c = st.cfg, v = st.vista;
        var h = st.error ? '<div class="alert alert-error" style="margin-bottom:14px;">' + esc(st.error) + '</div>' : '';
        h += st.msg ? '<p role="status" style="font-weight:600;margin-bottom:12px;">' + esc(st.msg) + '</p>' : '';
        h += '<h2 style="margin-bottom:12px;">Configuración de la sala</h2><p style="font-size:.84rem;margin-bottom:12px;">El enlace y la clave nunca se muestran al candidato fuera de su horario. Si cambias la sala en Zoom, actualízala aquí.</p>' +
            '<div class="grid-2"><div class="form-group"><label>Enlace de invitación de Zoom *</label><input type="url" id="saUrl" value="' + esc(c.zoom_url || '') + '" placeholder="https://us06web.zoom.us/j/…"></div>' +
            '<div class="form-group"><label>ID de reunión</label><input type="text" id="saId" value="' + esc(c.zoom_id || '') + '" placeholder="827 5726 3451"></div></div>' +
            '<div class="grid-2"><div class="form-group"><label>Clave de acceso</label><input type="text" id="saClave" value="' + esc(c.zoom_clave || '') + '"></div>' +
            '<div class="form-group"><label>Días para entregar la evidencia (desde el pago de Alineación)</label><input type="number" id="saDias" min="1" max="365" value="' + esc(c.dias_limite || 30) + '"></div></div>' +
            '<div class="grid-2"><div class="form-group"><label>Minutos antes en que se abre la sala</label><input type="number" id="saAntes" min="0" max="60" value="' + esc(c.minutos_antes === undefined ? 10 : c.minutos_antes) + '"></div>' +
            '<div class="form-group"><label>Horas mínimas para cambiar o cancelar</label><input type="number" id="saCambio" min="0" max="168" value="' + esc(c.horas_cambio === undefined ? 24 : c.horas_cambio) + '"></div></div>' +
            '<button type="button" class="btn btn-primary" id="saGuardar">Guardar configuración</button>';
        h += '<h2 style="margin:28px 0 12px;">Crear horarios con plantilla semanal</h2>' +
            '<div class="form-group"><label>Días</label><div style="display:flex;flex-wrap:wrap;gap:10px;">' + DIAS.map(function (d) { return '<label style="display:flex;gap:4px;align-items:center;"><input type="checkbox" data-sa-dia="' + d[0] + '"> ' + d[1] + '</label>'; }).join('') + '</div></div>' +
            '<div class="form-group"><label>Horas de inicio (hora de México, separadas por coma)</label><input type="text" id="saHoras" placeholder="09:00, 11:00, 16:00"></div>' +
            '<div class="grid-2"><div class="form-group"><label>Duración (min)</label><input type="number" id="saDur" value="90" min="15" max="300"></div>' +
            '<div class="form-group"><label>Colchón entre sesiones (min)</label><input type="number" id="saCol" value="15" min="0" max="120"></div></div>' +
            '<div class="grid-2"><div class="form-group"><label>Desde</label><input type="date" id="saDesde" value="' + manana() + '"></div>' +
            '<div class="form-group"><label>Hasta</label><input type="date" id="saHasta" value="' + S.sumarDias(manana(), 27) + '"></div></div>' +
            '<button type="button" class="btn btn-primary" id="saVista">Vista previa</button>';
        if (v) {
            h += v.error ? '<p style="margin-top:12px;color:var(--danger);">' + esc(v.error) + '</p>'
                : '<p style="margin-top:12px;">Se crearán <strong>' + v.nuevos.length + '</strong> horarios' + (v.omitidos.length ? ' · se omiten ' + v.omitidos.length + ' (ya pasaron o se traslapan)' : '') + '.</p>' +
                  '<ul style="max-height:220px;overflow:auto;font-size:.84rem;margin:8px 0 12px 18px;">' + v.nuevos.slice(0, 60).map(function (x) { return '<li>' + esc(S.fechaLarga(x.inicio)) + ' · ' + esc(S.horarioTexto(x.inicio, x.fin)) + '</li>'; }).join('') + (v.nuevos.length > 60 ? '<li>…</li>' : '') + '</ul>' +
                  (v.nuevos.length ? '<button type="button" class="btn btn-primary" id="saCrear">Crear ' + v.nuevos.length + ' horarios</button>' : '');
        }
        var ahora = Date.now();
        var futuros = st.horarios.filter(function (x) { return Date.parse(x.fin) >= ahora; }), pasados = st.horarios.filter(function (x) { return Date.parse(x.fin) < ahora; }).reverse();
        function fila(x, pasado) {
            var r = reservaDe(x.id), quien = r ? esc(st.nombres[r.email.toLowerCase()] || r.email) + ' <span style="opacity:.7">(' + esc(r.estado) + ')</span>' : '<span style="opacity:.7">Libre</span>';
            var acc = !r && !pasado ? '<button type="button" class="btn" style="padding:6px 10px;" data-sa-borrar="' + esc(x.id) + '">Borrar</button>'
                : r && pasado ? '<button type="button" class="btn" style="padding:6px 10px;" data-sa-marcar="' + esc(r.id) + '" data-estado="asistio">Asistió</button> <button type="button" class="btn" style="padding:6px 10px;" data-sa-marcar="' + esc(r.id) + '" data-estado="no_asistio">No asistió</button>' : '';
            return '<tr><td>' + esc(S.fechaCorta(x.inicio)) + '</td><td>' + esc(S.horarioTexto(x.inicio, x.fin)) + '</td><td>' + quien + '</td><td>' + acc + '</td></tr>';
        }
        var tabla = function (l, pasado) { return l.length ? '<div class="table-wrap"><table style="width:100%;"><thead><tr><th>Fecha</th><th>Horario</th><th>Candidato</th><th></th></tr></thead><tbody>' + l.map(function (x) { return fila(x, pasado); }).join('') + '</tbody></table></div>' : '<p style="opacity:.7">Ninguno.</p>'; };
        h += '<h2 style="margin:28px 0 12px;">Próximos horarios</h2>' + tabla(futuros, false) + '<h2 style="margin:28px 0 12px;">Últimos 14 días</h2>' + tabla(pasados, true);
        return h;
    }
    function pintar() { st.el.innerHTML = html(); conectar(); }
    function aviso(m) { st.msg = m; pintar(); }
    function conectar() {
        var q = function (s) { return st.el.querySelector(s); };
        q('#saGuardar').addEventListener('click', async function () {
            var url = q('#saUrl').value.trim();
            if (!S.esUrlZoom(url)) { aviso('El enlace debe ser de zoom.us (https://…zoom.us/j/…).'); return; }
            var cambios = { zoom_url: url, zoom_id: q('#saId').value.trim(), zoom_clave: q('#saClave').value.trim(), dias_limite: Number(q('#saDias').value) || 30,
                minutos_antes: Math.max(0, Number(q('#saAntes').value) || 0), horas_cambio: Math.max(0, Number(q('#saCambio').value) || 0), updated_at: new Date().toISOString(), updated_by: st.yo };
            var r = await sb().from('sala_evidencias_config').update(cambios).eq('id', 1).select().maybeSingle();
            if (r.error) { aviso('No se pudo guardar: ' + (r.error.message || r.error)); return; }
            st.cfg = r.data || Object.assign(st.cfg, cambios); aviso('Configuración guardada.');
        });
        q('#saVista').addEventListener('click', function () {
            var dias = [].slice.call(st.el.querySelectorAll('[data-sa-dia]:checked')).map(function (c) { return Number(c.getAttribute('data-sa-dia')); });
            var horas = q('#saHoras').value.split(',').map(function (s) { var m = /^\s*(\d{1,2}):(\d{2})\s*$/.exec(s); return m ? ('0' + m[1]).slice(-2) + ':' + m[2] : null; }).filter(Boolean);
            if (!dias.length || !horas.length) { st.vista = { error: 'Elige al menos un día y una hora (formato 09:00).', nuevos: [], omitidos: [] }; pintar(); return; }
            st.vista = S.generarHorarios({ dias: dias, horas: horas, duracion: Number(q('#saDur').value), colchon: Number(q('#saCol').value), desde: q('#saDesde').value, hasta: q('#saHasta').value }, st.horarios, Date.now());
            st.msg = ''; pintar();
        });
        if (q('#saCrear')) q('#saCrear').addEventListener('click', async function () {
            var filas = st.vista.nuevos.map(function (x) { return { inicio: x.inicio, fin: x.fin, colchon_min: x.colchon_min, creado_por: st.yo }; });
            var r = await sb().from('horarios_evidencia').insert(filas);
            if (r.error) { aviso(r.error.code === '23P01' ? 'Algún horario se traslapa con otro creado mientras tanto. Vuelve a generar la vista previa.' : 'No se pudo crear: ' + (r.error.message || r.error)); return; }
            st.vista = null; await cargar(); aviso(filas.length + ' horarios creados.');
        });
        st.el.querySelectorAll('[data-sa-borrar]').forEach(function (b) {
            b.addEventListener('click', async function () {
                if (!confirm('¿Borrar este horario libre?')) return;
                var r = await sb().from('horarios_evidencia').delete().eq('id', b.getAttribute('data-sa-borrar'));
                if (r.error) { aviso('No se pudo borrar: ' + (r.error.message || r.error)); return; }
                await cargar(); aviso('Horario borrado.');
            });
        });
        st.el.querySelectorAll('[data-sa-marcar]').forEach(function (b) {
            b.addEventListener('click', async function () {
                var r = await sb().from('reservas_evidencia').update({ estado: b.getAttribute('data-estado'), updated_at: new Date().toISOString(), por: st.yo }).eq('id', b.getAttribute('data-sa-marcar'));
                if (r.error) { aviso('No se pudo marcar: ' + (r.error.message || r.error)); return; }
                await cargar(); aviso('Asistencia registrada.');
            });
        });
    }
    async function montar(el) {
        if (!el) return;
        st.el = el;
        var s = root.Auth ? await root.Auth.getSession() : null;
        st.yo = s && s.user ? s.user.email.toLowerCase() : '';
        el.innerHTML = '<p>Cargando…</p>';
        await cargar();
        pintar();
    }
    root.AdminSala = { montar: montar };
})(window);
```

- [ ] **Step 2: `admin-sesiones.html`.** Después de la línea de `crm-shell.js` agregar `<script src="sala-evidencias.js"></script>` y `<script src="admin-sala-evidencias.js"></script>`. En `render()`, en `.tabs` agregar el botón `<button class="tab-btn" data-tab="sala" onclick="switchTab('sala')">🎥 Sala de evidencias</button>` y, antes de `<!-- TAB: REPORTES -->`, el contenedor:

```html
            <!-- TAB: SALA DE EVIDENCIAS (18 sep) -->
            <div id="tab-sala" class="tab-content">
                <div class="card"><div id="salaEvidenciasAdmin"></div></div>
            </div>
```

Al final de `render()`, después de `cargarSesiones();`, agregar `AdminSala.montar(document.getElementById('salaEvidenciasAdmin'));`. Si la URL trae `#sala`, abrir esa pestaña: agregar `if (location.hash === '#sala') switchTab('sala');` en la misma posición.

- [ ] **Step 3: Verificar** (Tarea 17, Supabase simulado): guardar configuración rechaza un enlace que no es de zoom.us; plantilla Jue 09:00, 10:00, 11:00 / 90 + 15 → vista previa con las de 10:00 omitidas; "Crear" inserta; borrar libre; marcar asistió. A 375 px sin desborde (tabla con scroll propio).

- [ ] **Step 4: Commit**

```bash
git add admin-sala-evidencias.js admin-sesiones.html
git commit -m "Admin: pestaña Sala de evidencias (configuración, plantilla semanal, horarios y asistencia)

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---
### Task 14: "Requieren atención" — plazos y grabaciones sin copiar

**Files:**
- Modify: `admin-data.js` (arriba; `atencion()` ~389; `cargar()` ~416; export)
- Modify: `admin-crm.html` (script tag; ícono del tipo)
- Modify: `tests/admin-data.test.js`

- [ ] **Step 1: Prueba que falla** — agregar a `tests/admin-data.test.js` (en Node, `admin-data.js` toma `sala-evidencias.js` con `require`):

```js
test('atencionSala: plazo vencido, por vencer y sesión grabada sin copiar al NAS', () => {
    const d = datos();
    d.pagos.push({ email: 'c@x.com', fase: 'alineacion', monto: 3000, origen: 'manual', autorizado_en: '2026-09-15T16:00:00Z' });
    d.salaConfig = { dias_limite: 30 };
    d.evalSala = [{ email: 'c@x.com', limite_evidencia: null, video: null }];
    d.reservasSala = [{ email: 'a@x.com', estado: 'asistio', horarios_evidencia: { inicio: '2026-09-20T16:00:00Z', fin: '2026-09-20T17:30:00Z' } }];
    const lista = AdminData.candidatos(d);
    // a@x.com: Alineación el 10 sep → límite 10 oct. c@x.com: 15 sep → 15 oct.
    const it = AdminData.atencionSala(d, lista, new Date('2026-10-12T18:00:00Z'));
    assert.ok(it.some(i => i.tipo === 'plazo_vencido' && i.email === 'a@x.com'));
    assert.ok(it.some(i => i.tipo === 'plazo_pronto' && i.email === 'c@x.com' && /3 días/.test(i.texto)));
    assert.ok(it.some(i => i.tipo === 'sin_grabacion' && i.email === 'a@x.com'));
    d.evalSala.push({ email: 'a@x.com', limite_evidencia: '2026-11-30', video: { partes: [{ nas: { ruta: 'Portafolios/x/03-Evaluacion/g.mp4' } }] } });
    const it2 = AdminData.atencionSala(d, AdminData.candidatos(d), new Date('2026-10-12T18:00:00Z'));
    assert.ok(!it2.some(i => i.email === 'a@x.com'));
});

test('atencionSala: sin el SQL de la sala no avisa nada', () => {
    const d = datos(); d.errores = { salaConfig: 'relation does not exist' };
    assert.deepEqual(AdminData.atencionSala(d, AdminData.candidatos(d), new Date('2026-10-12T18:00:00Z')), []);
});
```

- [ ] **Step 2: Correr.** `node --test tests/admin-data.test.js` → FAIL (`AdminData.atencionSala is not a function`).

- [ ] **Step 3: Implementar.** En `admin-data.js`, después de `var H = CS._helpers;` agregar:

```js
    /* Sala de evidencias (18 sep): en el navegador solo si la página cargó
       sala-evidencias.js (admin-crm.html); en Node se toma con require. */
    var SE = (typeof SalaEvidencias !== 'undefined') ? SalaEvidencias
        : (typeof module !== 'undefined' && module.exports ? require('./sala-evidencias.js') : null);
```

Antes de `/* ---------- carga (solo navegador) ---------- */` agregar:

```js
    /* Plazos de evidencia (desde el pago de Alineación, o la extensión del
       equipo) y sesiones ya grabadas sin copia en el NAS. */
    function atencionSala(datos, lista, now) {
        if (!SE || (datos.errores && datos.errores.salaConfig)) return [];
        var ahora = (now || new Date()).getTime(), hoy = SE.fechaISO(ahora);
        var dias = (datos.salaConfig && Number(datos.salaConfig.dias_limite)) || 30;
        var ev = {}; (datos.evalSala || []).forEach(function (r) { if (r && r.email) ev[r.email.toLowerCase()] = r; });
        var porEmail = {}; lista.forEach(function (c) { porEmail[c.email.toLowerCase()] = c; });
        var items = [];
        lista.filter(function (c) { return c.estado === 'activo' && c.fases.alineacion; }).forEach(function (c) {
            var email = c.email.toLowerCase();
            var pago = (datos.pagos || []).filter(function (p) { return (p.email || '').toLowerCase() === email && p.fase === 'alineacion'; })[0];
            var limite = (ev[email] && ev[email].limite_evidencia) || (pago ? SE.limiteDesde(pago.autorizado_en, dias) : null);
            var evid = (c.steps || []).filter(function (s) { return s.id === 'evidencias'; })[0];
            var info = SE.limiteInfo(limite, hoy, !!(evid && evid.done));
            if (!info) return;
            var href = 'admin-evaluacion.html?email=' + encodeURIComponent(c.email), nom = c.nombre || c.email;
            if (info.clave === 'vencido') items.push({ tipo: 'plazo_vencido', texto: nom + ' — su plazo de evidencia venció el ' + SE.fechaCorta(limite), email: email, href: href });
            else if (info.clave === 'pronto') items.push({ tipo: 'plazo_pronto', texto: nom + ' entrega su evidencia a más tardar el ' + SE.fechaCorta(limite) + ' (' + (info.dias === 0 ? 'hoy' : info.dias + (info.dias === 1 ? ' día' : ' días')) + ')', email: email, href: href });
        });
        (datos.reservasSala || []).forEach(function (r) {
            var h = r && r.horarios_evidencia;
            if (!h || Date.parse(h.fin) > ahora) return;
            var email = (r.email || '').toLowerCase(), v = ev[email] && ev[email].video;
            var partes = v && Array.isArray(v.partes) ? v.partes : [];
            if (partes.length && partes.every(function (p) { return p && p.nas && p.nas.ruta; })) return;
            var c = porEmail[email];
            items.push({ tipo: 'sin_grabacion', texto: 'Sesión grabada del ' + SE.fechaCorta(h.inicio) + ' (' + ((c && c.nombre) || email) + ') sin copiar al NAS', email: email, href: 'admin-evaluacion.html?email=' + encodeURIComponent(email) });
        });
        return items;
    }
```

Al final de `atencion()`, cambiar `return items;` por `return items.concat(atencionSala(datos, lista, now));`.

En `cargar()`, agregar al final del `Promise.all([...])` (después del `fetch('/api/sesiones-alineacion')…`):

```js
            q(sb.from('sala_evidencias_config').select('dias_limite').eq('id', 1).maybeSingle()),
            q(sb.from('reservas_evidencia').select('email,estado,horarios_evidencia(inicio,fin)').in('estado', ['reservada', 'asistio'])),
            q(sb.from('evaluaciones').select('email,limite_evidencia,video'))
```

y en `nombresClave` agregar `'salaConfig', 'reservasSala', 'evalSala'`. Cambiar la asignación a `datos[k] = res[i].data || (k === 'sesiones' || k === 'salaConfig' ? null : []);`. Exportar `atencionSala: atencionSala` en el objeto `AdminData`.

- [ ] **Step 4: `admin-crm.html`.** Antes de `<script src="admin-data.js"></script>` agregar `<script src="sala-evidencias.js"></script>`. En la línea ~180 del ícono, extender el ternario: `i.tipo === 'sesion' || i.tipo === 'sin_grabacion' ? 'video' : i.tipo === 'evaluador' ? 'award' : i.tipo === 'inactivo' || i.tipo === 'plazo_pronto' || i.tipo === 'plazo_vencido' ? 'clock' : 'inbox'`.

- [ ] **Step 5: Correr.** `node --test tests/*.test.js` → PASS.

- [ ] **Step 6: Commit**

```bash
git add admin-data.js admin-crm.html tests/admin-data.test.js
git commit -m "Panel del equipo: avisos de plazo de evidencia y grabaciones sin copiar al NAS

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 15: Regrabar los tutoriales afectados (como el 17 sep)

**Files:**
- Modify: `_internal_no_publicar/tutoriales-grabador/stub.js` (simular las RPC de la sala)
- Modify: `_internal_no_publicar/tutoriales-grabador/guiones.js` (`plan-evaluacion`, `documentos-sesion`, `evidencias`)
- Modify: `_internal_no_publicar/tutoriales-grabador/grabar.js` (aceptar los `confirm()`)
- Modify: `tutoriales/plan-evaluacion.mp4|.jpg`, `tutoriales/documentos-sesion.mp4|.jpg`, `tutoriales/evidencias.mp4|.jpg`
- Modify: `crm-shell.js` (`TUTORIALES`: `dur` y `desc` de esos 3)

Cómo se grabó (CLAUDE.md, "Recursos: tutoriales"): con el servidor de `.claude/launch.json` (`ec1375-static`, puerto 8420) corriendo, `node grabar.js <id>` en `_internal_no_publicar/tutoriales-grabador/` → `salida/<id>.mp4` y `.jpg`. Playwright `playwright-core` 1.60 de `~/.npm/_npx/e41f203b7505f1fb/` y ffmpeg.

- [ ] **Step 1: Stub de la sala** — al final de la IIFE de `stub.js` (antes de su `})();`) agregar:

```js
    /* Sala de evidencias (18 sep): RPC simuladas en memoria. El enlace es
       ficticio (nunca el real). */
    (function () {
        var H = 3600000, base = Date.now() + 2 * 86400000;
        base = base - (base % H);
        var libres = [0, 2, 4].map(function (i) { return { id: 'tut-' + i, inicio: new Date(base + i * H).toISOString(), fin: new Date(base + i * H + 1.5 * H).toISOString() }; });
        var reserva = cfg.salaAbierta ? { id: 'tut-r', inicio: new Date(Date.now() - 4 * 60000).toISOString(), fin: new Date(Date.now() + 86 * 60000).toISOString(), estado: 'reservada' } : null;
        function mia() {
            var abierta = reserva && Date.now() >= Date.parse(reserva.inicio) - 10 * 60000 && Date.now() <= Date.parse(reserva.fin);
            return { reserva: reserva, limite: new Date(Date.now() + 12 * 86400000).toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' }), limite_extendido: false,
                minutos_antes: 10, horas_cambio: 24, sala: abierta ? { url: 'https://zoom.us/j/0000000000', id: '000 0000 0000', clave: 'EJEMPLO' } : null, grabacion: { en_expediente: !!cfg.grabacionGuardada, fecha: cfg.grabacionGuardada ? new Date().toISOString() : null } };
        }
        var RPC = {
            mi_sala_evidencia: mia,
            horarios_evidencia_disponibles: function () { return reserva ? libres.filter(function (h) { return h.id !== reserva.id; }) : libres; },
            reservar_horario_evidencia: function (a) { var h = libres.filter(function (x) { return x.id === a.p_horario; })[0]; reserva = { id: h.id, inicio: h.inicio, fin: h.fin, estado: 'reservada' }; return reserva; },
            cancelar_mi_horario_evidencia: function () { reserva = null; return true; }
        };
        var sbc = window.supabaseClient, orig = sbc && sbc.rpc ? sbc.rpc.bind(sbc) : null;
        if (sbc) sbc.rpc = function (n, a) { return RPC[n] ? Promise.resolve({ data: RPC[n](a || {}), error: null }) : orig(n, a); };
    })();
```

- [ ] **Step 2: Aceptar `confirm()`.** En `grabar.js`, después de crear la página (`const page = await context.newPage()` o equivalente), agregar `page.on('dialog', d => d.accept());`.

- [ ] **Step 3: Guion `plan-evaluacion`.** En `guiones.js`, reemplazar los pasos de fecha/lugar/horario:

```js
        { texto: 'Escribe cuándo y dónde harás tu evaluación, y dónde recibirás tus resultados', llenar: ['#f_fechaEvaluacion', '2026-10-15'], espera: 900 },
        { escribir: ['#f_lugarDesarrollo', 'Mi consultorio'] },
        { escribir: ['#f_horarioDesarrollo', '10:00 a 12:00 h'] },
```

por:

```js
        { texto: 'Agenda tu sesión grabada: cada horario de la sala de Zoom es para una sola persona', scroll: '#agendaSala', espera: 3600 },
        { texto: 'Elige el día…', clic: '[data-sala-dia]', espera: 2000 },
        { texto: '…y la hora. Confirma y el horario queda solo para ti', clic: '[data-sala-horario]', espera: 3200 },
        { texto: 'La fecha, el horario y el lugar se llenan solos. Puedes cambiarlo hasta 24 h antes', marco: '#agendaSala', espera: 4200 },
```

(se conservan los pasos de `#f_lugarResultados` y `#f_horarioResultados`). Actualizar el subtítulo `P('Plan de Evaluación', 'Agenda tu sesión grabada en la sala de Zoom, confirma y firma')`.

- [ ] **Step 4: Guion `documentos-sesion`.** Agregar `salaAbierta: true` a su `estado` y, después del paso `P('Documentos de Sesión', …)`, insertar:

```js
        { texto: 'El día de tu horario, aquí aparece tu sala: el botón se habilita 10 min antes', marco: '[data-sala-tarjeta]', espera: 4200 },
        { texto: 'Lee las reglas: la sala es individual y <b>se graba en cuanto entras</b>', clic: '.sala-reglas summary', espera: 4200 },
        { texto: 'Arriba ves hasta qué fecha tienes para entregar tu evidencia', marco: '[data-sala-aviso]', espera: 3400 },
```

- [ ] **Step 5: Guion `evidencias`.** Agregar `grabacionGuardada: true` a su `estado`; reemplazar el paso `{ texto: 'Pega la liga de tu video de la sesión', escribir: ['#f_videoLink', …] }` por `{ texto: 'Tu grabación la guarda el equipo en tu expediente: no tienes que subirla', marco: '[data-sala-grabacion]', espera: 3800 },`.

- [ ] **Step 6: Grabar.** Con la preview `ec1375-static` corriendo:

```bash
cd "_internal_no_publicar/tutoriales-grabador" && node grabar.js plan-evaluacion documentos-sesion evidencias
```

Expected: `salida/plan-evaluacion.mp4` (+ `.jpg`), `salida/documentos-sesion.mp4`, `salida/evidencias.mp4`.

- [ ] **Step 7: Revisar cuadro por cuadro** con la hoja de contactos (`./hoja.sh salida/plan-evaluacion.mp4` o el procedimiento del 17 sep): el selector de días y horas se ve, la confirmación no queda en pantalla, los campos se llenan solos, el aviso de fecha límite y la tarjeta "la sala está abierta" se leen, y **no aparece ningún enlace real de Zoom** (solo `zoom.us/j/0000000000`).

- [ ] **Step 8: Publicar.** Copiar `salida/<id>.mp4` y `.jpg` a `tutoriales/`. En `crm-shell.js` (`TUTORIALES`) actualizar `dur` con la duración real (`ffprobe -v error -show_entries format=duration -of csv=p=0 tutoriales/<id>.mp4`, redondeada) y las descripciones: `plan-evaluacion` → `'Agendar tu sesión grabada en la sala de Zoom, confirmar requisitos y firmar.'`; `evidencias` → `'Subir lo que el sitio no genera y confirmar tu entrega (tu grabación la guarda el equipo).'`. Correr `node botones.js` → Expected: 30/30 como el 17 sep.

- [ ] **Step 9: Commit** (solo lo publicado; el grabador está en la carpeta ignorada)

```bash
git add tutoriales/plan-evaluacion.mp4 tutoriales/plan-evaluacion.jpg tutoriales/documentos-sesion.mp4 tutoriales/documentos-sesion.jpg tutoriales/evidencias.mp4 tutoriales/evidencias.jpg crm-shell.js
git commit -m "Tutoriales: regrabados Plan de Evaluación, Documentos de Sesión y Evidencias con la sala de Zoom

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---
### Task 16: Service worker, guía de Zoom y CLAUDE.md

**Files:**
- Modify: `sw.js:9-10`
- Create: `docs/guias/2026-09-18-zoom-sala-evidencias.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: `sw.js`.** `var VERSION = 'paideia-app-v10';` y agregar `'/sala-evidencias.js'` a `SHELL` (después de `'/firma-candidato.js'`). `grabacion-zoom.js` y `admin-sala-evidencias.js` no se precachean (solo equipo).

- [ ] **Step 2: Guía para Diego** — crear `docs/guias/2026-09-18-zoom-sala-evidencias.md`:

```markdown
# Sala de evidencias en Zoom — lo que hace Diego (18 sep 2026)

## 1. Correr el SQL (una vez)
SQL Editor de Supabase → pegar y correr `_internal_no_publicar/02-sql/2026-09-18-sala-evidencias.sql`.
Si todavía no corriste `2026-09-18-centro-evaluador.sql`, córrelo antes.

## 2. Configurar la sala en la plataforma
Panel del equipo → Sesiones de Alineación → pestaña **🎥 Sala de evidencias**:
1. Pega el enlace de invitación, el ID y la clave de la reunión "PAIDEIA | Grabación de evidencias". Guarda.
2. Plantilla semanal: días, horas de inicio, 90 min + 15 de colchón, rango de fechas → Vista previa → Crear.

## 3. Ajustes en Zoom (zoom.us → Configuración → Grabación)
- Grabación en la nube: **activada**, automática (ya está en la reunión).
- Activar **"Mostrar el nombre de los participantes en la grabación"** y **"Agregar una marca de tiempo a la grabación"**.
- Vista: pantalla compartida con orador activo (y galería si quieres).
- En la reunión: **sala de espera apagada** (no hay anfitrión que admita), "Permitir unirse en cualquier momento" encendido.
- **Prueba una vez**: entra tú solo con otra cuenta, sin el anfitrión, 3 minutos; confirma que aparece la grabación en Grabaciones.
- **Almacenamiento**: Zoom Pro trae 5 GB y cada sesión pesa 0.3–0.8 GB. Las grabaciones se quedan en Zoom hasta que se entrega el certificado. Revisa el espacio (Administración de cuenta → Almacenamiento) y amplíalo antes de abrir muchos horarios: **cuando se llena, Zoom deja de grabar**.

## 4. App de Zoom para copiar grabaciones al NAS (10 min)
1. Entra a https://marketplace.zoom.us con la cuenta dueña de la sala → **Develop → Build App → Server-to-Server OAuth App**. Nombre: "Paideia Sala Evidencias".
2. Copia **Account ID**, **Client ID** y **Client Secret**.
3. Information: nombre de la empresa y correo de contacto.
4. Scopes → Add Scopes: busca y marca
   - ver una reunión (`meeting:read:meeting:admin` o "View a meeting"),
   - listar grabaciones de usuario (`cloud_recording:read:list_user_recordings:admin` o "View all user recordings"),
   - ver las grabaciones de una reunión (`cloud_recording:read:list_recording_files:admin` o "Get meeting recordings"),
   - borrar grabaciones de una reunión (`cloud_recording:delete:meeting_recording:admin` o "Delete meeting recordings").
   (Zoom cambia los nombres; si no aparecen exactos, elige los de "recording" y "meeting" que digan lo mismo.)
5. **Activate your app**.
6. Vercel → proyecto ec1375-posturalia → Settings → Environment Variables (Production), marcar como Sensitive:
   `ZOOM_ACCOUNT_ID`, `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET`. Luego **Redeploy**.

## 5. Después de cada sesión
Centro Evaluador → candidato → **Grabación de la sesión** → Buscar grabación en Zoom → marcarla → Ligar → **Copiar al expediente (NAS)**.
Queda en `Portafolios/<Nombre_CURP>/03-Evaluacion/Grabacion_Sesion_<fecha>_<hora>.mp4`.
"Borrar de Zoom" se habilita cuando la copia está verificada **y** el certificado se marcó como entregado (va a la papelera de Zoom, 30 días recuperable).
```

- [ ] **Step 3: `CLAUDE.md`.** (a) En "Estructura de archivos" agregar `sala-evidencias.js`, `grabacion-zoom.js`, `admin-sala-evidencias.js`, `lib/zoom.js`, `lib/nextcloud.js` con una línea cada uno. (b) Nueva sección "## Sala de evidencias en Zoom (18 sep)" con: sala única de enlace fijo; horarios exclusivos + enlace solo en la ventana (`mi_sala_evidencia`); hueco conocido (quien copie el enlace); plazo = Alineación + 30 días (extensión en Centro Evaluador); agenda en Plan de Evaluación con respaldo WhatsApp; tarjeta en Documentos de Sesión/Guion; aviso en Panel/Evidencias; Evidencias ya no pide YouTube; copia Zoom → NAS por trozos de 32 MB (acciones en `api/subir-portafolio.js`, sin función nueva); "Borrar de Zoom" solo con certificado entregado; riesgo de almacenamiento de Zoom; ⚠️ SQL por correr y app de Zoom por crear (liga a la guía); cuenta demo con datos ficticios. (c) En "Autenticación y gates" y "Progreso del candidato": Documentos de Sesión y Guion Maestro piden **Alineación**; Práctica, Examen, Encuesta y Evidencias piden **Evaluación**, que se paga al terminar Documentos de Sesión o en `documentos-sesion.html?pagar=evaluacion`. (d) En "Cambios recientes (18 sep)": Guion Maestro imprimible a PDF con marca de agua del nombre; tutoriales regrabados. (e) Variables de entorno: `ZOOM_ACCOUNT_ID`, `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET`. (f) Nota: `admin-sesiones.html` sigue sin candado de admin (RLS protege las tablas nuevas).

- [ ] **Step 4: Commit**

```bash
git add sw.js docs/guias/2026-09-18-zoom-sala-evidencias.md CLAUDE.md
git commit -m "Sala de evidencias: guía de Zoom, service worker v10 y CLAUDE.md

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 17: Verificación en navegador con Supabase simulado

**Files:**
- Create: `<scratchpad>/verificar-sala.js` (fuera del repo)

Mismo método que el 17–18 sep: páginas reales servidas por `ec1375-static` (8420), `sw.js` bloqueado, Supabase respondido por Playwright (`page.route('**/numsuiuwrvpprhnxovmh.supabase.co/**', …)`) y `/api/subir-portafolio` simulado.

- [ ] **Step 1: Arnés.** Script de Playwright (`playwright-core` de `~/.npm/_npx/e41f203b7505f1fb/`) que:
  - bloquea `**/sw.js`;
  - siembra una sesión de supabase-js en `localStorage['sb-numsuiuwrvpprhnxovmh-auth-token']` (correo `ana.demo@ejemplo.com`, `expires_at` futuro) y el `autodiagnosticoData` de la candidata demo;
  - responde `auth/v1/user` con ese usuario; `rest/v1/rpc/is_fase_authorized` según un conjunto de fases configurable; `is_current_user_flow_bypass_admin` → `false`; `is_admin` → según prueba;
  - implementa en memoria `mi_sala_evidencia`, `horarios_evidencia_disponibles`, `reservar_horario_evidencia` (con la regla de choque: la segunda reserva del mismo horario responde `{ code: 'P0001', message: 'Ese horario acaba de ocuparse. Elige otro.' }` y status 400) y `cancelar_mi_horario_evidencia` (rechaza a menos de 24 h);
  - responde `rest/v1/candidatos_ec1375` con la fila demo y cualquier `upsert` con 201.

- [ ] **Step 2: Casos del candidato** (anotar ✓/✗ con captura de los que fallen):
  1. Plan de Evaluación sin horarios → WhatsApp + fecha manual (como hoy).
  2. Con 3 horarios → selector; reservar llena fecha/horario/lugar en solo lectura; "Generar" pide reserva.
  3. Choque: dos pestañas reservan el mismo horario → la segunda ve "Ese horario acaba de ocuparse".
  4. Cambiar a menos de 24 h → botones deshabilitados con liga a WhatsApp.
  5. Documentos de Sesión: reserva en 15 min → "Se habilita 10 min antes" y cuenta regresiva; con el reloj en la ventana (`page.clock` o reserva que empezó hace 5 min) → botón "Entrar" con el enlace simulado, ID, clave y "Copiar".
  6. Documentos de Sesión con solo Alineación pagada → entra; al terminar muestra "Siguiente: paga tu Evaluación"; `?pagar=evaluacion` abre la caja de pago.
  7. Práctica / Encuesta / Evidencias sin Evaluación → aviso "Paga tu Evaluación" con liga a `documentos-sesion.html?pagar=evaluacion`.
  8. Aviso de plazo en Panel y Evidencias: 12 días (azul), 3 días (ámbar), vencido (rojo), Evidencias completas (entregada).
  9. Evidencias: "Confirmar Entrega" se habilita sin liga de video; fila "Grabación de tu sesión" pendiente/guardada.
  10. Guion Maestro: `page.emulateMedia({ media: 'print' })` + `page.pdf()` → marca con el nombre en todas las hojas, sin sidebar ni tarjeta.
  11. Cuenta demo (`is_current_user_flow_bypass_admin` → `true`): tarjeta abierta con botón demo, 0 llamadas a las RPC de reserva.
  12. 375 px: 0 px de desborde en Plan, Documentos de Sesión, Guion, Panel y Evidencias.

- [ ] **Step 3: Casos del equipo** (con `is_admin` → `true`):
  1. Sala de evidencias: guardar configuración (rechaza un enlace que no es zoom.us), plantilla con vista previa y crear, borrar libre, marcar asistió.
  2. Centro Evaluador: tarjeta con horario y límite; extender; buscar (respuesta simulada de `zoom-buscar` con 2 grabaciones); ligar; copiar una parte de 70 MB simulada → 3 llamadas `zoom-trozo` + `zoom-cerrar` → "En el NAS"; forzar falla en el trozo 2 → mensaje y reanudación desde el trozo 2; `zoom-cerrar` con `pendiente` dos veces y luego éxito; "Borrar de Zoom" deshabilitado sin `entregado`.
  3. Panel del equipo: aparecen "plazo vencido", "por vencer" y "sin copiar al NAS".
  4. Portafolio: la página "Referencia al Video de la Sesión" muestra la liga de Zoom.

- [ ] **Step 4: Suite y límite.** `node --test tests/*.test.js` → todas pasan (anotar el total). `find api -name "*.js" | wc -l` → `12`.

- [ ] **Step 5: Resumen para Diego** (no hacer push sin su permiso): qué quedó, qué falta de su lado (correr SQL; configurar la sala en admin; crear la app de Zoom y sus 3 variables; ajustes de grabación y almacenamiento; prueba real de una sesión y su copia al NAS), riesgos (almacenamiento de Zoom, hueco del enlace copiado, textos de reglas por validar con el evaluador) y que `admin-sesiones.html` sigue sin candado de admin.

---

## Self-review (hecho al escribir el plan)

- **Cobertura del spec:** §0 capas → T3 (índices, RPC) + T5 (reglas); §1 datos → T3; §2 agenda → T6; §3 tarjeta → T5/T7; §3b candados → T1; §4 aviso → T5/T7/T14; §5 Evidencias → T7; §6 equipo → T12/T13/T14; §7 copia → T9–T12; §8 Zoom → T16 guía; §9 demo → T5 (`datosDemo`); §10 pruebas → T4/T5/T8–T11/T14/T17. Pedidos de Diego del 18 sep: Guion a PDF con marca de agua → T2; regrabar tutoriales → T15.
- **Nombres consistentes:** `SalaEvidencias.{agenda, montar, montarDespuesDelHero, tarjeta, avisoLimite, LUGAR_SALA, limiteDesde, limiteInfo, fechaISO, fechaCorta, fechaLarga, hora, horarioTexto, mxAIso, sumarDias, esUrlZoom, generarHorarios, _esc}`; `GrabacionZoom.{TROZO, planTrozos, archivoPrincipal, nombreGrabacion, ventanaBusqueda, esIdSubida, nuevoIdSubida, partesDe, puedeBorrarDeZoom, copiarParte, montarTarjeta}`; `evaluaciones.video.partes[i].{zoom:{uuid,file_id,inicio,bytes,share_url,clave}, nas:{ruta,bytes,fecha,por}, migracion:{upload_id,trozos_ok,total}}`; RPC `mi_sala_evidencia`, `horarios_evidencia_disponibles`, `reservar_horario_evidencia(p_horario)`, `cancelar_mi_horario_evidencia`, `limite_evidencia_para(p_email)`; acciones `zoom-buscar|zoom-trozo|zoom-cerrar|zoom-borrar`.
- **Pendiente de confirmar en la prueba real (no se puede simular):** nombres exactos de los scopes de Zoom, que `download_url` acepte `Range` tras la redirección, y cuánto tarda el NAS en armar un MP4 de ~800 MB detrás de Cloudflare (por eso `pendiente` + verificación).
