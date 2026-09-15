# Shell CRM del candidato + panel de control — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que todas las páginas post-pago del candidato vivan dentro de un mismo panel tipo CRM (sidebar fijo con los 10 pasos, encabezado con toggle de tema y usuario), con `recuperar.html` convertido en un panel de control con cifras y tarjetas, en tema claro por default con toggle a oscuro.

**Architecture:** Un módulo compartido nuevo (`crm-shell.js` + `crm-shell.css`, tercera excepción deliberada a "páginas sin módulos compartidos") que en tiempo de ejecución mueve el DOM existente de cada página dentro de un `<main>` junto a un `<aside>` (sidebar) y un `<header>`. Los pasos y su estado vienen SIEMPRE de `FlowStatus.getSteps()` (no se re-implementa nada de "qué cuenta como completo"). El tema claro se logra redefiniendo los 9 tokens que todas las páginas ya comparten en `:root`, más dos tokens nuevos (`--border`, `--surface-2`) que reemplazan los ~70 bordes blancos semitransparentes hardcodeados.

**Tech Stack:** HTML/CSS/JS vanilla sin build (convención del proyecto), `node:test` (Node 24, sin dependencias) para los helpers puros, Playwright (herramientas MCP `mcp__playwright__*`) para la verificación en navegador, `python3 -m http.server` como servidor estático local.

**Spec de referencia:** `docs/superpowers/specs/2026-09-15-crm-shell-candidato-design.md`

---

## Convenciones que se repiten en todo este plan

**Orden de carga de scripts en cada página con shell:**
```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script src="auth.js"></script>
<script src="flow-status.js"></script>
<script src="crm-shell.js"></script>            <!-- modo full (default) -->
<script src="crm-shell.js" data-crm-mode="rail"></script>   <!-- modo rail: ruta-estudio / ruta-alineacion -->
```
`crm-shell.js` lee `document.currentScript.dataset.crmMode` al cargarse: en modo `rail` NO inyecta los tokens de tema (esas dos páginas tienen tokens propios, ej. `--accent` significa azul ahí, y se romperían).

**Ids de página (`currentPageId`)** — los mismos `id` de `FLOW_STEPS_META` en `flow-status.js`: `autodiagnostico`, `reforzamiento`, `alineacion`, `plan-evaluacion`, `documentos-sesion`, `practica`, `examen`, `encuesta`, `evidencias`, `entrega`. Más el id reservado `panel` (item "Panel" del sidebar, solo lo usa `recuperar.html`).

**Servidor local para verificar:** desde la raíz del repo, `python3 -m http.server 8080` (en background) y abrir `http://localhost:8080/<página>`. Las páginas hablan con Supabase directo desde el navegador, así que login con correo+contraseña funciona en local. Lo que NO funciona en local es `/api/*` (Vercel): el login-maestro y la tarjeta "Sesión de Alineación" del panel mostrarán su estado de error en local — eso es esperado; la prueba final de esa tarjeta se hace en el preview de Vercel (Tarea 10).

**Cuenta de pruebas:** `paideia.tech@outlook.com` (cuenta bypass, ver Claude.md). Diego proporciona la contraseña; NO usar el login-maestro en local (requiere la API).

**Commits:** uno por tarea, en español, terminando con `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. No hacer `git push` hasta la Tarea 10.

---

### Task 1: `crm-shell.css` — layout, sidebar, tarjetas y tema

**Files:**
- Create: `crm-shell.css`

- [ ] **Step 1: Crear el archivo completo**

```css
/* =========================================================
   crm-shell.css — layout del shell CRM del candidato.
   Se carga desde crm-shell.js (inyecta el <link>). Los TOKENS de tema
   (html[data-theme=...]) NO viven aquí sino inline en crm-shell.js
   para que se apliquen antes del primer pintado (sin flash oscuro→claro).
   Spec: docs/superpowers/specs/2026-09-15-crm-shell-candidato-design.md
========================================================= */

:root {
    --crm-sidebar-w: 260px;
    --crm-rail-w: 64px;
    --crm-header-h: 56px;
    --crm-offset-top: 0px;      /* alto real de #adminBypassBar (cuenta bypass), lo mide crm-shell.js */
    --crm-side-bg: linear-gradient(180deg, #0d2a6e 0%, #0a1f52 100%);
    --crm-side-text: rgba(255,255,255,0.85);
    --crm-side-line: rgba(255,255,255,0.14);
    --crm-cta: #FFD700;         /* botón principal del hero, fijo en ambos temas (como la referencia) */
    --crm-cta-text: #050a1a;
}
html[data-theme="dark"] {
    --crm-side-bg: linear-gradient(180deg, #0a1230 0%, #070d22 100%);
}

/* ---- Base ---- */
body.crm-active {
    background: var(--dark);
    padding-top: 0 !important;   /* renderProgressBar ya no existe; el offset lo maneja el shell */
}
.crm-shell * { box-sizing: border-box; }

/* ---- Grid principal (modo full) ---- */
.crm-shell.crm-mode-full {
    display: grid;
    grid-template-columns: var(--crm-sidebar-w) minmax(0, 1fr);
    min-height: calc(100vh - var(--crm-offset-top));
}
.crm-main { min-width: 0; display: flex; flex-direction: column; }
.crm-main .container { max-width: 860px; }
.crm-main .top-bar { top: calc(var(--crm-offset-top) + var(--crm-header-h)); }

/* Barras fijas al fondo que ya tienen algunas páginas (nav-bar de los wizards,
   sticky-submit y toast del examen): en desktop empiezan después del sidebar. */
@media (min-width: 1024px) {
    body.crm-full .crm-main .nav-bar,
    body.crm-full .crm-main .sticky-submit { left: var(--crm-sidebar-w); }
    body.crm-full .crm-main .toast { left: calc(50% + var(--crm-sidebar-w) / 2); }
}

/* ---- Encabezado del shell ---- */
.crm-topbar {
    position: sticky; top: var(--crm-offset-top); z-index: 150;
    height: var(--crm-header-h);
    display: flex; align-items: center; gap: 12px; padding: 0 16px;
    background: var(--dark-light); border-bottom: 1px solid var(--border);
    color: var(--text-bright);
}
.crm-topbar-title { font-weight: 700; font-size: 0.95rem; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.crm-iconbtn {
    background: var(--surface-2); border: 1px solid var(--border); color: var(--text-bright);
    width: 36px; height: 36px; border-radius: 10px; cursor: pointer; font-size: 1rem;
    display: inline-flex; align-items: center; justify-content: center; font-family: inherit;
}
.crm-iconbtn:hover { border-color: var(--primary); }
.crm-hamburger { display: none; }
.crm-userchip { display: flex; align-items: center; gap: 8px; font-size: 0.82rem; color: var(--text); }
.crm-avatar {
    width: 32px; height: 32px; border-radius: 50%; background: var(--primary); color: #fff;
    display: inline-flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.8rem; flex-shrink: 0;
}

/* ---- Sidebar ---- */
.crm-sidebar {
    position: sticky; top: var(--crm-offset-top);
    height: calc(100vh - var(--crm-offset-top));
    overflow-y: auto; z-index: 200;
    background: var(--crm-side-bg); color: var(--crm-side-text);
    display: flex; flex-direction: column; gap: 18px; padding: 20px 14px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}
.crm-brand { display: flex; align-items: center; gap: 10px; padding: 0 6px; }
.crm-brand img { width: 40px; height: 40px; object-fit: contain; border-radius: 8px; background: #fff; padding: 3px; }
.crm-brand strong { display: block; color: #fff; font-size: 1rem; line-height: 1.15; }
.crm-brand small { display: block; font-size: 0.72rem; opacity: 0.8; }
.crm-pill {
    display: inline-block; margin-top: 4px; font-size: 0.62rem; letter-spacing: 0.06em; font-weight: 700;
    padding: 2px 8px; border-radius: 999px; background: rgba(255,255,255,0.14); border: 1px solid var(--crm-side-line); color: #fff;
}
.crm-nav { display: flex; flex-direction: column; gap: 4px; }
.crm-nav-label { font-size: 0.66rem; letter-spacing: 0.08em; text-transform: uppercase; opacity: 0.6; padding: 12px 12px 4px; }
.crm-item {
    display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 10px;
    color: var(--crm-side-text); text-decoration: none; font-weight: 600; font-size: 0.88rem;
    border: 1px solid transparent; position: relative;
}
a.crm-item:hover { background: rgba(255,255,255,0.08); }
.crm-item.is-current { background: rgba(255,255,255,0.14); border-color: rgba(255,255,255,0.28); color: #fff; }
.crm-item.is-done .crm-ico { color: #00FF88; }
.crm-item.is-locked { opacity: 0.42; cursor: default; }
.crm-item.is-here::before {
    content: ''; position: absolute; left: -14px; top: 8px; bottom: 8px; width: 4px;
    border-radius: 0 4px 4px 0; background: #FFD700;
}
.crm-ico { width: 22px; text-align: center; flex-shrink: 0; }
.crm-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.crm-badge {
    font-size: 0.68rem; font-weight: 800; padding: 2px 8px; border-radius: 999px;
    background: #FFD700; color: #050a1a; flex-shrink: 0;
}
.crm-degraded {
    font-size: 0.74rem; background: rgba(255,51,51,0.18); border: 1px solid rgba(255,51,51,0.4);
    border-radius: 8px; padding: 8px 10px; color: #fff;
}
.crm-degraded a { color: #FFD700; font-weight: 700; }

.crm-user { margin-top: auto; border-top: 1px solid var(--crm-side-line); padding-top: 14px; display: flex; flex-direction: column; gap: 10px; }
.crm-user-row { display: flex; align-items: center; gap: 10px; padding: 0 6px; min-width: 0; }
.crm-user-row .crm-avatar { background: rgba(255,255,255,0.18); }
.crm-user-name { color: #fff; font-weight: 700; font-size: 0.85rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.crm-user-email { font-size: 0.72rem; opacity: 0.75; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.crm-sidebtn {
    display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%;
    padding: 10px 12px; border-radius: 10px; font-weight: 700; font-size: 0.84rem; cursor: pointer;
    font-family: inherit; text-decoration: none;
    background: rgba(255,255,255,0.1); border: 1px solid var(--crm-side-line); color: #fff;
}
.crm-sidebtn:hover { background: rgba(255,255,255,0.18); }
.crm-sidebtn.is-logout { background: transparent; }
.crm-foot { display: flex; flex-direction: column; gap: 6px; font-size: 0.72rem; opacity: 0.8; padding: 0 6px; }

/* ---- Backdrop y móvil ---- */
.crm-backdrop { display: none; position: fixed; inset: 0; background: rgba(5,10,26,0.6); z-index: 190; }
@media (max-width: 1023px) {
    .crm-shell.crm-mode-full { display: block; }
    .crm-hamburger { display: inline-flex; }
    .crm-sidebar {
        position: fixed; top: var(--crm-offset-top); left: 0; bottom: 0; height: auto;
        width: min(300px, 85vw); transform: translateX(-100%); transition: transform 0.25s ease;
        box-shadow: 4px 0 24px rgba(0,0,0,0.35);
    }
    .crm-shell.is-open .crm-sidebar { transform: none; }
    .crm-shell.is-open .crm-backdrop { display: block; }
    .crm-userchip .crm-user-short { display: none; }
}

/* ---- Modo rail (ruta-estudio / ruta-alineacion) ---- */
.crm-shell.crm-mode-rail .crm-sidebar {
    position: fixed; top: var(--crm-offset-top); left: 0; bottom: 0; height: auto;
    width: var(--crm-rail-w); padding: 14px 8px; gap: 10px; align-items: center;
    transition: width 0.2s ease;
}
.crm-shell.crm-mode-rail .crm-brand strong,
.crm-shell.crm-mode-rail .crm-brand small,
.crm-shell.crm-mode-rail .crm-pill,
.crm-shell.crm-mode-rail .crm-label,
.crm-shell.crm-mode-rail .crm-badge,
.crm-shell.crm-mode-rail .crm-nav-label,
.crm-shell.crm-mode-rail .crm-user,
.crm-shell.crm-mode-rail .crm-foot,
.crm-shell.crm-mode-rail .crm-degraded { display: none; }
.crm-shell.crm-mode-rail .crm-brand img { width: 36px; height: 36px; }
.crm-shell.crm-mode-rail .crm-item { padding: 8px; justify-content: center; }
.crm-shell.crm-mode-rail .crm-item.is-here::before { left: -8px; }
.crm-shell.crm-mode-rail.is-open .crm-sidebar { width: var(--crm-sidebar-w); padding: 20px 14px; align-items: stretch; }
.crm-shell.crm-mode-rail.is-open .crm-brand strong,
.crm-shell.crm-mode-rail.is-open .crm-brand small,
.crm-shell.crm-mode-rail.is-open .crm-pill,
.crm-shell.crm-mode-rail.is-open .crm-label,
.crm-shell.crm-mode-rail.is-open .crm-badge,
.crm-shell.crm-mode-rail.is-open .crm-nav-label,
.crm-shell.crm-mode-rail.is-open .crm-user,
.crm-shell.crm-mode-rail.is-open .crm-foot,
.crm-shell.crm-mode-rail.is-open .crm-degraded { display: revert; }
.crm-shell.crm-mode-rail.is-open .crm-item { justify-content: flex-start; padding: 10px 12px; }
.crm-shell.crm-mode-rail.is-open .crm-backdrop { display: block; }
.crm-expand { display: inline-flex; margin: 0 auto; }
.crm-fab {
    display: none; position: fixed; left: 14px; bottom: 14px; z-index: 210;
    width: 48px; height: 48px; border-radius: 50%; border: none; cursor: pointer;
    background: #0088FF; color: #fff; font-size: 1.3rem; box-shadow: 0 6px 20px rgba(0,0,0,0.35);
}
@media (min-width: 1024px) { body.crm-rail { padding-left: var(--crm-rail-w) !important; } }
@media (max-width: 1023px) {
    .crm-shell.crm-mode-rail .crm-sidebar { width: min(300px, 85vw); padding: 20px 14px; align-items: stretch; transform: translateX(-100%); }
    .crm-shell.crm-mode-rail.is-open .crm-sidebar { transform: none; }
    .crm-shell.crm-mode-rail .crm-expand { display: none; }
    .crm-shell.crm-mode-rail .crm-fab { display: inline-flex; align-items: center; justify-content: center; }
}

/* ---- Panel del candidato (recuperar.html) ---- */
.crm-hero {
    background: linear-gradient(135deg, #0b3aa6 0%, #0a2a6b 60%, #071c4a 100%);
    color: #fff; border-radius: 20px; padding: 28px; margin-bottom: 20px;
    box-shadow: 0 12px 40px rgba(10,42,107,0.25);
}
.crm-hero-badge {
    display: inline-flex; align-items: center; gap: 6px; font-size: 0.68rem; letter-spacing: 0.08em; font-weight: 700;
    padding: 4px 12px; border-radius: 999px; background: rgba(255,255,255,0.14); border: 1px solid rgba(255,255,255,0.3);
}
.crm-hero h1 { font-size: 1.9rem; margin: 12px 0 4px; color: #fff; }
.crm-hero-sub { opacity: 0.85; font-size: 0.95rem; }
.crm-hero-meta { display: flex; flex-wrap: wrap; gap: 14px; font-size: 0.8rem; opacity: 0.85; margin: 12px 0 18px; }
.crm-hero-actions { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 22px; }
.crm-btn {
    display: inline-flex; align-items: center; gap: 8px; padding: 12px 20px; border-radius: 12px;
    font-weight: 800; font-size: 0.92rem; text-decoration: none; cursor: pointer; border: none; font-family: inherit;
}
.crm-btn-cta { background: var(--crm-cta); color: var(--crm-cta-text); }
.crm-btn-ghost { background: rgba(255,255,255,0.12); color: #fff; border: 1px solid rgba(255,255,255,0.3); }
.crm-btn[aria-disabled="true"] { opacity: 0.55; cursor: not-allowed; }
.crm-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; }
.crm-stat { background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.18); border-radius: 14px; padding: 14px 16px; display: flex; gap: 12px; align-items: center; }
.crm-stat-ico { font-size: 1.3rem; width: 40px; height: 40px; border-radius: 10px; background: rgba(255,255,255,0.14); display: inline-flex; align-items: center; justify-content: center; }
.crm-stat-num { font-size: 1.5rem; font-weight: 800; line-height: 1; color: #fff; }
.crm-stat-lbl { font-size: 0.68rem; letter-spacing: 0.06em; text-transform: uppercase; opacity: 0.8; margin-top: 4px; }

.crm-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
@media (max-width: 767px) { .crm-grid { grid-template-columns: 1fr; } }
.crm-card { background: var(--dark-light); border: 1px solid var(--border); border-radius: 16px; padding: 20px; min-width: 0; }
.crm-card-h { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; color: var(--text-bright); font-weight: 800; font-size: 1rem; }
.crm-card-h .crm-stat-ico { background: var(--surface-2); font-size: 1.1rem; width: 36px; height: 36px; }
.crm-card-h .crm-count { margin-left: auto; font-size: 0.8rem; color: var(--text); font-weight: 600; }
.crm-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.crm-list li { display: flex; align-items: center; gap: 10px; padding: 9px 0; border-bottom: 1px solid var(--border); font-size: 0.86rem; color: var(--text); }
.crm-list li:last-child { border-bottom: none; }
.crm-list a { color: var(--primary); text-decoration: none; font-weight: 600; }
.crm-list .crm-st { width: 22px; text-align: center; flex-shrink: 0; }
.crm-list .crm-muted { font-size: 0.76rem; opacity: 0.7; }
.crm-list .crm-right { margin-left: auto; font-size: 0.78rem; white-space: nowrap; }
.crm-group-lbl { font-size: 0.68rem; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text); opacity: 0.7; padding: 10px 0 2px; }
.crm-donut { display: flex; align-items: center; gap: 20px; flex-wrap: wrap; }
.crm-donut svg { width: 150px; height: 150px; flex-shrink: 0; }
.crm-donut-num { font-size: 2rem; font-weight: 800; fill: var(--text-bright); }
.crm-donut-lbl { font-size: 0.6rem; fill: var(--text); letter-spacing: 0.06em; }
.crm-legend { display: flex; flex-direction: column; gap: 8px; font-size: 0.84rem; color: var(--text); }
.crm-legend span::before { content: ''; display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 8px; background: var(--c); vertical-align: middle; }
.crm-empty { font-size: 0.86rem; color: var(--text); padding: 6px 0; }
.crm-ok { color: var(--success); font-weight: 700; }
.crm-warn { color: var(--accent); font-weight: 700; }
```

- [ ] **Step 2: Verificar que el CSS parsea (sin llaves desbalanceadas)**

Run: `python3 -c "s=open('crm-shell.css').read(); assert s.count('{')==s.count('}'), (s.count('{'), s.count('}')); print('ok', s.count('{'), 'bloques')"`
Expected: `ok N bloques`

- [ ] **Step 3: Commit**

```bash
git add crm-shell.css
git commit -m "crm-shell.css: layout del shell CRM, sidebar, rail, tarjetas del panel y tokens de tema

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: `crm-shell.js` — helpers puros (con pruebas en Node)

Los helpers puros no tocan el DOM y se prueban con `node --test`. `crm-shell.js` debe poder cargarse en Node: todo acceso a `document`/`window` va dentro de funciones o detrás de `typeof document !== 'undefined'`.

**Files:**
- Create: `crm-shell.js`
- Create: `tests/crm-shell.test.js`

- [ ] **Step 1: Escribir las pruebas (fallan porque el módulo no existe)**

```js
// tests/crm-shell.test.js — correr con: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const CrmShell = require('../crm-shell.js');
const H = CrmShell._helpers;

test('estadoDocumento distingue subido / descargado / formulario / pendiente', () => {
    assert.equal(H.estadoDocumento(null, 'x'), 'pendiente');
    assert.equal(H.estadoDocumento({ documentosNextcloud: { x: 'Portafolios/a/b.pdf' } }, 'x'), 'subido');
    assert.equal(H.estadoDocumento({ documentosNextcloud: { x: ['Portafolios/a/b.pdf'] } }, 'x'), 'subido');
    assert.equal(H.estadoDocumento({ documentosNextcloud: { x: [] } }, 'x'), 'pendiente');
    assert.equal(H.estadoDocumento({ documentosNextcloud: { x: ['MANUAL_FORM_FALLBACK'] } }, 'x'), 'formulario');
    assert.equal(H.estadoDocumento({ documentosNextcloud: {}, documentosDescargados: { x: true } }, 'x'), 'descargado');
});

test('contarDocumentos cuenta subidos y descargados sobre las 15 claves oficiales', () => {
    const row = {
        autodiagnostico_data: { documentosNextcloud: { autodiagnostico: 'a', fichaRegistro: 'b', acuseTriptico: 'c', acuseNda: 'd' } },
        plan_evaluacion_data: { documentosNextcloud: { planEvaluacion: 'e' }, documentosDescargados: { acusePlanEvaluacion: true } },
        documentos_sesion_data: null,
        encuesta_data: { documentosNextcloud: { encuesta: ['MANUAL_FORM_FALLBACK'] } },
        evidencias_data: { documentosNextcloud: { zoom: ['z1', 'z2'], ine: 'i' } }
    };
    assert.deepEqual(H.contarDocumentos(row), { completos: 9, total: 15 }); // 4 registro + 2 plan + 0 sesión + 1 encuesta + 2 evidencias
    assert.deepEqual(H.contarDocumentos(null), { completos: 0, total: 15 });
});

test('pendientesDelPaso cuenta las claves no completas del grupo de ese paso', () => {
    const row = { evidencias_data: { documentosNextcloud: { zoom: ['z'], ine: 'i' } } };
    assert.equal(H.pendientesDelPaso(row, 'evidencias'), 2);
    assert.equal(H.pendientesDelPaso(row, 'autodiagnostico'), 4);
    assert.equal(H.pendientesDelPaso(row, 'examen'), 0);   // paso sin documentos
    assert.equal(H.pendientesDelPaso(null, 'encuesta'), 1);
});

test('faseMasAlta regresa la fase pagada más avanzada', () => {
    assert.equal(H.faseMasAlta({ registro: true, alineacion: true, evaluacion: false, entrega: false }), 'Alineación');
    assert.equal(H.faseMasAlta({ registro: true, alineacion: false, evaluacion: true, entrega: false }), 'Evaluación');
    assert.equal(H.faseMasAlta({ registro: false, alineacion: false, evaluacion: false, entrega: false }), 'Sin pago');
    assert.equal(H.faseMasAlta({ registro: true, alineacion: true, evaluacion: true, entrega: true }), 'Entrega');
});

test('tiempoRelativo en español', () => {
    const now = new Date('2026-09-15T12:00:00Z');
    assert.equal(H.tiempoRelativo('2026-09-15T11:59:40Z', now), 'hace un momento');
    assert.equal(H.tiempoRelativo('2026-09-15T11:35:00Z', now), 'hace 25 min');
    assert.equal(H.tiempoRelativo('2026-09-15T09:00:00Z', now), 'hace 3 h');
    assert.equal(H.tiempoRelativo('2026-09-13T12:00:00Z', now), 'hace 2 días');
    assert.equal(H.tiempoRelativo(null, now), 'sin sincronizar');
    assert.equal(H.tiempoRelativo('no es fecha', now), 'sin sincronizar');
});

test('iniciales usa nombre y cae al correo', () => {
    assert.equal(H.iniciales('José Fernando Villarreal', 'x@y.com'), 'JF');
    assert.equal(H.iniciales('Ana', 'x@y.com'), 'A');
    assert.equal(H.iniciales('', 'diego@paideia.com'), 'D');
    assert.equal(H.iniciales(null, null), '?');
});

test('proximaInscripcion elige la confirmada más cercana en el futuro', () => {
    const now = new Date('2026-09-15T12:00:00-06:00');
    const lista = [
        { estado: 'confirmada', sesion: { fecha: '2026-09-10', hora_inicio: '10:00', zoom_link: 'a' } },
        { estado: 'confirmada', sesion: { fecha: '2026-09-20', hora_inicio: '18:00', zoom_link: 'b' } },
        { estado: 'confirmada', sesion: { fecha: '2026-09-17', hora_inicio: '18:00', zoom_link: 'c' } },
        { estado: 'cancelada', sesion: { fecha: '2026-09-16', hora_inicio: '18:00', zoom_link: 'd' } },
        { estado: 'confirmada', sesion: null }
    ];
    assert.equal(H.proximaInscripcion(lista, now).sesion.zoom_link, 'c');
    assert.equal(H.proximaInscripcion([], now), null);
    assert.equal(H.proximaInscripcion(null, now), null);
});

test('formatoSesion produce fecha larga en español y rango de horas', () => {
    const txt = H.formatoSesion({ fecha: '2026-09-17', hora_inicio: '18:00:00', hora_fin: '19:00:00' });
    assert.match(txt, /jueves/i);
    assert.match(txt, /17/);
    assert.match(txt, /18:00/);
    assert.match(txt, /19:00/);
});

test('itemsAtencion deriva pendientes en orden: documentos (de pasos abiertos), pago, sesión', () => {
    const steps = [
        { id: 'autodiagnostico', label: 'Autodiagnóstico', href: 'autodiagnostico.html', done: true },
        { id: 'reforzamiento', label: 'Reforzamiento', href: 'reforzamiento.html', done: true },
        { id: 'alineacion', label: 'Alineación', href: 'alineacion.html', done: false, current: true },
        { id: 'plan-evaluacion', label: 'Plan de Evaluación', href: 'plan-evaluacion.html', done: false, locked: true }
    ];
    const row = { autodiagnostico_data: { documentosNextcloud: { autodiagnostico: 'a', fichaRegistro: 'b', acuseTriptico: 'c' } } };
    const fases = { registro: true, alineacion: false, evaluacion: false, entrega: false };
    const items = H.itemsAtencion({ steps, row, fases, inscripcion: null, inscripcionesOk: true });
    assert.equal(items.length, 2);
    assert.match(items[0].texto, /Acuerdo de Confidencialidad/);
    assert.equal(items[0].href, 'autodiagnostico.html');
    assert.match(items[1].texto, /Alineación/);
    assert.equal(items[1].href, 'alineacion.html');

    const fases2 = { registro: true, alineacion: true, evaluacion: false, entrega: false };
    const items2 = H.itemsAtencion({ steps, row, fases: fases2, inscripcion: null, inscripcionesOk: true });
    assert.match(items2[items2.length - 1].texto, /sesión/i);

    const items3 = H.itemsAtencion({ steps: [], row: null, fases: fases2, inscripcion: { sesion: {} }, inscripcionesOk: true });
    assert.equal(items3.length, 0);
});

test('escapeHtml neutraliza etiquetas', () => {
    assert.equal(H.escapeHtml('<b>&"'), '&lt;b&gt;&amp;&quot;');
    assert.equal(H.escapeHtml(null), '');
});
```

- [ ] **Step 2: Correr las pruebas y ver que fallan**

Run: `node --test tests/`
Expected: falla con `Cannot find module '../crm-shell.js'`.

- [ ] **Step 3: Crear `crm-shell.js` con los helpers puros y el esqueleto del módulo**

```js
/* =========================================================
   crm-shell.js — shell CRM del candidato (sidebar + encabezado + tema)
   y panel de control de recuperar.html.

   Tercera excepción deliberada a "páginas estáticas sin módulos
   compartidos" (ver Claude.md), misma justificación que auth.js y
   flow-status.js: un sidebar copiado a mano en 12 páginas se
   desincroniza. Se carga como <script src="crm-shell.js"> después de
   flow-status.js y antes del script propio de cada página.

   - Los pasos y su estado (done/current/locked) vienen SIEMPRE de
     FlowStatus.getSteps(); aquí no se decide qué cuenta como completo.
   - Los tokens de tema se inyectan inline en <head> en cuanto se parsea
     este archivo (antes del primer pintado) — salvo en modo rail
     (<script data-crm-mode="rail">), porque ruta-estudio/ruta-alineacion
     tienen tokens propios que se romperían.
   - Cargable en Node para probar los helpers puros (tests/crm-shell.test.js):
     nada de document/window a nivel de módulo sin guard.

   Spec: docs/superpowers/specs/2026-09-15-crm-shell-candidato-design.md
========================================================= */
(function () {
    'use strict';

    var THEME_KEY = 'paideia-theme';
    var FORM_FALLBACK_MARK = 'MANUAL_FORM_FALLBACK'; /* mismo valor que evidencias.html */
    var LOGO_SRC = 'Logos/Logo Paideia Tech - trimmed.png';

    /* Las 15 claves oficiales del expediente, agrupadas por la columna JSONB
       donde cada página guarda `documentosNextcloud` (ver spec, tabla de
       "Documentos del expediente"). `paso` = id del paso del flujo que las
       genera (para el badge de pendientes del sidebar y "Requieren atención"). */
    var DOC_GRUPOS = [
        { fase: 'Registro', col: 'autodiagnostico_data', paso: 'autodiagnostico', href: 'autodiagnostico.html', claves: [
            ['autodiagnostico', 'Autodiagnóstico EC1375'], ['fichaRegistro', 'Ficha de Registro RENAP'],
            ['acuseTriptico', 'Acuse de Recibido — Tríptico'], ['acuseNda', 'Acuerdo de Confidencialidad'] ] },
        { fase: 'Alineación', col: 'plan_evaluacion_data', paso: 'plan-evaluacion', href: 'plan-evaluacion.html', claves: [
            ['planEvaluacion', 'Plan de Evaluación'], ['acusePlanEvaluacion', 'Acuse — Plan de Evaluación'] ] },
        { fase: 'Evaluación', col: 'documentos_sesion_data', paso: 'documentos-sesion', href: 'documentos-sesion.html', claves: [
            ['ficha', 'Ficha de Registro del paciente'], ['consentimiento', 'Carta de Consentimiento'],
            ['plan_sesion', 'Plan de Sesión'], ['plan_seguimiento', 'Plan de Seguimiento'] ] },
        { fase: 'Evaluación', col: 'encuesta_data', paso: 'encuesta', href: 'encuesta-satisfaccion.html', claves: [
            ['encuesta', 'Encuesta de Satisfacción'] ] },
        { fase: 'Evaluación', col: 'evidencias_data', paso: 'evidencias', href: 'evidencias.html', claves: [
            ['zoom', 'Capturas de Zoom'], ['ine', 'INE'], ['curp', 'CURP'], ['fotoDiploma', 'Foto para el diploma'] ] }
    ];
    var TOTAL_DOCS = DOC_GRUPOS.reduce(function (n, g) { return n + g.claves.length; }, 0); /* = 15 */

    /* Fases de pago en orden, con la página que ya cobra cada una (Registro se
       paga antes de tener cuenta, no tiene página interna). */
    var FASES = [
        { id: 'registro', label: 'Registro', pct: '15%', href: null },
        { id: 'alineacion', label: 'Alineación', pct: '30%', href: 'alineacion.html' },
        { id: 'evaluacion', label: 'Evaluación', pct: '40%', href: 'plan-evaluacion.html' },
        { id: 'entrega', label: 'Entrega', pct: '15%', href: 'entrega.html' }
    ];

    /* Qué fase de pago exige cada paso del flujo (la misma que gatea cada
       página; solo se usa para "Requieren atención"). */
    var FASE_DEL_PASO = {
        'alineacion': 'alineacion', 'plan-evaluacion': 'alineacion',
        'documentos-sesion': 'evaluacion', 'practica': 'evaluacion', 'examen': 'evaluacion',
        'encuesta': 'evaluacion', 'evidencias': 'evaluacion', 'entrega': 'entrega'
    };

    var ICONOS = {
        'panel': '🏠', 'autodiagnostico': '📋', 'reforzamiento': '📚', 'alineacion': '🎓', 'plan-evaluacion': '📅',
        'documentos-sesion': '🗂️', 'practica': '🧪', 'examen': '🧠', 'encuesta': '📝', 'evidencias': '📤', 'entrega': '🏆'
    };

    /* ---------- helpers puros (probados en Node) ---------- */

    function escapeHtml(str) {
        if (str === null || str === undefined) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function estadoDocumento(jsonb, clave) {
        if (!jsonb) return 'pendiente';
        var nc = jsonb.documentosNextcloud || {};
        var val = nc[clave];
        if (Array.isArray(val)) {
            if (val.indexOf(FORM_FALLBACK_MARK) !== -1) return 'formulario';
            if (val.length > 0) return 'subido';
        } else if (val) {
            return val === FORM_FALLBACK_MARK ? 'formulario' : 'subido';
        }
        var desc = jsonb.documentosDescargados || {};
        if (desc[clave]) return 'descargado';
        return 'pendiente';
    }

    /* "Completo" = subido O descargado O enviado por formulario alterno — el
       mismo criterio que _flowDocumentosCompletos en flow-status.js (que
       acepta subido-o-descargado; el fallback de evidencias.html se guarda
       como subido con la marca). */
    function esCompleto(estado) { return estado !== 'pendiente'; }

    function contarDocumentos(row) {
        var completos = 0;
        DOC_GRUPOS.forEach(function (g) {
            var jsonb = row ? row[g.col] : null;
            g.claves.forEach(function (c) { if (esCompleto(estadoDocumento(jsonb, c[0]))) completos++; });
        });
        return { completos: completos, total: TOTAL_DOCS };
    }

    function pendientesDelPaso(row, pasoId) {
        var n = 0;
        DOC_GRUPOS.forEach(function (g) {
            if (g.paso !== pasoId) return;
            var jsonb = row ? row[g.col] : null;
            g.claves.forEach(function (c) { if (!esCompleto(estadoDocumento(jsonb, c[0]))) n++; });
        });
        return n;
    }

    function faseMasAlta(fases) {
        var label = 'Sin pago';
        FASES.forEach(function (f) { if (fases && fases[f.id]) label = f.label; });
        return label;
    }

    function tiempoRelativo(iso, now) {
        if (!iso) return 'sin sincronizar';
        var t = new Date(iso).getTime();
        if (isNaN(t)) return 'sin sincronizar';
        var diff = Math.max(0, (now || new Date()).getTime() - t);
        var min = Math.floor(diff / 60000);
        if (min < 1) return 'hace un momento';
        if (min < 60) return 'hace ' + min + ' min';
        var h = Math.floor(min / 60);
        if (h < 24) return 'hace ' + h + ' h';
        var d = Math.floor(h / 24);
        return 'hace ' + d + (d === 1 ? ' día' : ' días');
    }

    function iniciales(nombre, email) {
        var src = (nombre || '').trim();
        if (src) {
            var partes = src.split(/\s+/).filter(Boolean);
            return partes.slice(0, 2).map(function (p) { return p.charAt(0).toUpperCase(); }).join('');
        }
        if (email) return email.charAt(0).toUpperCase();
        return '?';
    }

    /* Fecha+hora de la sesión en hora de México. `fecha` viene como
       'YYYY-MM-DD' y `hora_inicio` como 'HH:MM[:SS]' (columnas de
       sesiones_alineacion). Se arma con el offset -06:00 explícito para no
       depender de la zona del navegador (mismo criterio que
       api/enviar-recordatorios.js: siempre hora de México). */
    function fechaSesion(sesion) {
        if (!sesion || !sesion.fecha) return null;
        var hora = (sesion.hora_inicio || '00:00').slice(0, 5);
        var d = new Date(sesion.fecha + 'T' + hora + ':00-06:00');
        return isNaN(d.getTime()) ? null : d;
    }

    function proximaInscripcion(lista, now) {
        if (!Array.isArray(lista)) return null;
        var ahora = (now || new Date()).getTime();
        var mejor = null, mejorT = Infinity;
        lista.forEach(function (i) {
            if (!i || i.estado !== 'confirmada' || !i.sesion) return; /* `estado` = como lo regresa api/mis-inscripciones-alineacion.js */
            var d = fechaSesion(i.sesion);
            if (!d) return;
            var t = d.getTime();
            if (t >= ahora - 3600000 && t < mejorT) { mejor = i; mejorT = t; } /* tolera 1h de sesión ya iniciada */
        });
        return mejor;
    }

    function formatoSesion(sesion) {
        var d = fechaSesion(sesion);
        if (!d) return '';
        var fecha = d.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Mexico_City' });
        var ini = (sesion.hora_inicio || '').slice(0, 5);
        var fin = (sesion.hora_fin || '').slice(0, 5);
        return fecha + ' · ' + ini + (fin ? ' – ' + fin : '') + ' h';
    }

    function itemsAtencion(ctx) {
        var items = [];
        var steps = ctx.steps || [];
        var current = null;
        steps.forEach(function (s) { if (s.current) current = s; });

        /* 1. Documentos pendientes de cualquier paso ya abierto (done o
           current — nunca de pasos bloqueados). Un paso puede estar "done"
           por sus respuestas (ej. Autodiagnóstico: 142 respuestas + NDA) y
           aun así tener un PDF sin subir que bloquea la página siguiente. */
        var abiertos = {};
        steps.forEach(function (s) { if (!s.locked) abiertos[s.id] = true; });
        DOC_GRUPOS.forEach(function (g) {
            if (!abiertos[g.paso]) return;
            var jsonb = ctx.row ? ctx.row[g.col] : null;
            g.claves.forEach(function (c) {
                if (!esCompleto(estadoDocumento(jsonb, c[0]))) {
                    items.push({ tipo: 'documento', texto: 'Falta subir: ' + c[1], href: g.href });
                }
            });
        });
        /* 2. Fase de pago que exige el paso actual y no está pagada */
        if (current && FASE_DEL_PASO[current.id] && !(ctx.fases && ctx.fases[FASE_DEL_PASO[current.id]])) {
            var fase = null;
            FASES.forEach(function (f) { if (f.id === FASE_DEL_PASO[current.id]) fase = f; });
            if (fase) items.push({ tipo: 'pago', texto: 'Pago pendiente de la fase ' + fase.label + ' (' + fase.pct + ')', href: fase.href || current.href });
        }
        /* 3. Sesión de Alineación sin reservar (solo si Alineación está pagada y el paso no está hecho) */
        var alineacionStep = null;
        steps.forEach(function (s) { if (s.id === 'alineacion') alineacionStep = s; });
        var alineacionPagada = !!(ctx.fases && ctx.fases.alineacion);
        var alineacionHecha = !!(alineacionStep && alineacionStep.done);
        if (alineacionPagada && !alineacionHecha && ctx.inscripcionesOk && !ctx.inscripcion) {
            items.push({ tipo: 'sesion', texto: 'Reserva tu sesión en vivo de Alineación', href: 'alineacion.html' });
        }
        return items;
    }

    /* ---------- módulo ---------- */

    var CrmShell = {
        _helpers: {
            escapeHtml: escapeHtml, estadoDocumento: estadoDocumento, contarDocumentos: contarDocumentos,
            pendientesDelPaso: pendientesDelPaso, faseMasAlta: faseMasAlta, tiempoRelativo: tiempoRelativo,
            iniciales: iniciales, proximaInscripcion: proximaInscripcion, formatoSesion: formatoSesion,
            itemsAtencion: itemsAtencion, fechaSesion: fechaSesion
        },
        DOC_GRUPOS: DOC_GRUPOS,
        FASES: FASES
        /* applyTheme / toggleTheme / mount / renderDashboard se agregan en las Tareas 3 y 4 */
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = CrmShell;
    if (typeof window !== 'undefined') window.CrmShell = CrmShell;
})();
```

- [ ] **Step 4: Correr las pruebas y ver que pasan**

Run: `node --test tests/`
Expected: `# pass 10` y `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add crm-shell.js tests/crm-shell.test.js
git commit -m "crm-shell.js: helpers puros del shell CRM (documentos, fases, sesión, atención) con pruebas en Node

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: `crm-shell.js` — tema, `mount()` (full y rail) y sidebar

**Files:**
- Modify: `crm-shell.js` (dentro del IIFE, antes de `var CrmShell = {`, y agregando métodos al objeto)

- [ ] **Step 1: Agregar los tokens de tema y `applyTheme`/`toggleTheme`**

Insertar justo después de la línea `var ICONOS = { ... };`:

```js
    /* ---------- tema ---------- */

    /* Los mismos 9 tokens que todas las páginas del flujo definen en :root
       (valores oscuros = los actuales, sin cambio) + --border/--surface-2.
       html[data-theme] (0,1,1) le gana al :root (0,1,0) de cada página. */
    var THEME_CSS =
        'html[data-theme="light"]{--dark:#f4f6fb;--dark-light:#ffffff;--primary:#0070e0;--primary-light:#0088FF;' +
        '--accent:#c9950a;--text:#3d4663;--text-bright:#0f1428;--danger:#d32020;--success:#0a9a5a;' +
        '--border:rgba(15,20,40,0.12);--surface-2:rgba(15,20,40,0.04);color-scheme:light}' +
        'html[data-theme="dark"]{--dark:#050a1a;--dark-light:#0f1428;--primary:#0088FF;--primary-light:#00CCFF;' +
        '--accent:#FFD700;--text:#D0D0D0;--text-bright:#FFFFFF;--danger:#FF3333;--success:#00FF88;' +
        '--border:rgba(255,255,255,0.12);--surface-2:rgba(255,255,255,0.05);color-scheme:dark}';

    function leerTema() {
        try {
            var t = localStorage.getItem(THEME_KEY);
            return t === 'dark' ? 'dark' : 'light';
        } catch (e) { return 'light'; }
    }

    function applyTheme(tema) {
        if (typeof document === 'undefined') return;
        var t = tema || leerTema();
        document.documentElement.setAttribute('data-theme', t);
        var botones = document.querySelectorAll('[data-crm-theme-btn]');
        Array.prototype.forEach.call(botones, function (b) {
            b.textContent = t === 'dark' ? (b.dataset.crmThemeBtn === 'icon' ? '☀️' : '☀️ Modo claro')
                                          : (b.dataset.crmThemeBtn === 'icon' ? '🌙' : '🌙 Modo oscuro');
            b.setAttribute('aria-label', t === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro');
        });
        return t;
    }

    function toggleTheme() {
        var nuevo = leerTema() === 'dark' ? 'light' : 'dark';
        try { localStorage.setItem(THEME_KEY, nuevo); } catch (e) { /* modo privado: solo esta carga */ }
        applyTheme(nuevo);
    }

    /* Modo declarado en la etiqueta <script data-crm-mode="rail">. En rail
       no se inyectan tokens (ruta-estudio/ruta-alineacion tienen los suyos). */
    var SCRIPT_MODE = 'full';
    if (typeof document !== 'undefined') {
        var cs = document.currentScript;
        if (cs && cs.dataset && cs.dataset.crmMode === 'rail') SCRIPT_MODE = 'rail';
        if (SCRIPT_MODE === 'full') {
            var st = document.createElement('style');
            st.id = 'crmThemeTokens';
            st.textContent = THEME_CSS;
            document.head.appendChild(st);
            applyTheme();
        }
        var link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'crm-shell.css';
        document.head.appendChild(link);
    }
```

- [ ] **Step 2: Agregar la construcción del sidebar/encabezado y `mount()`**

Insertar justo antes de `var CrmShell = {`:

```js
    /* ---------- DOM: sidebar, encabezado, mount ---------- */

    function stepsSinEstado() {
        var meta = (typeof FLOW_STEPS_META !== 'undefined') ? FLOW_STEPS_META : [];
        return meta.map(function (m) { return { id: m.id, label: m.label, href: m.href, done: false, current: false, locked: false, reason: null }; });
    }

    function itemHtml(step, currentPageId, degraded) {
        var ico = ICONOS[step.id] || '•';
        var cls = 'crm-item';
        var isHere = step.id === currentPageId;
        if (isHere) cls += ' is-here';
        var title = '';
        if (!degraded) {
            if (step.done) { cls += ' is-done'; ico = '✓'; }
            else if (step.current) cls += ' is-current';
            else if (step.locked) {
                cls += ' is-locked'; ico = '🔒';
                title = step.reason === 'esperando_evaluador' ? 'Esperando el resultado de tu evaluador' : 'Completa el paso anterior primero';
            }
        }
        var inner = '<span class="crm-ico">' + ico + '</span><span class="crm-label">' + escapeHtml(step.label) + '</span>' +
                    '<span class="crm-badge" data-crm-badge="' + escapeHtml(step.id) + '" hidden></span>';
        if (!degraded && step.locked) {
            return '<span class="' + cls + '" title="' + escapeHtml(title) + '">' + inner + '</span>';
        }
        return '<a class="' + cls + '" href="' + escapeHtml(step.href) + '" title="' + escapeHtml(step.label) + '">' + inner + '</a>';
    }

    function sidebarHtml(steps, currentPageId, mode, degraded) {
        var panelCls = 'crm-item' + (currentPageId === 'panel' ? ' is-current is-here' : '');
        return '' +
            '<div class="crm-brand"><img src="' + LOGO_SRC + '" alt="Paideia Tech"><div>' +
                '<strong>Paideia Tech</strong><small>Certificación EC1375</small><span class="crm-pill">SEP · CONOCER</span></div></div>' +
            (mode === 'rail' ? '<button type="button" class="crm-iconbtn crm-expand" data-crm-expand aria-label="Expandir menú">☰</button>' : '') +
            (degraded ? '<div class="crm-degraded">No pudimos cargar tu progreso · <a href="#" data-crm-retry>reintentar</a></div>' : '') +
            '<nav class="crm-nav" aria-label="Pasos de tu certificación">' +
                '<a class="' + panelCls + '" href="recuperar.html" title="Panel"><span class="crm-ico">' + ICONOS.panel + '</span><span class="crm-label">Panel</span></a>' +
                steps.map(function (s) { return itemHtml(s, currentPageId, degraded); }).join('') +
                '<div class="crm-nav-label">Recursos</div>' +
                '<a class="crm-item" href="biblioteca.html" title="Biblioteca"><span class="crm-ico">📖</span><span class="crm-label">Biblioteca</span></a>' +
                '<a class="crm-item" href="guion-maestro.html" title="Guion Maestro"><span class="crm-ico">📜</span><span class="crm-label">Guion Maestro</span></a>' +
            '</nav>' +
            '<div class="crm-user">' +
                '<div class="crm-user-row"><span class="crm-avatar" data-crm-avatar>?</span><div style="min-width:0;">' +
                    '<div class="crm-user-name" data-crm-name>Cargando…</div><div class="crm-user-email" data-crm-email></div></div></div>' +
                '<button type="button" class="crm-sidebtn" data-crm-theme-btn="text">🌙 Modo oscuro</button>' +
                '<button type="button" class="crm-sidebtn is-logout" data-crm-logout>⎋ Cerrar sesión</button>' +
            '</div>' +
            '<div class="crm-foot"><span>🗂️ Expediente digital</span><span>🔒 Datos protegidos</span><span>🏛️ Certificación oficial SEP-CONOCER</span></div>';
    }

    function headerHtml(title) {
        return '' +
            '<button type="button" class="crm-iconbtn crm-hamburger" data-crm-open aria-label="Abrir menú">☰</button>' +
            '<div class="crm-topbar-title">' + escapeHtml(title) + '</div>' +
            '<button type="button" class="crm-iconbtn" data-crm-theme-btn="icon" title="Cambiar tema">🌙</button>' +
            '<div class="crm-userchip"><span class="crm-avatar" data-crm-avatar>?</span><span class="crm-user-short" data-crm-name-short></span></div>';
    }

    function syncOffset() {
        var bar = document.getElementById('adminBypassBar');
        var h = bar ? bar.getBoundingClientRect().height : 0;
        document.documentElement.style.setProperty('--crm-offset-top', Math.round(h) + 'px');
    }

    function setOpen(shell, abierto) {
        shell.classList.toggle('is-open', !!abierto);
    }

    function rellenarUsuario(shell, row) {
        var email = '';
        try { email = (typeof Auth !== 'undefined' && Auth._session && Auth._session.user && Auth._session.user.email) || ''; } catch (e) { /* ignore */ }
        var nombre = row && row.nombre ? row.nombre : '';
        var ini = iniciales(nombre, email);
        Array.prototype.forEach.call(shell.querySelectorAll('[data-crm-avatar]'), function (el) { el.textContent = ini; });
        Array.prototype.forEach.call(shell.querySelectorAll('[data-crm-name]'), function (el) { el.textContent = nombre || (email ? email.split('@')[0] : 'Candidato/a'); });
        Array.prototype.forEach.call(shell.querySelectorAll('[data-crm-name-short]'), function (el) { el.textContent = (nombre || email).split(/\s+/)[0] || ''; });
        Array.prototype.forEach.call(shell.querySelectorAll('[data-crm-email]'), function (el) { el.textContent = email; });
    }

    function rellenarBadges(shell, steps, row) {
        steps.forEach(function (s) {
            if (!s.current) return;
            var n = pendientesDelPaso(row, s.id);
            var b = shell.querySelector('[data-crm-badge="' + s.id + '"]');
            if (b && n > 0) { b.textContent = String(n); b.hidden = false; }
        });
    }

    function mount(opts) {
        if (typeof document === 'undefined') return null;
        opts = opts || {};
        if (document.getElementById('crmShell')) return document.getElementById('crmShell');

        var mode = opts.mode === 'rail' ? 'rail' : 'full';
        var degraded = !!opts.degraded || !Array.isArray(opts.steps) || opts.steps.length === 0;
        var steps = degraded ? stepsSinEstado() : opts.steps;
        var currentPageId = opts.currentPageId || '';

        document.body.classList.add('crm-active', 'crm-' + mode);

        var shell = document.createElement('div');
        shell.id = 'crmShell';
        shell.className = 'crm-shell crm-mode-' + mode;

        var sidebar = document.createElement('aside');
        sidebar.className = 'crm-sidebar';
        sidebar.innerHTML = sidebarHtml(steps, currentPageId, mode, degraded);

        var backdrop = document.createElement('div');
        backdrop.className = 'crm-backdrop';

        shell.appendChild(sidebar);
        shell.appendChild(backdrop);

        if (mode === 'full') {
            var main = document.createElement('main');
            main.className = 'crm-main';
            var topBarInner = document.querySelector('.top-bar .top-bar-inner');
            var title = opts.title || (topBarInner ? topBarInner.textContent.trim() : document.title);
            var header = document.createElement('header');
            header.className = 'crm-topbar';
            header.innerHTML = headerHtml(title);
            main.appendChild(header);
            /* Mover TODO el contenido actual del body (top-bar, #app, barras
               fijas, nav-bar…) sin clonar — los listeners y el estado de los
               wizards viven en esos mismos nodos. Se dejan fuera los <script>
               y la barra de admin (fija arriba, la mide syncOffset). */
            var hijos = Array.prototype.slice.call(document.body.childNodes);
            hijos.forEach(function (n) {
                if (n.nodeType === 1 && (n.id === 'adminBypassBar' || n.tagName === 'SCRIPT')) return;
                main.appendChild(n);
            });
            shell.appendChild(main);
        } else {
            var fab = document.createElement('button');
            fab.type = 'button';
            fab.className = 'crm-fab';
            fab.setAttribute('aria-label', 'Abrir menú');
            fab.textContent = '☰';
            fab.setAttribute('data-crm-open', '');
            shell.appendChild(fab);
        }

        document.body.appendChild(shell);

        /* interacción */
        shell.addEventListener('click', function (ev) {
            var t = ev.target.closest ? ev.target.closest('[data-crm-open],[data-crm-expand],[data-crm-theme-btn],[data-crm-logout],[data-crm-retry],.crm-backdrop,.crm-nav a') : null;
            if (!t) return;
            if (t.hasAttribute('data-crm-open') || t.hasAttribute('data-crm-expand')) { setOpen(shell, !shell.classList.contains('is-open')); return; }
            if (t.classList.contains('crm-backdrop')) { setOpen(shell, false); return; }
            if (t.hasAttribute('data-crm-theme-btn')) { toggleTheme(); return; }
            if (t.hasAttribute('data-crm-retry')) { ev.preventDefault(); location.reload(); return; }
            if (t.hasAttribute('data-crm-logout')) {
                ev.preventDefault();
                var p = (typeof Auth !== 'undefined' && Auth.signOut) ? Auth.signOut() : Promise.resolve();
                Promise.resolve(p).then(function () { location.href = 'recuperar.html'; });
                return;
            }
            if (t.matches('.crm-nav a')) setOpen(shell, false);
        });
        document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') setOpen(shell, false); });

        syncOffset();
        window.addEventListener('resize', syncOffset);
        applyTheme();

        /* usuario y badges: la fila puede venir en opts.row; si no, se consulta */
        var rowPromise = opts.row ? Promise.resolve(opts.row)
            : ((typeof Auth !== 'undefined' && Auth.pullMyRow) ? Auth.pullMyRow().catch(function () { return null; }) : Promise.resolve(null));
        rellenarUsuario(shell, opts.row || null);
        rowPromise.then(function (row) {
            rellenarUsuario(shell, row);
            if (!degraded) rellenarBadges(shell, steps, row);
        });

        return shell;
    }
```

- [ ] **Step 3: Exponer los métodos en el objeto `CrmShell`**

Reemplazar el bloque:
```js
        DOC_GRUPOS: DOC_GRUPOS,
        FASES: FASES
        /* applyTheme / toggleTheme / mount / renderDashboard se agregan en las Tareas 3 y 4 */
    };
```
por:
```js
        DOC_GRUPOS: DOC_GRUPOS,
        FASES: FASES,
        applyTheme: applyTheme,
        toggleTheme: toggleTheme,
        mount: mount
        /* renderDashboard se agrega en la Tarea 4 */
    };
```

- [ ] **Step 4: Verificar sintaxis y que las pruebas siguen pasando**

Run: `node --check crm-shell.js && node --test tests/`
Expected: sin errores de sintaxis; `# pass 10`, `# fail 0`.

- [ ] **Step 5: Prueba de humo en navegador con una página de prueba temporal**

Crear `smoke-crm.html` en la raíz del repo (debe servirse desde ahí para que resuelva `crm-shell.css`, `auth.js`, etc.; se borra en el Step 7):

```html
<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>smoke crm</title>
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script src="auth.js"></script>
<script src="flow-status.js"></script>
<script src="crm-shell.js"></script>
<style>
:root { --dark:#050a1a; --dark-light:#0f1428; --primary:#0088FF; --primary-light:#00CCFF; --accent:#FFD700; --text:#D0D0D0; --text-bright:#FFFFFF; --danger:#FF3333; --success:#00FF88; --border:rgba(255,255,255,0.12); --surface-2:rgba(255,255,255,0.05); }
body { margin:0; background: var(--dark); color: var(--text); font-family: sans-serif; }
.top-bar { position: sticky; top: 0; background: var(--dark); padding: 16px 20px; }
.container { max-width: 560px; margin: 0 auto; padding: 24px; }
.card { background: var(--dark-light); border: 1px solid var(--border); border-radius: 12px; padding: 20px; }
</style></head>
<body>
<div class="top-bar"><div class="top-bar-inner">🧪 Página de humo</div></div>
<div class="container" id="app"><div class="card">Contenido de prueba — debe seguir aquí después de mount().</div></div>
<script>
const steps = FLOW_STEPS_META.map((m, i) => ({ ...m, done: i < 2, current: i === 2, locked: i > 2, reason: i === 9 ? 'esperando_evaluador' : 'paso_anterior_pendiente' }));
CrmShell.mount({ currentPageId: 'alineacion', steps, row: { nombre: 'Prueba Humo', evidencias_data: null } });
</script>
</body></html>
```

Levantar el servidor (background): `python3 -m http.server 8080` desde la raíz del repo. Con Playwright (`mcp__playwright__browser_navigate` a `http://localhost:8080/smoke-crm.html`, `mcp__playwright__browser_snapshot`, `mcp__playwright__browser_console_messages`):
- El snapshot muestra `navigation "Pasos de tu certificación"` con 10 items + Panel + Biblioteca + Guion Maestro, "Alineación" marcado como link actual, "Plan de Evaluación" como texto (bloqueado, no link).
- El texto "Contenido de prueba — debe seguir aquí" sigue presente.
- Consola sin errores (los warnings de Supabase por no tener sesión son aceptables).
- `mcp__playwright__browser_click` en el botón "🌙 Modo oscuro" → `mcp__playwright__browser_evaluate` con `() => document.documentElement.dataset.theme` regresa `"dark"`; recargar → sigue `"dark"` (localStorage). Volver a clic → `"light"`.
- `mcp__playwright__browser_resize` a 390×844: el sidebar no está visible; clic en el botón "Abrir menú" → visible; tecla Escape (`mcp__playwright__browser_press_key` `Escape`) → oculto.
- `mcp__playwright__browser_take_screenshot` en 1280 y 390 y revisarlas: sidebar azul a la izquierda, encabezado con título "🧪 Página de humo", tarjeta centrada.

- [ ] **Step 6: Corregir lo que salga de la prueba de humo** (si algo falla, arreglar en `crm-shell.js`/`crm-shell.css` y repetir el Step 5; no continuar con nada roto).

- [ ] **Step 7: Borrar la página de humo y commit**

```bash
rm smoke-crm.html
git add crm-shell.js
git commit -m "crm-shell.js: tema claro/oscuro, mount() en modo full y rail, sidebar con estado de los 10 pasos

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: `crm-shell.js` — `renderDashboard()` y `recuperar.html` como panel

**Files:**
- Modify: `crm-shell.js`
- Modify: `recuperar.html`

- [ ] **Step 1: Agregar `renderDashboard` a `crm-shell.js`**

Insertar justo antes de `var CrmShell = {`:

```js
    /* ---------- panel del candidato (recuperar.html) ---------- */

    function donutSvg(steps) {
        var total = steps.length || 1;
        var done = steps.filter(function (s) { return s.done; }).length;
        var cur = steps.filter(function (s) { return s.current; }).length;
        var r = 54, c = 2 * Math.PI * r;
        var segs = [
            { n: done, color: 'var(--success)' },
            { n: cur, color: 'var(--primary)' },
            { n: total - done - cur, color: 'var(--border)' }
        ];
        var offset = 0, paths = '';
        segs.forEach(function (s) {
            var len = c * (s.n / total);
            paths += '<circle r="' + r + '" cx="75" cy="75" fill="none" stroke="' + s.color + '" stroke-width="16" ' +
                     'stroke-dasharray="' + len + ' ' + (c - len) + '" stroke-dashoffset="' + (-offset) + '" transform="rotate(-90 75 75)"></circle>';
            offset += len;
        });
        return '<svg viewBox="0 0 150 150" role="img" aria-label="' + done + ' de ' + total + ' pasos completados">' + paths +
               '<text x="75" y="80" text-anchor="middle" class="crm-donut-num">' + done + '</text>' +
               '<text x="75" y="98" text-anchor="middle" class="crm-donut-lbl">DE ' + total + ' PASOS</text></svg>';
    }

    function estadoDocHtml(estado) {
        return estado === 'subido' ? '<span class="crm-st" title="Subido a tu expediente">✅</span>'
             : estado === 'descargado' ? '<span class="crm-st" title="Descargado (pendiente de subir)">⬇️</span>'
             : estado === 'formulario' ? '<span class="crm-st" title="Enviado por formulario alterno">📨</span>'
             : '<span class="crm-st" title="Pendiente">⏳</span>';
    }

    function card(icono, titulo, cuerpo, extraH) {
        return '<section class="crm-card"><div class="crm-card-h"><span class="crm-stat-ico">' + icono + '</span>' +
               escapeHtml(titulo) + (extraH || '') + '</div>' + cuerpo + '</section>';
    }

    /* data = { nombre, steps, row, fases: {registro,alineacion,evaluacion,entrega},
                inscripciones: array | null (null = falló la consulta), onRetryInscripciones: fn } */
    function renderDashboard(container, data) {
        var steps = data.steps || [];
        var row = data.row || null;
        var fases = data.fases || {};
        var current = null, entrega = null;
        steps.forEach(function (s) { if (s.current) current = s; if (s.id === 'entrega') entrega = s; });
        var done = steps.filter(function (s) { return s.done; }).length;
        var docs = contarDocumentos(row);
        var inscripcionesOk = Array.isArray(data.inscripciones);
        var proxima = inscripcionesOk ? proximaInscripcion(data.inscripciones) : null;
        var nombre = data.nombre || 'candidato/a';
        var certificado = !!(entrega && entrega.done);

        /* hero */
        var ctaHtml = current
            ? '<a class="crm-btn crm-btn-cta" href="' + escapeHtml(current.href) + '">Continuar: ' + escapeHtml(current.label) + ' →</a>'
            : '<span class="crm-btn crm-btn-cta" aria-disabled="true">' + (certificado ? '🏆 Certificación completada' : '⏳ Esperando a tu evaluador') + '</span>';
        var hero =
            '<div class="crm-hero">' +
              '<span class="crm-hero-badge">' + (certificado ? '🏆 CERTIFICADO ENTREGADO' : '📡 CERTIFICACIÓN EN CURSO') + '</span>' +
              '<h1>Hola, ' + escapeHtml(nombre) + '</h1>' +
              '<div class="crm-hero-sub">Tu panel de certificación EC1375</div>' +
              '<div class="crm-hero-meta"><span>🔒 Datos protegidos</span><span>☁️ Expediente en la nube</span>' +
                '<span>🔄 ' + (row && row.updated_at ? 'Sincronizado ' + tiempoRelativo(row.updated_at) : 'Sin datos sincronizados aún') + '</span></div>' +
              '<div class="crm-hero-actions">' + ctaHtml + '<a class="crm-btn crm-btn-ghost" href="#crmDocs">📄 Ver mis documentos</a></div>' +
              '<div class="crm-stats">' +
                '<div class="crm-stat"><span class="crm-stat-ico">✅</span><div><div class="crm-stat-num">' + done + ' / ' + steps.length + '</div><div class="crm-stat-lbl">Pasos completados</div></div></div>' +
                '<div class="crm-stat"><span class="crm-stat-ico">📄</span><div><div class="crm-stat-num">' + docs.completos + ' / ' + docs.total + '</div><div class="crm-stat-lbl">Documentos</div></div></div>' +
                '<div class="crm-stat"><span class="crm-stat-ico">💳</span><div><div class="crm-stat-num" style="font-size:1.1rem;">' + escapeHtml(faseMasAlta(fases)) + '</div><div class="crm-stat-lbl">Fase pagada</div></div></div>' +
                '<div class="crm-stat"><span class="crm-stat-ico">🎓</span><div><div class="crm-stat-num" style="font-size:1.1rem;">' +
                    (!inscripcionesOk ? '—' : proxima ? escapeHtml(new Date(fechaSesion(proxima.sesion)).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', timeZone: 'America/Mexico_City' })) : 'Sin reservar') +
                    '</div><div class="crm-stat-lbl">Próxima sesión</div></div></div>' +
              '</div>' +
            '</div>';

        /* 1. progreso */
        var progreso = card('📊', 'Tu progreso',
            '<div class="crm-donut">' + donutSvg(steps) +
            '<div class="crm-legend"><span style="--c:var(--success)">Completados · ' + done + '</span>' +
            '<span style="--c:var(--primary)">En curso · ' + (current ? 1 : 0) + '</span>' +
            '<span style="--c:var(--border)">Por desbloquear · ' + (steps.length - done - (current ? 1 : 0)) + '</span></div></div>');

        /* 2. ruta */
        var ruta = card('🗺️', 'Ruta de certificación', '<ul class="crm-list">' + steps.map(function (s) {
            var ico = s.done ? '✓' : s.current ? '▶' : '🔒';
            var motivo = s.locked ? (s.reason === 'esperando_evaluador' ? 'Esperando el resultado de tu evaluador' : 'Completa el paso anterior primero') : '';
            var label = s.locked ? escapeHtml(s.label) : '<a href="' + escapeHtml(s.href) + '">' + escapeHtml(s.label) + '</a>';
            return '<li' + (s.locked ? ' style="opacity:0.55"' : '') + '><span class="crm-st" style="color:' + (s.done ? 'var(--success)' : s.current ? 'var(--primary)' : 'inherit') + '">' + ico + '</span>' +
                   '<span>' + label + (motivo ? '<div class="crm-muted">' + motivo + '</div>' : '') + '</span></li>';
        }).join('') + '</ul>');

        /* 3. documentos */
        var docsHtml = DOC_GRUPOS.map(function (g) {
            var jsonb = row ? row[g.col] : null;
            return '<div class="crm-group-lbl">' + escapeHtml(g.fase) + '</div>' + g.claves.map(function (c) {
                var est = estadoDocumento(jsonb, c[0]);
                return '<li>' + estadoDocHtml(est) + '<span>' + escapeHtml(c[1]) + '</span>' +
                       '<span class="crm-right">' + (est === 'pendiente' ? '<a href="' + g.href + '">Generar</a>' : '<span class="crm-muted">' + est + '</span>') + '</span></li>';
            }).join('');
        }).join('');
        var documentos = '<div id="crmDocs">' + card('📄', 'Documentos del expediente', '<ul class="crm-list">' + docsHtml + '</ul>',
            '<span class="crm-count">' + docs.completos + ' / ' + docs.total + '</span>') + '</div>';

        /* 4. pagos */
        var primeraPendiente = null;
        FASES.forEach(function (f) { if (!primeraPendiente && !fases[f.id]) primeraPendiente = f; });
        var pagos = card('💳', 'Pagos por fase', '<ul class="crm-list">' + FASES.map(function (f) {
            var pagada = !!fases[f.id];
            var accion = (!pagada && primeraPendiente && primeraPendiente.id === f.id && f.href) ? '<a href="' + f.href + '">Pagar →</a>'
                       : pagada ? '<span class="crm-ok">Pagado</span>' : '<span class="crm-muted">Pendiente</span>';
            return '<li><span class="crm-st">' + (pagada ? '✅' : '⏳') + '</span><span>' + escapeHtml(f.label) + ' <span class="crm-muted">· ' + f.pct + '</span></span><span class="crm-right">' + accion + '</span></li>';
        }).join('') + '</ul>');

        /* 5. sesión de alineación */
        var sesionBody;
        if (!inscripcionesOk) {
            sesionBody = '<p class="crm-empty">No pudimos cargar tu sesión. <a href="#" data-crm-retry-inscripciones style="color:var(--primary);font-weight:700;">Reintentar</a></p>';
        } else if (proxima) {
            var s = proxima.sesion;
            sesionBody = '<p class="crm-empty"><strong style="color:var(--text-bright);">' + escapeHtml(formatoSesion(s)) + '</strong>' +
                         (s.instructor_nombre ? '<div class="crm-muted">Con ' + escapeHtml(s.instructor_nombre) + '</div>' : '') + '</p>' +
                         (s.zoom_link ? '<a class="crm-btn crm-btn-cta" style="margin-top:8px;" href="' + escapeHtml(s.zoom_link) + '" target="_blank" rel="noopener">🎥 Entrar a Zoom</a>' : '');
        } else if (fases.alineacion) {
            sesionBody = '<p class="crm-empty">Aún no has reservado tu sesión en vivo.</p><a class="crm-btn crm-btn-cta" style="margin-top:8px;" href="alineacion.html">📅 Reservar sesión</a>';
        } else {
            sesionBody = '<p class="crm-empty">La reserva de tu sesión en vivo se habilita al pagar la fase de Alineación.</p>';
        }
        var sesion = card('🎓', 'Sesión de Alineación', sesionBody);

        /* 6. atención */
        var items = itemsAtencion({ steps: steps, row: row, fases: fases, inscripcion: proxima, inscripcionesOk: inscripcionesOk });
        var atencion = card('🔔', 'Requieren atención', items.length
            ? '<ul class="crm-list">' + items.map(function (it) {
                return '<li><span class="crm-st">' + (it.tipo === 'pago' ? '💳' : it.tipo === 'sesion' ? '🎓' : '📄') + '</span><a href="' + escapeHtml(it.href) + '">' + escapeHtml(it.texto) + '</a></li>';
              }).join('') + '</ul>'
            : '<p class="crm-empty crm-ok">Todo en orden ✨</p>',
            '<span class="crm-count">' + items.length + '</span>');

        container.innerHTML = hero + '<div class="crm-grid">' + progreso + ruta + documentos + pagos + sesion + atencion + '</div>';

        var retry = container.querySelector('[data-crm-retry-inscripciones]');
        if (retry && typeof data.onRetryInscripciones === 'function') {
            retry.addEventListener('click', function (ev) { ev.preventDefault(); data.onRetryInscripciones(); });
        }
    }
```

Y en el objeto `CrmShell`, reemplazar:
```js
        mount: mount
        /* renderDashboard se agrega en la Tarea 4 */
    };
```
por:
```js
        mount: mount,
        renderDashboard: renderDashboard
    };
```

- [ ] **Step 2: Verificar sintaxis y pruebas**

Run: `node --check crm-shell.js && node --test tests/`
Expected: sin errores; `# pass 10`.

- [ ] **Step 3: Reescribir `recuperar.html`**

Reemplazar el archivo completo por:

```html
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="icon" href="favicon.ico" sizes="any">
    <link rel="icon" href="favicon-32x32.png" type="image/png" sizes="32x32">
    <link rel="icon" href="favicon-16x16.png" type="image/png" sizes="16x16">
    <link rel="apple-touch-icon" href="apple-touch-icon.png">
    <title>Panel - EC1375 Paideia Tech</title>
    <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
    <script src="auth.js"></script>
    <script src="flow-status.js"></script>
    <script src="crm-shell.js"></script>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        :root {
            --dark: #050a1a; --dark-light: #0f1428; --primary: #0088FF; --primary-light: #00CCFF;
            --accent: #FFD700; --text: #D0D0D0; --text-bright: #FFFFFF; --danger: #FF3333; --success: #00FF88;
            --border: rgba(255,255,255,0.12); --surface-2: rgba(255,255,255,0.05);
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: var(--dark);
            color: var(--text); line-height: 1.6; min-height: 100vh; padding-bottom: 60px;
        }
        .container { max-width: 560px; margin: 0 auto; padding: 24px 20px; }
        .container.is-panel { max-width: 1100px; }
        .top-bar {
            position: sticky; top: 0; background: var(--dark);
            border-bottom: 1px solid var(--dark-light); padding: 16px 20px; z-index: 100;
        }
        .top-bar-inner { max-width: 560px; margin: 0 auto; font-size: 0.95rem; color: var(--text-bright); font-weight: 700; }
        body.crm-active .top-bar { display: none; }   /* el encabezado del shell lo reemplaza */
        .hero { text-align: center; padding: 30px 0; }
        .hero-icon { font-size: 3rem; margin-bottom: 14px; }
        .hero-title { font-size: 1.6rem; font-weight: 700; color: var(--text-bright); margin-bottom: 10px; }
        .hero-subtitle { font-size: 0.95rem; color: var(--text); }
        .card { background: var(--dark-light); border: 1px solid var(--border); border-radius: 12px; padding: 24px; margin-bottom: 20px; }
        .field-group { margin-bottom: 16px; }
        .field-group label { display: block; font-size: 0.85rem; color: var(--text); margin-bottom: 6px; font-weight: 600; }
        .field-group input {
            width: 100%; padding: 14px; background: var(--dark);
            border: 1px solid var(--border); border-radius: 8px;
            color: var(--text-bright); font-size: 1rem; font-family: inherit;
        }
        .btn {
            padding: 15px 24px; border-radius: 8px; font-weight: 700; font-size: 0.95rem;
            border: none; cursor: pointer; transition: all 0.3s ease; text-align: center; text-decoration: none;
            display: block;
        }
        .btn-primary { background: var(--primary); color: white; }
        .btn-primary:hover { background: var(--primary-light); }
        .btn-primary:disabled { background: var(--surface-2); color: var(--text); opacity: 0.6; cursor: not-allowed; }
        .btn-secondary { background: transparent; border: 2px solid var(--primary); color: var(--primary); margin-top: 10px; }
        .btn-full { width: 100%; }
        .msg { font-size: 0.88rem; margin-top: 14px; text-align: center; }
        .msg.error { color: var(--danger); }
        .msg.success { color: var(--success); }
        .spinner { text-align: center; color: var(--text); font-size: 0.88rem; }
    </style>
</head>
<body>
    <div class="top-bar"><div class="top-bar-inner">🔐 Iniciar sesión</div></div>
    <div class="container" id="app"></div>

    <script>
    function render() {
        document.getElementById('app').innerHTML = `
            <div class="hero">
                <div class="hero-icon">🔐</div>
                <h1 class="hero-title">Inicia sesión</h1>
                <p class="hero-subtitle">Verifica tu correo para continuar tu proceso en este dispositivo</p>
            </div>
            <div class="card" id="authGateContainer"></div>
        `;
        Auth.renderAuthGate(document.getElementById('authGateContainer'), { onVerified: handleVerified });
    }

    const FASES_PAGO = ['registro', 'alineacion', 'evaluacion', 'entrega'];

    /* Misma llamada que sesiones-alineacion-component.js. Regresa null si la
       API falla (en local, sin Vercel, siempre falla — esperado). */
    async function cargarInscripciones(email) {
        try {
            const resp = await fetch(`/api/mis-inscripciones-alineacion?email=${encodeURIComponent(email)}`);
            if (!resp.ok) return null;
            const data = await resp.json();
            return Array.isArray(data.inscripciones) ? data.inscripciones : [];
        } catch (e) {
            console.warn('No se pudieron cargar tus inscripciones:', e);
            return null;
        }
    }

    async function handleVerified(session) {
        const app = document.getElementById('app');
        if (await Auth.isBypassSession()) {
            Auth.ensureAdminPlaceholderData();
            Auth.renderAdminBar();
        }
        app.innerHTML = `<p class="spinner">Cargando tu panel...</p>`;
        const email = session.user.email;

        const [rowR, stepsR, fasesR, inscR] = await Promise.allSettled([
            Auth.pullMyRow(),
            FlowStatus.getSteps(),
            Promise.all(FASES_PAGO.map(f => Auth.isPhaseAuthorized(email, f))),
            cargarInscripciones(email)
        ]);
        const row = rowR.status === 'fulfilled' ? rowR.value : null;
        const steps = stepsR.status === 'fulfilled' ? stepsR.value : null;
        const fases = {};
        FASES_PAGO.forEach((f, i) => { fases[f] = fasesR.status === 'fulfilled' ? !!fasesR.value[i] : false; });
        let inscripciones = inscR.status === 'fulfilled' ? inscR.value : null;
        if (stepsR.status === 'rejected') console.warn('No se pudo calcular tu progreso:', stepsR.reason);

        app.classList.add('is-panel');
        CrmShell.mount({ currentPageId: 'panel', steps: steps || [], degraded: !steps, row, title: 'Panel de control' });

        const pintar = () => CrmShell.renderDashboard(app, {
            nombre: row && row.nombre ? row.nombre : 'candidato/a',
            steps: steps || [],
            row, fases, inscripciones,
            onRetryInscripciones: async () => { inscripciones = await cargarInscripciones(email); pintar(); }
        });
        pintar();
    }

    render();
    </script>
</body>
</html>
```

- [ ] **Step 4: Verificar en navegador (servidor local en :8080, Playwright)**

1. Navegar a `http://localhost:8080/recuperar.html`. Snapshot: se ve el gate de login centrado, SIN sidebar, fondo claro (`document.documentElement.dataset.theme === 'light'`).
2. Iniciar sesión con la cuenta bypass (correo → "ya tengo contraseña" → contraseña de Diego).
3. Snapshot tras cargar: existe `navigation "Pasos de tu certificación"`; el heading "Hola, …"; los 4 stats ("Pasos completados", "Documentos", "Fase pagada", "Próxima sesión"); las 6 tarjetas ("Tu progreso", "Ruta de certificación", "Documentos del expediente", "Pagos por fase", "Sesión de Alineación", "Requieren atención"). La tarjeta de sesión muestra "No pudimos cargar tu sesión" (esperado en local) y la cifra "Próxima sesión" muestra "—".
4. `mcp__playwright__browser_evaluate`: `() => { const s = [...document.querySelectorAll('.crm-nav a.is-current')]; return s.map(a => a.textContent.trim()) }` → incluye "Panel" y el paso `current`; y `() => document.querySelector('.crm-hero-actions a.crm-btn-cta').getAttribute('href')` === el `href` del paso `current` (comparar con `await FlowStatus.getSteps()` evaluado en la página).
5. La barra `#adminBypassBar` sigue visible arriba y el sidebar empieza debajo de ella: `() => getComputedStyle(document.documentElement).getPropertyValue('--crm-offset-top')` ≈ alto de la barra (> 30px).
6. Consola: cero errores (warnings de la API de inscripciones aceptables).
7. Screenshots a 1280 y 390 → revisarlas.

- [ ] **Step 5: Commit**

```bash
git add crm-shell.js recuperar.html
git commit -m "recuperar.html: panel de control tipo CRM (hero, cifras, progreso, documentos, pagos, sesión, atención)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Montar el shell en las 8 páginas del flujo y retirar `renderProgressBar`

**Files:**
- Modify: `flow-status.js` (eliminar `renderProgressBar`, líneas ~122-152)
- Modify: `alineacion.html`, `plan-evaluacion.html`, `documentos-sesion.html`, `encuesta-satisfaccion.html`, `evidencias.html`, `entrega.html`, `examen-conocimientos.html`, `autodiagnostico.html`

- [ ] **Step 1: Agregar `<script src="crm-shell.js"></script>` inmediatamente después de `<script src="flow-status.js"></script>` en las 8 páginas**

Run (hace el cambio y lo verifica):
```bash
for f in alineacion plan-evaluacion documentos-sesion encuesta-satisfaccion evidencias entrega examen-conocimientos autodiagnostico; do
  python3 - "$f.html" <<'EOF'
import sys
p=sys.argv[1]; s=open(p,encoding='utf-8').read()
old='<script src="flow-status.js"></script>'
assert s.count(old)==1, p
s=s.replace(old, old+'\n    <script src="crm-shell.js"></script>',1)
open(p,'w',encoding='utf-8').write(s)
EOF
done
grep -c 'crm-shell.js' alineacion.html plan-evaluacion.html documentos-sesion.html encuesta-satisfaccion.html evidencias.html entrega.html examen-conocimientos.html autodiagnostico.html
```
Expected: cada archivo reporta `1`.

- [ ] **Step 2: Reemplazar la llamada a `renderProgressBar` por `CrmShell.mount` en las 8 páginas**

Cada página tiene exactamente una línea `FlowStatus.renderProgressBar(flowSteps, '<id>');`. Reemplazarla por `CrmShell.mount({ currentPageId: '<id>', steps: flowSteps });` conservando el id:

```bash
for f in alineacion plan-evaluacion documentos-sesion encuesta-satisfaccion evidencias entrega examen-conocimientos autodiagnostico; do
  python3 - "$f.html" <<'EOF'
import sys,re
p=sys.argv[1]; s=open(p,encoding='utf-8').read()
pat=re.compile(r"FlowStatus\.renderProgressBar\(flowSteps, '([a-z-]+)'\);")
assert len(pat.findall(s))==1, (p, pat.findall(s))
s=pat.sub(lambda m: "CrmShell.mount({ currentPageId: '%s', steps: flowSteps });" % m.group(1), s)
open(p,'w',encoding='utf-8').write(s)
EOF
done
grep -n "renderProgressBar" *.html | grep -v ruta-estudio
```
Expected: la última línea no imprime nada (solo `ruta-estudio.html` sigue llamándola; se cambia en la Tarea 7).

- [ ] **Step 3: Eliminar `renderProgressBar` de `flow-status.js`**

Borrar desde el comentario `/* Barra compacta, siempre visible, en las 10 páginas del flujo —` hasta la línea `},` que cierra `renderProgressBar` (justo antes del comentario `/* Botón "siguiente paso" — SIEMPRE calculado`). Verificar:

```bash
python3 - <<'EOF'
s=open('flow-status.js',encoding='utf-8').read()
a=s.index('    /* Barra compacta, siempre visible')
b=s.index('    /* Botón "siguiente paso"')
s=s[:a]+s[b:]
open('flow-status.js','w',encoding='utf-8').write(s)
EOF
node --check flow-status.js && grep -c "renderProgressBar" flow-status.js
```
Expected: `0`.

En el archivo no hay comentario de cabecera que liste los métodos, así que no hay más que actualizar ahí; la sección "Progreso del candidato" de Claude.md se ajusta en la Tarea 10.

- [ ] **Step 4: Verificar en navegador cada una de las 8 páginas (sesión bypass ya iniciada en la Tarea 4)**

Para cada URL en `alineacion.html`, `plan-evaluacion.html`, `documentos-sesion.html`, `encuesta-satisfaccion.html`, `evidencias.html`, `entrega.html`, `examen-conocimientos.html`, `autodiagnostico.html` (en `http://localhost:8080/`):
1. Navegar, esperar a que aparezca el sidebar (`mcp__playwright__browser_wait_for` con `text: "Guion Maestro"`).
2. `browser_evaluate`: `() => ({ app: !!document.querySelector('.crm-main #app'), here: document.querySelector('.crm-nav .is-here')?.textContent.trim(), theme: document.documentElement.dataset.theme })` → `app: true`, `here` = el label del paso de esa página, `theme: 'light'`.
3. Consola sin errores nuevos (comparar con los que ya daba la página antes del cambio si hay duda: `git stash` no aplica aquí — usar juicio: cualquier error que mencione `crm`, `CrmShell`, `renderProgressBar` o `null` en el shell es de este cambio).
4. Páginas con barra fija inferior — `documentos-sesion.html` (`.nav-bar`, aparece al entrar al wizard), `examen-conocimientos.html` (`.sticky-submit`), `autodiagnostico.html` (`.nav-bar`, aparece en el cuestionario): a 1280px, `browser_evaluate` `() => getComputedStyle(document.querySelector('.nav-bar, .sticky-submit')).left` === `'260px'` cuando el elemento existe y es visible.
5. Screenshot a 1280 y a 390 de `autodiagnostico.html` y `documentos-sesion.html` (los wizards más densos) → revisar que el contenido no quede tapado por el encabezado del shell ni por el sidebar.

- [ ] **Step 5: Commit**

```bash
git add flow-status.js alineacion.html plan-evaluacion.html documentos-sesion.html encuesta-satisfaccion.html evidencias.html entrega.html examen-conocimientos.html autodiagnostico.html
git commit -m "Shell CRM en las 8 páginas del flujo; retira FlowStatus.renderProgressBar (reemplazada por CrmShell.mount)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: `guion-maestro.html` con shell

Hoy solo carga `auth.js` y no usa `FlowStatus`. Se le agregan `flow-status.js` + `crm-shell.js` y un `mount` cuando el guion se muestra (sesión + fase Evaluación pagada).

**Files:**
- Modify: `guion-maestro.html:11-12` (scripts) y la función `render()` (~línea 535)

- [ ] **Step 1: Scripts**

Reemplazar:
```html
    <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
    <script src="auth.js"></script>
```
por:
```html
    <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
    <script src="auth.js"></script>
    <script src="flow-status.js"></script>
    <script src="crm-shell.js"></script>
```

- [ ] **Step 2: Montar el shell al final de `render()`**

Reemplazar:
```js
        app.innerHTML = renderGuionContent();
        applyChecklistState();
    }
```
por:
```js
        app.innerHTML = renderGuionContent();
        applyChecklistState();

        /* Shell CRM: el guion es recurso de la fase de Evaluación; se marca
           "estás aquí" en Plan de Evaluación (desde donde se enlaza). */
        try {
            const flowSteps = await FlowStatus.getSteps();
            CrmShell.mount({ currentPageId: 'plan-evaluacion', steps: flowSteps, title: '📜 Guion Maestro' });
        } catch (e) {
            console.warn('No se pudo calcular el progreso para el shell:', e);
            CrmShell.mount({ currentPageId: 'plan-evaluacion', steps: [], degraded: true, title: '📜 Guion Maestro' });
        }
    }
```

- [ ] **Step 3: Verificar** — navegar a `http://localhost:8080/guion-maestro.html` con la sesión bypass: sidebar presente, título "📜 Guion Maestro", el item "Guion Maestro" de Recursos es link, consola sin errores. Screenshot 1280.

- [ ] **Step 4: Commit**

```bash
git add guion-maestro.html
git commit -m "guion-maestro.html: carga flow-status.js y monta el shell CRM

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Modo rail en `ruta-estudio.html` y `ruta-alineacion.html`

**Files:**
- Modify: `ruta-estudio.html:6` (script) y `:4570` (llamada)
- Modify: `ruta-alineacion.html:3` (scripts en `<head>`) y antes de `</body>` (línea ~1570)

⚠️ Las pantallas 1–57 de `ruta-alineacion.html` y el motor de `ruta-estudio.html` NO se tocan (se regeneran desde el pipeline externo de Diego). Solo se agregan etiquetas `<script>`. Si Diego regenera esas páginas, hay que volver a aplicar esta tarea (igual que ya pasa con el Módulo 7 y las ligas de compra — documentado en Claude.md).

- [ ] **Step 1: `ruta-estudio.html`**

Reemplazar (línea 6):
```html
<script src="flow-status.js"></script>
```
por:
```html
<script src="flow-status.js"></script>
<script src="crm-shell.js" data-crm-mode="rail"></script>
```
Y reemplazar:
```js
      FlowStatus.renderProgressBar(flowSteps, flowStepId);
```
por:
```js
      CrmShell.mount({ mode: 'rail', currentPageId: flowStepId, steps: flowSteps });
```
Verificar: `grep -n "renderProgressBar" *.html *.js` no imprime nada.

- [ ] **Step 2: `ruta-alineacion.html`**

Después de la línea `<head>` (línea 3) insertar:
```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script src="auth.js"></script>
<script src="flow-status.js"></script>
<script src="crm-shell.js" data-crm-mode="rail"></script>
```
Y justo antes de `</body>` (línea ~1570) insertar:
```html
<script>
/* Rail del shell CRM — solo con sesión iniciada. Sin sesión la página se
   muestra tal cual (también se usa como material abierto en la sesión en
   vivo). Agregado a mano: si esta página se regenera desde el pipeline
   externo, volver a insertar este bloque y los 4 <script> del <head>. */
(async function () {
    try {
        var session = await Auth.getSession();
        if (!session) return;
        var steps = await FlowStatus.getSteps();
        CrmShell.mount({ mode: 'rail', currentPageId: 'alineacion', steps: steps });
    } catch (e) { console.warn('Rail CRM no disponible:', e); }
})();
</script>
```

- [ ] **Step 3: Verificar en navegador**

1. `http://localhost:8080/ruta-estudio.html?boot=remedial` (sesión bypass): a 1280px existe `.crm-shell.crm-mode-rail`, `browser_evaluate` `() => getComputedStyle(document.body).paddingLeft` === `'64px'`, `() => document.documentElement.dataset.theme` es `undefined`/`null` (en rail no se aplica tema — los colores del motor no cambian); clic en "Expandir menú" → el sidebar mide 260px (`() => document.querySelector('.crm-sidebar').getBoundingClientRect().width`); Escape lo colapsa. El motor navega igual (clic en cualquier control interno del motor sigue funcionando).
2. Mismo en 390px: no hay rail (`paddingLeft` `'0px'`), sí hay botón flotante `.crm-fab`; clic → sidebar visible.
3. `http://localhost:8080/ruta-alineacion.html` con sesión: rail presente con "Alineación" marcado como "estás aquí". En una pestaña sin sesión (`mcp__playwright__browser_tabs` nueva + `localStorage.clear()` antes de navegar, o cerrar sesión): sin rail, la presentación se ve exactamente igual que antes.
4. Consola sin errores.

- [ ] **Step 4: Commit**

```bash
git add ruta-estudio.html ruta-alineacion.html
git commit -m "Rail del shell CRM en ruta-estudio y ruta-alineacion (sin tocar su contenido generado)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Tema claro — tokens `--border`/`--surface-2` y reemplazo de colores hardcodeados en 10 páginas

Páginas: `alineacion`, `plan-evaluacion`, `documentos-sesion`, `encuesta-satisfaccion`, `evidencias`, `entrega`, `examen-conocimientos`, `autodiagnostico`, `guion-maestro`, `recuperar` (esta última ya trae los tokens desde la Tarea 4; el script la salta si ya los tiene).

**Files:**
- Modify: los 10 `.html` de arriba (solo bloques `<style>` y atributos `style=""`)

- [ ] **Step 1: Correr el script de reemplazo (solo toca CSS, nunca JS)**

```bash
python3 - <<'EOF'
import re
PAGES=['alineacion','plan-evaluacion','documentos-sesion','encuesta-satisfaccion','evidencias','entrega','examen-conocimientos','autodiagnostico','guion-maestro','recuperar']
def fix_css(css):
    css=re.sub(r'rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*0?\.0[3-7]\s*\)', 'var(--surface-2)', css)
    css=re.sub(r'rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*0?\.(08|1|10|12|15|18|2|20)\s*\)', 'var(--border)', css)
    css=css.replace('linear-gradient(135deg, var(--dark) 0%, #0a1530 100%)', 'var(--dark)')
    return css
for name in PAGES:
    p=name+'.html'; s=open(p,encoding='utf-8').read(); orig=s
    # 1. tokens nuevos en :root (solo si faltan)
    if '--border' not in s.split('</head>')[0]:
        s=re.sub(r'(:root\s*\{[^}]*?)(\s*\})', lambda m: m.group(1)+'\n            --border: rgba(255,255,255,0.12); --surface-2: rgba(255,255,255,0.05);'+m.group(2), s, count=1)
    # 2. bloques <style>
    s=re.sub(r'(<style[^>]*>)(.*?)(</style>)', lambda m: m.group(1)+fix_css(m.group(2))+m.group(3), s, flags=re.S)
    # 3. atributos style="..." (incluye los que están dentro de template strings de JS: son HTML que se pinta)
    s=re.sub(r'style="([^"]*)"', lambda m: 'style="'+fix_css(m.group(1))+'"', s)
    if s!=orig:
        open(p,'w',encoding='utf-8').write(s); print('modificado', p)
    else: print('sin cambios', p)
EOF
git diff --stat
```
Expected: 9–10 archivos modificados; ningún cambio fuera de CSS/`style=""` (revisar con `git diff` que no haya tocado código de jsPDF: `git diff | grep -n "setFillColor\|setTextColor\|fillColor" ` no debe imprimir nada).

- [ ] **Step 2: Revisar a mano lo que el script no cubre**

```bash
for f in alineacion plan-evaluacion documentos-sesion encuesta-satisfaccion evidencias entrega examen-conocimientos autodiagnostico guion-maestro recuperar; do
  echo "== $f"; python3 - "$f.html" <<'EOF'
import re,sys
s=open(sys.argv[1],encoding='utf-8').read()
head=s.split('</head>')[0]
styles="".join(re.findall(r'<style[^>]*>(.*?)</style>',head,re.S))
root=re.search(r':root\s*\{([^}]*)\}',styles).group(1)
for i,l in enumerate(styles.splitlines(),1):
    if re.search(r'rgba\(\s*255,\s*255,\s*255',l) or (re.search(r'#[0-9a-fA-F]{3,6}\b',l) and l.strip() not in root):
        print('  css:',l.strip()[:120])
for m in re.finditer(r'style="([^"]*rgba\(\s*255,\s*255,\s*255[^"]*)"',s): print('  inline:',m.group(1)[:120])
EOF
done
```
Para cada línea impresa decidir:
- `rgba(255,255,255,0.3–0.6)` usado como color de texto tenue → `var(--text)` (y si hace falta `opacity: 0.7`).
- Hex de FONDO o BORDE (ej. `#0a1530`, `#1a2340`) → `var(--dark-light)` / `var(--border)` según el caso.
- Hex SEMÁNTICO (`#00FF88`, `#FF3333`, `#FFD700`, `#0088FF`) → `var(--success)` / `var(--danger)` / `var(--accent)` / `var(--primary)`.
- Hex dentro de `.top-bar`, `.progress-*`, `.nav-bar` → token equivalente.
Editar con `Edit` línea por línea. Meta: que la lista quede vacía salvo excepciones justificadas (ej. colores de un overlay de video, del canvas de firma — `#000` en `strokeStyle` es JS, no CSS, y NO aparece en esta lista).

- [ ] **Step 3: Verificar en navegador, tema claro, las 10 páginas**

Con sesión bypass y `localStorage['paideia-theme']` sin fijar (light):
1. Para cada página, screenshot a 1280 y revisar: fondo claro `#f4f6fb`, tarjetas blancas con borde visible, texto oscuro legible, botones primarios azules con texto blanco, ningún texto blanco sobre blanco. `browser_evaluate`: `() => [...document.querySelectorAll('.crm-main *')].filter(e => { const c = getComputedStyle(e); return c.color === 'rgb(255, 255, 255)' && c.backgroundColor === 'rgba(0, 0, 0, 0)' && e.children.length === 0 && e.textContent.trim(); }).slice(0,10).map(e => e.tagName + ':' + e.textContent.trim().slice(0,40))` → lista vacía (texto blanco sin fondo propio = invisible en claro). Si sale algo, corregir ese selector en la página.
2. Cambiar a oscuro con el toggle: screenshot → idéntico en estructura al aspecto anterior al proyecto (fondo `#050a1a`).
3. `autodiagnostico.html` y `documentos-sesion.html`: avanzar 2 pantallas del wizard en tema claro → inputs legibles (fondo `var(--dark)` = `#f4f6fb` con borde `--border`), botones Atrás/Siguiente visibles.

- [ ] **Step 4: PDF idéntico en ambos temas**

En `encuesta-satisfaccion.html` (sesión bypass; el placeholder ya deja pasar el gate): contestar las 7 preguntas, firmar (arrastrar en el canvas con `mcp__playwright__browser_drag` o `browser_run_code_unsafe` disparando eventos de puntero) y generar el PDF en tema claro; repetir en tema oscuro. Comparar los dos archivos descargados: `python3 -c "import hashlib,sys;print([hashlib.md5(open(f,'rb').read()).hexdigest() for f in sys.argv[1:]])" a.pdf b.pdf` — los PDF llevan timestamp así que el hash puede diferir; en ese caso comparar visualmente la página 1 renderizada (`pdftoppm` si está instalado, o abrir ambos con `Read`) y confirmar que colores/tablas son idénticos.

- [ ] **Step 5: Commit**

```bash
git add alineacion.html plan-evaluacion.html documentos-sesion.html encuesta-satisfaccion.html evidencias.html entrega.html examen-conocimientos.html autodiagnostico.html guion-maestro.html recuperar.html
git commit -m "Tema claro: tokens --border/--surface-2 y reemplazo de colores hardcodeados en las 10 páginas del flujo

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Matriz de verificación final en local (móvil, hamburguesa, cuenta bypass, sin sesión)

**Files:** ninguno (solo verificación; si algo falla, corregir en el archivo que corresponda y hacer commit con mensaje `fix: …`).

- [ ] **Step 1: Sin sesión** — en un contexto limpio (`localStorage.clear()` + `sessionStorage.clear()` y recargar): `alineacion.html`, `evidencias.html`, `recuperar.html` muestran su gate/bloqueo como antes, sin sidebar (`document.getElementById('crmShell') === null`), en tema claro.

- [ ] **Step 2: Móvil 390×844, sesión bypass** — en `recuperar.html`, `alineacion.html`, `autodiagnostico.html`: sidebar oculto; clic en "Abrir menú" → visible con los 10 pasos; clic en el backdrop → oculto; abrir y pulsar Escape → oculto; abrir y clic en "Panel" → navega y el sidebar llega cerrado. El `.crm-grid` del panel es de 1 columna (`getComputedStyle(document.querySelector('.crm-grid')).gridTemplateColumns` tiene un solo valor).

- [ ] **Step 3: Persistencia del tema** — fijar oscuro en `recuperar.html`, navegar a `alineacion.html` y `examen-conocimientos.html`: `dataset.theme === 'dark'` en ambas, y el screenshot en `domcontentloaded` (antes de que termine de cargar) ya es oscuro (sin flash claro): `browser_evaluate` inmediatamente tras `browser_navigate` → `'dark'`.

- [ ] **Step 4: Cerrar sesión desde el sidebar** — clic en "Cerrar sesión" → aterriza en `recuperar.html` con el gate de login; `Auth.getSession()` regresa `null`.

- [ ] **Step 5: `node --test tests/` sigue en verde y `node --check` en `crm-shell.js` y `flow-status.js`.**

- [ ] **Step 6: Commit de cualquier corrección** (si no hubo, no hay commit).

---

### Task 10: Documentación, preview en Vercel y deploy

**Files:**
- Modify: `Claude.md` (secciones "Stack", "Estructura de archivos", "Progreso del candidato", "Cambios recientes")
- Modify: `admin-index.html:83` (descripción de `recuperar.html`)

- [ ] **Step 1: `admin-index.html`** — reemplazar `desc: 'Login por OTP, continuar en otro dispositivo'` por `desc: 'Login + panel de control del candidato (shell CRM)'`.

- [ ] **Step 2: `Claude.md`**

1. En **Stack**, donde dice "Dos excepciones deliberadas: `auth.js` (...) y `flow-status.js` (...)", cambiar a "Tres excepciones deliberadas" y agregar: "y `crm-shell.js` + `crm-shell.css` (sidebar/encabezado/tema del panel tipo CRM que envuelve cada página del flujo en tiempo de ejecución — un sidebar copiado 12 veces se desincroniza). Orden de carga: `auth.js` → `flow-status.js` → `crm-shell.js` → script de la página."
2. En **Estructura de archivos**, después de la línea de `flow-status.js`, agregar:
   ```
   crm-shell.js, crm-shell.css   Shell CRM del candidato: CrmShell.mount() envuelve el DOM de la página con sidebar
                                  (10 pasos con ✓/▶/🔒 + badge de pendientes) + encabezado (hamburguesa, toggle de tema,
                                  usuario); CrmShell.renderDashboard() pinta el panel de recuperar.html. Tema claro por
                                  default con toggle a oscuro (localStorage 'paideia-theme'), vía los 9 tokens compartidos
                                  + --border/--surface-2. Modo rail (<script data-crm-mode="rail">) en ruta-estudio/
                                  ruta-alineacion: solo iconos, sin tema. Helpers puros probados con `node --test tests/`.
   tests/crm-shell.test.js       Pruebas en Node (sin dependencias) de los helpers puros de crm-shell.js
   ```
   Y actualizar la descripción de `recuperar.html` a: "Login (email+password/login-maestro) Y, una vez logueado, panel de control tipo CRM (hero con cifras: pasos/documentos/fase pagada/próxima sesión + tarjetas de progreso, ruta, documentos del expediente, pagos, sesión de Alineación y 'Requieren atención') — todo calculado de `flow-status.js`, `pullMyRow`, `isPhaseAuthorized` y `api/mis-inscripciones-alineacion`."
3. En **Progreso del candidato**, reemplazar el bullet de `FlowStatus.renderProgressBar(...)` por: "`FlowStatus.renderProgressBar` ya no existe (15 sep) — la barra de chips fue reemplazada por el sidebar de `crm-shell.js`, que consume el mismo `getSteps()`."
4. En **Cambios recientes (15 de septiembre, 2026)** agregar un bullet: "**Shell CRM del candidato + panel de control** (`crm-shell.js`/`crm-shell.css`, `recuperar.html` reescrito, `guion-maestro.html` y las 8 páginas del flujo montan el shell, `ruta-estudio`/`ruta-alineacion` en modo rail). Tema claro por default con toggle a oscuro en las 10 páginas del flujo (no en landing/quiz/retornos de pago/restablecer-password, ni en el contenido de las dos páginas generadas por pipeline). Spec: `docs/superpowers/specs/2026-09-15-crm-shell-candidato-design.md`. Proyectos siguientes acordados con Diego, en orden: `protect.js` (disuasión de copia/captura), CRM del equipo (`admin-crm.html` + RLS admin sobre `candidatos_ec1375`), contenido al servidor (tabla `contenido_ec1375` + bucket privado, sin funciones nuevas de Vercel)."
5. En **Estructura de archivos**, agregar a la línea de `ruta-alineacion.html`: "(carga `auth.js`/`flow-status.js`/`crm-shell.js` y un bloque al final para el rail — si se regenera desde el pipeline, volver a insertar, ver Tarea 7 del plan)".

- [ ] **Step 3: Commit de documentación**

```bash
git add Claude.md admin-index.html
git commit -m "Claude.md: documenta el shell CRM del candidato, el panel de recuperar.html y el tema claro/oscuro

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

- [ ] **Step 4: Preview en Vercel y prueba de la tarjeta de sesión**

Run: `vercel` (deploy de preview; el conteo de funciones no cambia — este proyecto no agrega ninguna: `find api -name "*.js" | wc -l` sigue en 12).
En la URL de preview, con la sesión bypass: `recuperar.html` → la tarjeta "Sesión de Alineación" ya NO muestra "No pudimos cargar" (muestra "Aún no has reservado…" / la sesión / "se habilita al pagar"), y la cifra "Próxima sesión" muestra fecha o "Sin reservar". Consola sin errores.

- [ ] **Step 5: Deploy a producción**

```bash
git push origin main
```
Esperar ~60s y repetir el Step 4 en `https://sepconocer.paideiatech.com/recuperar.html`. Reportar a Diego: URL, qué se verificó, y que el único pendiente fuera del código es ninguno (este proyecto no requiere cambios en Supabase).
