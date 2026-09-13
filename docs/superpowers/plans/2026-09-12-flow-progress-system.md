# Flow Progress System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A candidate on any of the 10 real flow pages always sees where they are, what's done, and what's next — via a persistent progress bar, a consistent "next step" CTA, and a full dashboard (`recuperar.html`). Plus 5 smaller gaps found while mapping the flow (missing Alineación payment gate on `plan-evaluacion.html`, exam result page not clarifying it's a self-check, stale admin bar, no completion CTA on `ruta-alineacion.html`, `ruta-estudio.html` falling into a stale internal dashboard when loaded with no `?boot=` param).

**Architecture:** One new shared module, `flow-status.js` (same precedent/justification as `auth.js`), owns the canonical 10-step list and computes each step's done/current/locked status by reusing the exact gate checks each downstream page already makes — never a new, separately-maintained condition. It exposes `getSteps()` (async, self-contained — calls `Auth.getSession()`/`Auth.pullMyRow()` itself, so callers never need to plumb `session`/`email` through), `renderProgressBar(steps)`, and `renderNextStepCTA(steps, currentStepId)`. Every flow page calls these three. `recuperar.html` is rewritten to render the full step list as a dashboard.

**Tech Stack:** Vanilla JS, static HTML, Supabase JS client v2 (via `auth.js`). No test framework in this repo — verification uses `node --check` for syntax and a throwaway Node harness (mocking `window`/`document`/`localStorage`/`Auth`) for `flow-status.js`'s logic, matching this project's established convention.

**Reference spec:** [docs/superpowers/specs/2026-09-12-flow-progress-system-design.md](../specs/2026-09-12-flow-progress-system-design.md)

All commands assume the working directory is the repo root:
`/Users/diegogarzamx/Desktop/Paideia Tech`

**Important framing for every step's "done" check:** a field that doesn't exist yet (e.g. an old Supabase row saved before this feature existed) must be treated as `false` (not done), never throw. Every check below is written defensively (`row && row.x && row.x.y`) for exactly this reason — never simplify to `row.x.y` directly.

---

### Task 1: `flow-status.js` — step list + `getSteps()`

**Files:**
- Create: `flow-status.js`
- Test: `/tmp/test-flow-status.js` (scratch harness, deleted in Task 3)

- [ ] **Step 1: Write the failing test harness**

Create `/tmp/test-flow-status.js`:

```js
// Scratch verification harness for flow-status.js — mocks window/document/
// localStorage/Auth to test getSteps() in Node without a browser.
const assert = require('assert');

let mockSessionEmail = 'candidato@example.com';
let mockRow = null;
let mockPhaseAuth = {}; // { alineacion: true/false, entrega: true/false }
let mockLocalAutodiagnostico = null;

global.localStorage = {
    getItem: (k) => (k === 'autodiagnosticoData' ? (mockLocalAutodiagnostico ? JSON.stringify(mockLocalAutodiagnostico) : null) : null)
};
global.document = {
    _byId: {},
    getElementById(id) { return this._byId[id] || null; },
    createElement(tag) { return { tagName: tag, id: '', style: {}, innerHTML: '' }; },
    body: { style: {}, prependCount: 0, prepend(el) { this.prependCount++; if (el.id) global.document._byId[el.id] = el; } }
};
global.window = {};
global.Auth = {
    async getSession() { return mockSessionEmail ? { user: { email: mockSessionEmail } } : null; },
    async pullMyRow() { return mockRow; },
    async isPhaseAuthorized(email, fase) { return !!mockPhaseAuth[fase]; }
};

require('/Users/diegogarzamx/Desktop/Paideia Tech/flow-status.js');
const FlowStatus = global.window.FlowStatus;

async function main() {
    // --- Nothing done yet (brand new candidate, no row, no local data) ---
    mockLocalAutodiagnostico = null;
    mockRow = null;
    mockPhaseAuth = {};
    let steps = await FlowStatus.getSteps();
    assert.strictEqual(steps.length, 10, 'always 10 steps');
    assert.strictEqual(steps[0].id, 'autodiagnostico');
    assert.strictEqual(steps[0].done, false, 'autodiagnostico not done with no local data');
    assert.strictEqual(steps[0].current, true, 'first incomplete step is current');
    assert.strictEqual(steps[1].locked, true, 'step 2 locked while step 1 incomplete');
    assert.strictEqual(steps[9].id, 'entrega');
    assert.strictEqual(steps[9].locked, true);
    assert.strictEqual(steps[9].reason, 'esperando_evaluador', 'entrega always uses this reason when not done');
    console.log('✓ nothing done yet');

    // --- Autodiagnóstico complete locally, nothing else ---
    mockLocalAutodiagnostico = { answers: Object.fromEntries(Array.from({length:142},(_,i)=>[`k${i}`,'SI'])), ndaAccepted: true };
    steps = await FlowStatus.getSteps();
    assert.strictEqual(steps[0].done, true, 'autodiagnostico done once 142 answers + NDA');
    assert.strictEqual(steps[1].current, true, 'reforzamiento becomes current');
    console.log('✓ autodiagnostico done unlocks reforzamiento as current');

    // --- Full row: everything done up through Evidencias, Entrega not yet authorized ---
    mockRow = {
        ruta_estudio_data: { diagnostic: { approved: true }, practice: { completed: true } },
        plan_evaluacion_data: { documentosNextcloud: { planEvaluacion: true, acusePlanEvaluacion: true } },
        documentos_sesion_data: { documentosNextcloud: { ficha: true, consentimiento: true, plan_sesion: true, plan_seguimiento: true } },
        examen_conocimientos_data: { submitted: true },
        encuesta_data: { documentosNextcloud: { encuesta: true } },
        evidencias_data: { documentosNextcloud: { zoom: ['a'], ine: true, curp: true, fotoDiploma: true } }
    };
    mockPhaseAuth = { alineacion: true, entrega: false };
    steps = await FlowStatus.getSteps();
    const byId = Object.fromEntries(steps.map(s => [s.id, s]));
    assert.strictEqual(byId['reforzamiento'].done, true);
    assert.strictEqual(byId['alineacion'].done, true, 'alineacion done = isPhaseAuthorized');
    assert.strictEqual(byId['plan-evaluacion'].done, true);
    assert.strictEqual(byId['documentos-sesion'].done, true);
    assert.strictEqual(byId['practica'].done, true);
    assert.strictEqual(byId['examen'].done, true);
    assert.strictEqual(byId['encuesta'].done, true);
    assert.strictEqual(byId['evidencias'].done, true);
    assert.strictEqual(byId['entrega'].done, false, 'entrega not authorized yet');
    assert.strictEqual(byId['entrega'].locked, true);
    assert.strictEqual(byId['entrega'].current, false, 'entrega is never "current" — it needs external authorization, not a click');
    assert.strictEqual(byId['entrega'].reason, 'esperando_evaluador');
    console.log('✓ full row up to evidencias, entrega waiting on evaluator');

    // --- Entrega authorized ---
    mockPhaseAuth.entrega = true;
    steps = await FlowStatus.getSteps();
    const entrega = steps.find(s => s.id === 'entrega');
    assert.strictEqual(entrega.done, true, 'entrega done once authorized');
    assert.strictEqual(entrega.locked, false);
    console.log('✓ entrega done once authorized');

    // --- Missing sub-fields on an old row must not throw ---
    mockRow = { ruta_estudio_data: {} }; // no .diagnostic, no .practice at all
    mockPhaseAuth = {};
    steps = await FlowStatus.getSteps();
    assert.strictEqual(steps.find(s => s.id === 'reforzamiento').done, false, 'missing sub-field treated as not done, no throw');
    assert.strictEqual(steps.find(s => s.id === 'practica').done, false);
    console.log('✓ missing sub-fields on old rows do not throw');

    console.log('\nALL TESTS PASSED');
}

main().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node /tmp/test-flow-status.js`
Expected: `Error: Cannot find module '/Users/diegogarzamx/Desktop/Paideia Tech/flow-status.js'` (the file doesn't exist yet).

- [ ] **Step 3: Create `flow-status.js`**

```js
/* =========================================================
   flow-status.js — fuente única de los 10 pasos reales del flujo de
   candidato, y de qué cuenta como "completo" en cada uno.

   Excepción deliberada a "páginas estáticas sin módulos compartidos"
   (ver Claude.md) — misma justificación que auth.js: la lista de pasos
   y el cálculo de qué está completo es exactamente el tipo de lógica
   donde una copia desincronizada entre páginas es el modo de falla a
   evitar (ya pasó dos veces esta sesión: el bug de "200%" del
   Autodiagnóstico y el bug de Reforzamiento). Se carga como
   <script src="flow-status.js"> después de auth.js (lo usa
   internamente) y antes del script propio de cada página.

   Cada condición de "completo" reutiliza el MISMO gate que la página
   siguiente del flujo ya usa para dejar pasar — nunca se inventa una
   condición nueva. Ver la tabla completa en el spec.
========================================================= */

const FLOW_STEPS_META = [
    { id: 'autodiagnostico', label: 'Autodiagnóstico', href: 'autodiagnostico.html' },
    { id: 'reforzamiento', label: 'Reforzamiento', href: 'reforzamiento.html' },
    { id: 'alineacion', label: 'Alineación', href: 'alineacion.html' },
    { id: 'plan-evaluacion', label: 'Plan de Evaluación', href: 'plan-evaluacion.html' },
    { id: 'documentos-sesion', label: 'Documentos de Sesión', href: 'documentos-sesion.html' },
    { id: 'practica', label: 'Práctica', href: 'practica.html' },
    { id: 'examen', label: 'Examen de Conocimientos', href: 'examen-conocimientos.html' },
    { id: 'encuesta', label: 'Encuesta de Satisfacción', href: 'encuesta-satisfaccion.html' },
    { id: 'evidencias', label: 'Evidencias', href: 'evidencias.html' },
    { id: 'entrega', label: 'Entrega', href: 'entrega.html' }
];

/* Copia local del mismo helper ya duplicado en alineacion.html/
   documentos-sesion.html/encuesta-satisfaccion.html/evidencias.html/
   entrega.html — no se centraliza esa duplicación existente en este
   cambio (fuera de alcance de este feature, ver spec). */
function _flowDocumentosCompletos(jsonbData, requiredKeys) {
    if (!jsonbData) return false;
    var nextcloud = jsonbData.documentosNextcloud || {};
    var descargados = jsonbData.documentosDescargados || {};
    return requiredKeys.every(function (key) {
        var val = nextcloud[key];
        var subido = Array.isArray(val) ? val.length > 0 : !!val;
        return subido || !!descargados[key];
    });
}

const FlowStatus = {
    FLOW_STEPS_META: FLOW_STEPS_META,

    async getSteps() {
        var session = await Auth.getSession();
        var email = session && session.user && session.user.email;
        var row = email ? await Auth.pullMyRow() : null;

        var localAuto = null;
        try { localAuto = JSON.parse(localStorage.getItem('autodiagnosticoData') || 'null'); } catch (e) { /* ignore */ }

        var rutaEstudio = (row && row.ruta_estudio_data) || null;
        var examen = (row && row.examen_conocimientos_data) || null;

        var alineacionAuth = false;
        var entregaAuth = false;
        if (email) {
            alineacionAuth = await Auth.isPhaseAuthorized(email, 'alineacion');
            entregaAuth = await Auth.isPhaseAuthorized(email, 'entrega');
        }

        var doneById = {
            'autodiagnostico': !!(localAuto && localAuto.answers && Object.keys(localAuto.answers).length === 142 && localAuto.ndaAccepted),
            'reforzamiento': !!(rutaEstudio && rutaEstudio.diagnostic && rutaEstudio.diagnostic.approved),
            'alineacion': alineacionAuth,
            'plan-evaluacion': _flowDocumentosCompletos(row && row.plan_evaluacion_data, ['planEvaluacion', 'acusePlanEvaluacion']),
            'documentos-sesion': _flowDocumentosCompletos(row && row.documentos_sesion_data, ['ficha', 'consentimiento', 'plan_sesion', 'plan_seguimiento']),
            'practica': !!(rutaEstudio && rutaEstudio.practice && rutaEstudio.practice.completed),
            'examen': !!(examen && examen.submitted),
            'encuesta': _flowDocumentosCompletos(row && row.encuesta_data, ['encuesta']),
            'evidencias': _flowDocumentosCompletos(row && row.evidencias_data, ['zoom', 'ine', 'curp', 'fotoDiploma']),
            'entrega': entregaAuth
        };

        var steps = FLOW_STEPS_META.map(function (meta) {
            return { id: meta.id, label: meta.label, href: meta.href, done: !!doneById[meta.id], current: false, locked: false, reason: null };
        });

        /* Entrega es un caso especial siempre: nunca es "current" (no es
           una acción que el candidato dispara con un clic — depende de
           que el equipo lo autorice a mano tras revisar su evaluación),
           y su reason siempre es 'esperando_evaluador' cuando no está
           done, sin importar el estado de los pasos anteriores. */
        var entregaStep = steps[steps.length - 1];
        if (!entregaStep.done) {
            entregaStep.locked = true;
            entregaStep.reason = 'esperando_evaluador';
        }

        var currentAssigned = false;
        for (var i = 0; i < steps.length - 1; i++) {
            var step = steps[i];
            if (step.done) continue;
            if (!currentAssigned) {
                step.current = true;
                currentAssigned = true;
            } else {
                step.locked = true;
                step.reason = 'paso_anterior_pendiente';
            }
        }

        return steps;
    }
};

window.FlowStatus = FlowStatus;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node /tmp/test-flow-status.js`
Expected:
```
✓ nothing done yet
✓ autodiagnostico done unlocks reforzamiento as current
✓ full row up to evidencias, entrega waiting on evaluator
✓ entrega done once authorized
✓ missing sub-fields on old rows do not throw

ALL TESTS PASSED
```

- [ ] **Step 5: Commit**

```bash
cd "/Users/diegogarzamx/Desktop/Paideia Tech"
node --check flow-status.js
git add flow-status.js
git commit -m "$(cat <<'EOF'
Agrega flow-status.js: fuente única de los 10 pasos del flujo

getSteps() calcula done/current/locked para los 10 pasos reales,
reutilizando los mismos gates que cada página descendiente ya usa
(documentosFaseCompletos, isPhaseAuthorized) — nunca una condición
nueva. Entrega es un caso especial: nunca "current", siempre
'esperando_evaluador' cuando no está autorizada, porque depende de
una decisión humana externa, no de un clic del candidato. Todavía no
conectado a ninguna página.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `flow-status.js` — `renderProgressBar()` and `renderNextStepCTA()`

**Files:**
- Modify: `flow-status.js`
- Test: `/tmp/test-flow-status.js`

- [ ] **Step 1: Add the failing tests**

Insert this new section into `/tmp/test-flow-status.js`, right before `console.log('\nALL TESTS PASSED');`:

```js
    // --- renderProgressBar ---
    document._byId = {};
    document.body.prependCount = 0;
    const sampleSteps = await FlowStatus.getSteps(); // reuses the "entrega authorized" state from above
    FlowStatus.renderProgressBar(sampleSteps, 'evidencias');
    assert.strictEqual(document.body.prependCount, 1, 'inserts exactly one bar');
    const bar = document._byId['flowProgressBar'];
    assert.ok(bar, 'bar registered under id flowProgressBar');
    assert.ok(bar.innerHTML.includes('Autodiagnóstico'), 'lists step labels');
    assert.ok(bar.innerHTML.includes('href="entrega.html"'), 'entrega is a real link once authorized');
    FlowStatus.renderProgressBar(sampleSteps, 'evidencias');
    assert.strictEqual(document.body.prependCount, 1, 'does not duplicate on second call');
    console.log('✓ renderProgressBar');

    // --- renderProgressBar never links to a locked Entrega ---
    mockPhaseAuth = {}; // entrega not authorized
    const stepsWaiting = await FlowStatus.getSteps();
    document._byId = {};
    document.body.prependCount = 0;
    FlowStatus.renderProgressBar(stepsWaiting, 'evidencias');
    const barWaiting = document._byId['flowProgressBar'];
    assert.ok(!barWaiting.innerHTML.includes('href="entrega.html"'), 'never renders a real link to entrega.html while locked');
    console.log('✓ renderProgressBar never links a locked Entrega');

    // --- renderNextStepCTA: normal case (next step is a real unlocked step) ---
    const mockContainer = { innerHTML: '' };
    FlowStatus.renderNextStepCTA(stepsWaiting, 'documentos-sesion', mockContainer);
    assert.ok(mockContainer.innerHTML.includes('href="practica.html"'), 'CTA points to the actual next step');
    console.log('✓ renderNextStepCTA normal case');

    // --- renderNextStepCTA: finishing evidencias while entrega still waiting ---
    mockContainer.innerHTML = '';
    FlowStatus.renderNextStepCTA(stepsWaiting, 'evidencias', mockContainer);
    assert.ok(!mockContainer.innerHTML.includes('href="entrega.html"'), 'no link to entrega while not authorized');
    assert.ok(mockContainer.innerHTML.toLowerCase().includes('evaluador'), 'shows a waiting message mentioning the evaluator');
    assert.ok(mockContainer.innerHTML.includes('href="recuperar.html"'), 'still offers a way forward: the dashboard');
    console.log('✓ renderNextStepCTA waiting-on-evaluator case');

    // --- renderNextStepCTA: finishing evidencias once entrega IS authorized ---
    mockPhaseAuth.entrega = true;
    const stepsReady = await FlowStatus.getSteps();
    mockContainer.innerHTML = '';
    FlowStatus.renderNextStepCTA(stepsReady, 'evidencias', mockContainer);
    assert.ok(mockContainer.innerHTML.includes('href="entrega.html"'), 'real link once authorized, decided by actual state not a hardcoded special case');
    console.log('✓ renderNextStepCTA shows real Entrega link once authorized');

```

- [ ] **Step 2: Run it to verify it fails**

Run: `node /tmp/test-flow-status.js`
Expected: `FAILED: FlowStatus.renderProgressBar is not a function`.

- [ ] **Step 3: Add both render functions**

Modify `flow-status.js` — add these two methods to the `FlowStatus` object, right after `getSteps()`'s closing `},`:

Old (end of `getSteps()`):
```js
        return steps;
    }
};

window.FlowStatus = FlowStatus;
```
New:
```js
        return steps;
    },

    /* Barra compacta, siempre visible, en las 10 páginas del flujo —
       incluyendo dentro de los wizards largos (Autodiagnóstico,
       Documentos de Sesión), que ya tienen su propia barra de progreso
       INTERNA (de esa página) — esta muestra el progreso del PROCESO
       COMPLETO, no se reemplazan entre sí. currentPageId identifica
       cuál chip resaltar como "estás aquí" incluso si ese paso técnicamente
       ya cuenta como `done` (ej. estás en la pantalla de resultado de
       Autodiagnóstico, que ya está done, pero sigues "en" esa página). */
    renderProgressBar(steps, currentPageId) {
        if (document.getElementById('flowProgressBar')) return;
        var bar = document.createElement('div');
        bar.id = 'flowProgressBar';
        bar.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9998;background:#0f1428;border-bottom:1px solid rgba(255,255,255,0.1);padding:8px 12px;display:flex;gap:6px;overflow-x:auto;white-space:nowrap;font-size:0.72rem;';
        bar.innerHTML = steps.map(function (step) {
            var isHere = step.id === currentPageId;
            var base = 'display:inline-flex;align-items:center;gap:4px;padding:5px 10px;border-radius:6px;text-decoration:none;font-weight:600;white-space:nowrap;';
            if (step.done) {
                var doneStyle = base + 'background:rgba(0,255,136,0.12);color:#00FF88;' + (isHere ? 'border:1px solid #00FF88;' : '');
                return '<a href="' + step.href + '" style="' + doneStyle + '">✓ ' + step.label + '</a>';
            }
            if (step.locked) {
                var lockedStyle = base + 'background:rgba(255,255,255,0.05);color:rgba(255,255,255,0.35);cursor:default;';
                var title = step.reason === 'esperando_evaluador'
                    ? 'Esperando el resultado de tu evaluador'
                    : 'Completa el paso anterior primero';
                return '<span style="' + lockedStyle + '" title="' + title + '">🔒 ' + step.label + '</span>';
            }
            var currentStyle = base + 'background:#0088FF;color:#fff;' + (isHere ? 'box-shadow:0 0 0 2px #FFD700 inset;' : '');
            return '<a href="' + step.href + '" style="' + currentStyle + '">' + step.label + '</a>';
        }).join('');
        document.body.prepend(bar);
        var existingPad = parseInt((document.body.style.paddingTop || '0'), 10) || 0;
        document.body.style.paddingTop = (existingPad + 36) + 'px';
    },

    /* Botón "siguiente paso" — SIEMPRE calculado del estado real de
       `steps`, nunca un href escrito a mano por página. `container` es
       el elemento donde inyectar el bloque (la página decide dónde). */
    renderNextStepCTA(steps, currentPageId, container) {
        var idx = steps.findIndex(function (s) { return s.id === currentPageId; });
        var next = idx >= 0 && idx < steps.length - 1 ? steps[idx + 1] : null;
        if (!next) { container.innerHTML = ''; return; }

        if (next.locked && next.reason === 'esperando_evaluador') {
            container.innerHTML =
                '<div class="card" style="text-align:center;margin-top:20px;">' +
                '<p style="color:var(--text,#D0D0D0);margin-bottom:14px;">🔒 Esperando el resultado de tu evaluador — te contactaremos en cuanto esté listo.</p>' +
                '<a href="recuperar.html" class="btn btn-secondary btn-full" style="display:block;text-decoration:none;">Sigue tu proceso aquí →</a>' +
                '</div>';
            return;
        }

        container.innerHTML =
            '<div class="card" style="text-align:center;margin-top:20px;">' +
            '<a href="' + next.href + '" class="btn btn-primary btn-full" style="display:block;text-decoration:none;">Siguiente: ' + next.label + ' →</a>' +
            '</div>';
    }
};

window.FlowStatus = FlowStatus;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node /tmp/test-flow-status.js`
Expected: all `✓` lines plus the 5 new ones, ending in `ALL TESTS PASSED`.

- [ ] **Step 5: Commit**

```bash
cd "/Users/diegogarzamx/Desktop/Paideia Tech"
node --check flow-status.js
git add flow-status.js
git commit -m "$(cat <<'EOF'
flow-status.js: agrega renderProgressBar() y renderNextStepCTA()

Ambas se calculan siempre del estado real de getSteps() — nunca un
caso especial hardcodeado para Entrega: si algún día se autoriza antes
de terminar Evidencias, automáticamente se muestra como un paso normal
en vez del mensaje de espera.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Delete the scratch harness

**Files:** none in the repo — cleanup only.

- [ ] **Step 1: Delete**

```bash
rm /tmp/test-flow-status.js
```

- [ ] **Step 2: No commit needed** (nothing in the repo changed).

---

### Task 4: Wire up `autodiagnostico.html`

**Files:**
- Modify: `autodiagnostico.html` — add `<script src="flow-status.js">` tag, and call the bar/CTA at the end of `renderResultado(app)`.

- [ ] **Step 1: Add the script tag**

Find the existing `<script src="auth.js"></script>` tag near the top of the file and add `flow-status.js` right after it:

Old:
```html
    <script src="auth.js"></script>
```
New:
```html
    <script src="auth.js"></script>
    <script src="flow-status.js"></script>
```

- [ ] **Step 2: Call the bar + CTA at the end of `renderResultado(app)`**

`renderResultado` here doesn't have `session`/`email` in scope, and `FlowStatus.getSteps()` doesn't need them passed in (it's self-contained) — so this is a clean append with no other changes to the function.

Old:
```js
            <div class="card" style="text-align:center;">
                <a href="success.html" style="color: var(--primary); text-decoration:none; font-size: 0.9rem;">← Volver a mi confirmación de pago</a>
            </div>
        `;
    }
```
New:
```js
            <div class="card" style="text-align:center;">
                <a href="success.html" style="color: var(--primary); text-decoration:none; font-size: 0.9rem;">← Volver a mi confirmación de pago</a>
            </div>
        `;
        const flowSteps = await FlowStatus.getSteps();
        FlowStatus.renderProgressBar(flowSteps, 'autodiagnostico');
    }
```

`renderResultado` is already declared `async function renderResultado(app)`, so `await` here is valid.

Note: this page's own "next step" buttons (Reforzamiento / Alineación) are already correct and conditional on the real recommendation logic (reforzamiento needed or not) — leave those as-is, don't replace with `renderNextStepCTA` here (it would conflict with that existing recommendation branching, which is more specific than the generic "next in list" CTA).

- [ ] **Step 3: Verify syntax**

```bash
cd "/Users/diegogarzamx/Desktop/Paideia Tech"
node -e "const fs=require('fs');const html=fs.readFileSync('autodiagnostico.html','utf8');const s=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];fs.writeFileSync('/tmp/extracted.js', s[s.length-1][1]);" && node --check /tmp/extracted.js
```
Expected: no output (exit code 0).

- [ ] **Step 4: Commit**

```bash
cd "/Users/diegogarzamx/Desktop/Paideia Tech"
git add autodiagnostico.html
git commit -m "$(cat <<'EOF'
autodiagnostico.html: conecta la barra de progreso del flujo

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Wire up `alineacion.html`

**Files:**
- Modify: `alineacion.html`

- [ ] **Step 1: Add the script tag** (same pattern as Task 4 Step 1 — find `<script src="auth.js"></script>`, add `<script src="flow-status.js"></script>` right after).

- [ ] **Step 2: Replace the hardcoded "Siguiente" link with the shared CTA, and add the bar**

Old:
```js
            <a href="plan-evaluacion.html" class="btn btn-primary btn-full">Siguiente: Agenda tu Plan de Evaluación →</a>
        `;
```
New:
```js
            <div id="flowNextStepCta"></div>
        `;
        const flowSteps = await FlowStatus.getSteps();
        FlowStatus.renderProgressBar(flowSteps, 'alineacion');
        FlowStatus.renderNextStepCTA(flowSteps, 'alineacion', document.getElementById('flowNextStepCta'));
```

This is inside `render()`, already `async function render()` (confirmed in scope), so `await` is valid.

- [ ] **Step 3: Verify syntax**

```bash
cd "/Users/diegogarzamx/Desktop/Paideia Tech"
node -e "const fs=require('fs');const html=fs.readFileSync('alineacion.html','utf8');const s=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];fs.writeFileSync('/tmp/extracted.js', s[s.length-1][1]);" && node --check /tmp/extracted.js
```
Expected: no output.

- [ ] **Step 4: Commit**

```bash
cd "/Users/diegogarzamx/Desktop/Paideia Tech"
git add alineacion.html
git commit -m "$(cat <<'EOF'
alineacion.html: conecta barra de progreso y CTA de siguiente paso

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Add the missing Alineación-payment gate to `plan-evaluacion.html`, then wire up the flow bar/CTA

**Files:**
- Modify: `plan-evaluacion.html`

- [ ] **Step 1: Add the script tag** (same pattern — after `<script src="auth.js"></script>`).

- [ ] **Step 2: Add the missing payment gate**

This page currently has no check at all for whether Alineación was paid (confirmed: no `documentosFaseCompletos`/`isPhaseAuthorized` calls exist in this file). Add a blocked-box gate, matching the existing style of this page's other blocked-boxes, right after the session check and before the `if (generated)` branch — it redirects to `alineacion.html` (where the real payment UI already lives) rather than duplicating a pay-box here:

Old:
```js
        const session = await Auth.getSession();
        if (!session) {
            app.innerHTML = `
                <div class="hero">
                    <div class="hero-icon">🔐</div>
                    <h1 class="hero-title">Plan de Evaluación EC1375</h1>
                    <p class="hero-subtitle">El siguiente paso hacia tu evaluación oficial</p>
                </div>
                <div class="blocked-box">
                    <p><strong>Verifica tu correo para continuar</strong><br>Encontramos tu avance en este dispositivo, pero necesitas iniciar sesión para seguir editándolo y mantenerlo respaldado.</p>
                    <a href="recuperar.html" class="btn btn-primary">🔐 Iniciar sesión</a>
                </div>`;
            return;
        }

        if (generated) {
```
New:
```js
        const session = await Auth.getSession();
        if (!session) {
            app.innerHTML = `
                <div class="hero">
                    <div class="hero-icon">🔐</div>
                    <h1 class="hero-title">Plan de Evaluación EC1375</h1>
                    <p class="hero-subtitle">El siguiente paso hacia tu evaluación oficial</p>
                </div>
                <div class="blocked-box">
                    <p><strong>Verifica tu correo para continuar</strong><br>Encontramos tu avance en este dispositivo, pero necesitas iniciar sesión para seguir editándolo y mantenerlo respaldado.</p>
                    <a href="recuperar.html" class="btn btn-primary">🔐 Iniciar sesión</a>
                </div>`;
            return;
        }

        const email = session.user.email;
        if (!(Auth._isBypassSession || await Auth.isPhaseAuthorized(email, 'alineacion'))) {
            app.innerHTML = `
                <div class="hero">
                    <div class="hero-icon">🎓</div>
                    <h1 class="hero-title">Plan de Evaluación EC1375</h1>
                    <p class="hero-subtitle">El siguiente paso hacia tu evaluación oficial</p>
                </div>
                <div class="blocked-box">
                    <p><strong>Primero necesitas tu Alineación</strong><br>El Plan de Evaluación es el paso siguiente a la Alineación — ve ahí para completarla.</p>
                    <a href="alineacion.html" class="btn btn-primary">🎓 Ir a mi Alineación</a>
                </div>`;
            return;
        }

        if (generated) {
```

- [ ] **Step 3: Add the flow bar + CTA to `renderGeneratedState`**

This function doesn't have `session`/`email` in scope (confirmed), but `FlowStatus.getSteps()` doesn't need them passed in — clean append.

Old:
```js
            <div class="card" style="text-align:center;margin-top:20px;">
                <a href="guion-maestro.html" class="btn btn-secondary btn-full" style="display:block;text-decoration:none;margin-bottom:14px;">📜 Guion Maestro — para tener a la mano durante tu sesión</a>
                <a href="documentos-sesion.html" class="btn btn-primary btn-full" style="display:block;text-decoration:none;margin-bottom:14px;">📋 Después de tu sesión: Llena tus Documentos →</a>
                <a href="success.html" style="color:var(--primary);text-decoration:none;font-size:0.9rem;">← Volver a mi confirmación de pago</a>
            </div>
        `;
    }
```
New:
```js
            <div class="card" style="text-align:center;margin-top:20px;">
                <a href="guion-maestro.html" class="btn btn-secondary btn-full" style="display:block;text-decoration:none;margin-bottom:14px;">📜 Guion Maestro — para tener a la mano durante tu sesión</a>
                <a href="documentos-sesion.html" class="btn btn-primary btn-full" style="display:block;text-decoration:none;margin-bottom:14px;">📋 Después de tu sesión: Llena tus Documentos →</a>
                <a href="success.html" style="color:var(--primary);text-decoration:none;font-size:0.9rem;">← Volver a mi confirmación de pago</a>
            </div>
        `;
        const flowSteps = await FlowStatus.getSteps();
        FlowStatus.renderProgressBar(flowSteps, 'plan-evaluacion');
    }
```

(This page keeps its own explicit "Documentos de Sesión" button rather than the generic CTA, matching the same reasoning as `autodiagnostico.html` in Task 4 — it also links to Guion Maestro, a side reference the generic CTA doesn't know about. Only the progress bar is added here, not `renderNextStepCTA`.)

- [ ] **Step 4: Verify syntax**

```bash
cd "/Users/diegogarzamx/Desktop/Paideia Tech"
node -e "const fs=require('fs');const html=fs.readFileSync('plan-evaluacion.html','utf8');const s=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];fs.writeFileSync('/tmp/extracted.js', s[s.length-1][1]);" && node --check /tmp/extracted.js
```
Expected: no output.

- [ ] **Step 5: Commit**

```bash
cd "/Users/diegogarzamx/Desktop/Paideia Tech"
git add plan-evaluacion.html
git commit -m "$(cat <<'EOF'
plan-evaluacion.html: agrega el gate de pago de Alineación que faltaba, conecta barra de progreso

Esta página no tenía ningún chequeo de pago — se podía llegar aquí
directo con solo el Autodiagnóstico completo, sin haber pagado
Alineación. Redirige a alineacion.html (donde ya vive el pago real)
en vez de duplicar una caja de pago aquí.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Wire up `documentos-sesion.html`

**Files:**
- Modify: `documentos-sesion.html`

- [ ] **Step 1: Add the script tag** (same pattern).

- [ ] **Step 2: Replace the hardcoded "Siguiente" link with the shared CTA, and add the bar**

Old:
```js
        app.innerHTML = `
            <div class="success-box">
                <h3 style="color:var(--success);margin-bottom:10px;">✅ Tus 4 documentos están listos</h3>
                <p style="color:var(--text);margin-bottom:20px;">Se suben automáticamente a tu portafolio.</p>
                ${docs.map(d => renderEstadoDoc(d.key, d.label)).join('')}
            </div>
            <div class="card" style="text-align:center;margin-top:20px;">
                <a href="practica.html" class="btn btn-primary btn-full" style="display:block;text-decoration:none;margin-bottom:14px;">🎯 Siguiente: Práctica →</a>
                <a href="plan-evaluacion.html" style="color:var(--primary);text-decoration:none;font-size:0.9rem;">← Volver a mi Plan de Evaluación</a>
            </div>
        `;
    }
```
New:
```js
        app.innerHTML = `
            <div class="success-box">
                <h3 style="color:var(--success);margin-bottom:10px;">✅ Tus 4 documentos están listos</h3>
                <p style="color:var(--text);margin-bottom:20px;">Se suben automáticamente a tu portafolio.</p>
                ${docs.map(d => renderEstadoDoc(d.key, d.label)).join('')}
            </div>
            <div class="card" style="text-align:center;margin-top:20px;">
                <a href="plan-evaluacion.html" style="color:var(--primary);text-decoration:none;font-size:0.9rem;">← Volver a mi Plan de Evaluación</a>
            </div>
            <div id="flowNextStepCta"></div>
        `;
        const flowSteps = await FlowStatus.getSteps();
        FlowStatus.renderProgressBar(flowSteps, 'documentos-sesion');
        FlowStatus.renderNextStepCTA(flowSteps, 'documentos-sesion', document.getElementById('flowNextStepCta'));
    }
```

`renderResultado(app, result)` here is already `async` (confirmed).

- [ ] **Step 3: Verify syntax**

```bash
cd "/Users/diegogarzamx/Desktop/Paideia Tech"
node -e "const fs=require('fs');const html=fs.readFileSync('documentos-sesion.html','utf8');const s=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];fs.writeFileSync('/tmp/extracted.js', s[s.length-1][1]);" && node --check /tmp/extracted.js
```
Expected: no output.

- [ ] **Step 4: Commit**

```bash
cd "/Users/diegogarzamx/Desktop/Paideia Tech"
git add documentos-sesion.html
git commit -m "$(cat <<'EOF'
documentos-sesion.html: conecta barra de progreso y CTA de siguiente paso

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Wire up `encuesta-satisfaccion.html`

**Files:**
- Modify: `encuesta-satisfaccion.html`

- [ ] **Step 1: Add the script tag** (same pattern).

- [ ] **Step 2: Replace the hardcoded "Siguiente" link with the shared CTA, and add the bar**

Old:
```js
        app.innerHTML = `
            <div class="success-box">
                <h3>🎉 ¡Ya tienes tu Encuesta lista!</h3>
                ${renderEstadoDoc('encuesta', 'Encuesta de Satisfacción')}
                <button class="btn btn-whatsapp btn-full" onclick="notifyWhatsApp()">📱 AVISAR AL EQUIPO POR WHATSAPP</button>
            </div>
            <div class="card" style="text-align:center;margin-top:20px;">
                <a href="evidencias.html" class="btn btn-primary btn-full" style="display:block;text-decoration:none;margin-bottom:14px;">📤 Siguiente: Sube tus Evidencias →</a>
                <a href="documentos-sesion.html" style="color:var(--primary);text-decoration:none;font-size:0.9rem;">← Volver a mis Documentos de Sesión</a>
            </div>
        `;
    }
```
New:
```js
        app.innerHTML = `
            <div class="success-box">
                <h3>🎉 ¡Ya tienes tu Encuesta lista!</h3>
                ${renderEstadoDoc('encuesta', 'Encuesta de Satisfacción')}
                <button class="btn btn-whatsapp btn-full" onclick="notifyWhatsApp()">📱 AVISAR AL EQUIPO POR WHATSAPP</button>
            </div>
            <div class="card" style="text-align:center;margin-top:20px;">
                <a href="documentos-sesion.html" style="color:var(--primary);text-decoration:none;font-size:0.9rem;">← Volver a mis Documentos de Sesión</a>
            </div>
            <div id="flowNextStepCta"></div>
        `;
        const flowSteps = await FlowStatus.getSteps();
        FlowStatus.renderProgressBar(flowSteps, 'encuesta');
        FlowStatus.renderNextStepCTA(flowSteps, 'encuesta', document.getElementById('flowNextStepCta'));
    }
```

`renderGeneratedState(app, result)` here is already `async` (confirmed).

- [ ] **Step 3: Verify syntax**

```bash
cd "/Users/diegogarzamx/Desktop/Paideia Tech"
node -e "const fs=require('fs');const html=fs.readFileSync('encuesta-satisfaccion.html','utf8');const s=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];fs.writeFileSync('/tmp/extracted.js', s[s.length-1][1]);" && node --check /tmp/extracted.js
```
Expected: no output.

- [ ] **Step 4: Commit**

```bash
cd "/Users/diegogarzamx/Desktop/Paideia Tech"
git add encuesta-satisfaccion.html
git commit -m "$(cat <<'EOF'
encuesta-satisfaccion.html: conecta barra de progreso y CTA de siguiente paso

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Wire up `evidencias.html` — this is the page that fixes the dead end

**Files:**
- Modify: `evidencias.html`

- [ ] **Step 1: Add the script tag** (same pattern).

- [ ] **Step 2: Make `renderGeneratedState` async, add the bar + the CTA that finally closes the dead end**

Old:
```js
    function renderGeneratedState(app, result) {
        app.innerHTML = `
            <div class="success-box">
                <h3>✅ ¡Listo! Le avisamos a tu equipo</h3>
                <p style="color:var(--text);margin-bottom:20px;">Tus evidencias reales (las que subiste arriba) son las que se integran a tu Portafolio final — esto solo confirma que ya terminaste. Tu evaluador arma tu expediente completo con todo lo que subiste.</p>
                <button class="btn btn-primary btn-full" onclick="generatePDF()">📄 Descargar comprobante (PDF)</button>
                <button class="btn btn-whatsapp btn-full" onclick="notifyWhatsApp()">📱 AVISAR AL EQUIPO POR WHATSAPP</button>
            </div>
            <div class="card" style="text-align:center;margin-top:20px;">
                <a href="encuesta-satisfaccion.html" style="color:var(--primary);text-decoration:none;font-size:0.9rem;">← Volver a mi Encuesta de Satisfacción</a>
            </div>
        `;
    }
```
New:
```js
    async function renderGeneratedState(app, result) {
        app.innerHTML = `
            <div class="success-box">
                <h3>✅ ¡Listo! Le avisamos a tu equipo</h3>
                <p style="color:var(--text);margin-bottom:20px;">Tus evidencias reales (las que subiste arriba) son las que se integran a tu Portafolio final — esto solo confirma que ya terminaste. Tu evaluador arma tu expediente completo con todo lo que subiste.</p>
                <button class="btn btn-primary btn-full" onclick="generatePDF()">📄 Descargar comprobante (PDF)</button>
                <button class="btn btn-whatsapp btn-full" onclick="notifyWhatsApp()">📱 AVISAR AL EQUIPO POR WHATSAPP</button>
            </div>
            <div class="card" style="text-align:center;margin-top:20px;">
                <a href="encuesta-satisfaccion.html" style="color:var(--primary);text-decoration:none;font-size:0.9rem;">← Volver a mi Encuesta de Satisfacción</a>
            </div>
            <div id="flowNextStepCta"></div>
        `;
        const flowSteps = await FlowStatus.getSteps();
        FlowStatus.renderProgressBar(flowSteps, 'evidencias');
        FlowStatus.renderNextStepCTA(flowSteps, 'evidencias', document.getElementById('flowNextStepCta'));
    }
```

- [ ] **Step 3: Update the one caller to await it**

`generateAcuse()` (line 597) currently calls `renderGeneratedState(app, result)` synchronously. Find that call and add `await`:

Old:
```js
        renderGeneratedState(app, result);
```
New:
```js
        await renderGeneratedState(app, result);
```

If `generateAcuse()` itself isn't already `async`, this step also requires adding `async` to its own function declaration — check its signature: if it reads `function generateAcuse(...)`, change to `async function generateAcuse(...)`, and check whether *its* callers need `await` too (follow the same chain one level up only if needed — stop once you reach an `onclick="..."` HTML attribute handler, which doesn't need to await, or an already-`async` function).

- [ ] **Step 4: Verify syntax**

```bash
cd "/Users/diegogarzamx/Desktop/Paideia Tech"
node -e "const fs=require('fs');const html=fs.readFileSync('evidencias.html','utf8');const s=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];fs.writeFileSync('/tmp/extracted.js', s[s.length-1][1]);" && node --check /tmp/extracted.js
```
Expected: no output.

- [ ] **Step 5: Commit**

```bash
cd "/Users/diegogarzamx/Desktop/Paideia Tech"
git add evidencias.html
git commit -m "$(cat <<'EOF'
evidencias.html: cierra el callejón sin salida hacia Entrega

Esta pantalla no ofrecía ningún camino hacia adelante — solo
descargar PDF o avisar por WhatsApp. Ahora, si Entrega ya está
autorizada, muestra el botón real; si no (el caso normal — depende de
que el evaluador se pronuncie), explica que está esperando y ofrece
el dashboard como siguiente parada, en vez de terminar sin decir nada.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Wire up `entrega.html`

**Files:**
- Modify: `entrega.html`

- [ ] **Step 1: Add the script tag** (same pattern).

- [ ] **Step 2: Add the bar to the success screen**

This is the last step — no "next step" CTA needed, just the progress bar showing all 10 steps done.

Old:
```js
                <a href="https://wa.me/528115026729?text=${encodeURIComponent('Hola, ya pagué la Entrega de mi certificado. ¿Cómo va el proceso?')}" target="_blank" class="btn btn-primary btn-full" style="margin-top:16px;">📱 Preguntar estatus por WhatsApp</a>
            </div>`;
    }
```
New:
```js
                <a href="https://wa.me/528115026729?text=${encodeURIComponent('Hola, ya pagué la Entrega de mi certificado. ¿Cómo va el proceso?')}" target="_blank" class="btn btn-primary btn-full" style="margin-top:16px;">📱 Preguntar estatus por WhatsApp</a>
            </div>`;
        const flowSteps = await FlowStatus.getSteps();
        FlowStatus.renderProgressBar(flowSteps, 'entrega');
    }
```

`render()` here is already `async function render()` (confirmed), so `await` is valid.

- [ ] **Step 3: Verify syntax**

```bash
cd "/Users/diegogarzamx/Desktop/Paideia Tech"
node -e "const fs=require('fs');const html=fs.readFileSync('entrega.html','utf8');const s=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];fs.writeFileSync('/tmp/extracted.js', s[s.length-1][1]);" && node --check /tmp/extracted.js
```
Expected: no output.

- [ ] **Step 4: Commit**

```bash
cd "/Users/diegogarzamx/Desktop/Paideia Tech"
git add entrega.html
git commit -m "$(cat <<'EOF'
entrega.html: conecta barra de progreso (último paso, sin CTA siguiente)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: Wire up `reforzamiento.html` and `practica.html`

**Files:**
- Modify: `reforzamiento.html`, `practica.html`

Both are thin `location.replace` redirect stubs with no real UI — they can't host a progress bar themselves (there's nothing rendered before the redirect fires). The bar/CTA for these two steps lives on `ruta-estudio.html` itself (added in Task 13, since that's what actually renders after either redirect completes). This task is a no-op placeholder to document that decision — **skip to Task 12**. (Left as an explicit task so the plan's file list stays complete and this isn't mistaken for an oversight during review.)

- [ ] **Step 1: No code change.** Confirm by re-reading both files that they're still simple 13-line redirect stubs (matching the content already captured in this plan's research) before moving on — if either has grown a real UI since, stop and reconsider this task.

---

### Task 12: Wire up `examen-conocimientos.html` — bar, CTA, and the self-check clarification

**Files:**
- Modify: `examen-conocimientos.html`

- [ ] **Step 1: Add the script tag** (same pattern).

- [ ] **Step 2: Add a clarifying note to the result screen (both pass and fail) and connect the bar**

The existing pass/fail copy (`'¡Aprobado!'` vs `'No alcanzó el mínimo...'`) already differs correctly — no change needed there. Add one clarifying line so a failing score doesn't read as "you failed your certification," plus the bar:

Old:
```js
    function renderResultado(app, result) {
        document.getElementById('topBarProgress').textContent = 'Examen enviado';
        const pass = examState.score >= PASSING_PERCENT;
        app.innerHTML = `
            <div class="hero"><div class="hero-icon">${pass ? '✅' : '📋'}</div><h1 class="hero-title">Examen enviado</h1></div>
            <div class="result-box ${pass ? 'pass' : 'fail'}">
                <p style="color:var(--text-bright);">Aciertos: <strong>${examState.correctas} / ${REACTIVOS.length}</strong></p>
                <div class="result-score">${examState.score}%</div>
                <p style="color:var(--text-bright);font-weight:700;">${pass ? '¡Aprobado!' : `No alcanzó el mínimo de ${PASSING_PERCENT}%`}</p>
            </div>
            <div class="card" style="text-align:center;">
                <button class="btn btn-primary btn-full" onclick="generateExamenPDF()">📄 Descargar comprobante (PDF)</button>
                <a href="encuesta-satisfaccion.html" class="btn btn-secondary btn-full" style="display:block;text-decoration:none;margin-top:14px;">Siguiente: Encuesta de Satisfacción →</a>
                <a href="documentos-sesion.html" style="color:var(--primary);text-decoration:none;font-size:0.9rem;display:block;margin-top:12px;">← Volver a mis Documentos de Sesión</a>
            </div>
        `;
    }
```
New:
```js
    async function renderResultado(app, result) {
        document.getElementById('topBarProgress').textContent = 'Examen enviado';
        const pass = examState.score >= PASSING_PERCENT;
        app.innerHTML = `
            <div class="hero"><div class="hero-icon">${pass ? '✅' : '📋'}</div><h1 class="hero-title">Examen enviado</h1></div>
            <div class="result-box ${pass ? 'pass' : 'fail'}">
                <p style="color:var(--text-bright);">Aciertos: <strong>${examState.correctas} / ${REACTIVOS.length}</strong></p>
                <div class="result-score">${examState.score}%</div>
                <p style="color:var(--text-bright);font-weight:700;">${pass ? '¡Aprobado!' : `No alcanzó el mínimo de ${PASSING_PERCENT}%`}</p>
                <p style="color:var(--text);font-size:0.85rem;margin-top:10px;">Esta es una autoevaluación de práctica — tu evaluación oficial es el video de tu sesión, revisado por tu Centro Evaluador. Este resultado no bloquea tu avance.</p>
            </div>
            <div class="card" style="text-align:center;">
                <button class="btn btn-primary btn-full" onclick="generateExamenPDF()">📄 Descargar comprobante (PDF)</button>
                <a href="documentos-sesion.html" style="color:var(--primary);text-decoration:none;font-size:0.9rem;display:block;margin-top:12px;">← Volver a mis Documentos de Sesión</a>
            </div>
            <div id="flowNextStepCta"></div>
        `;
        const flowSteps = await FlowStatus.getSteps();
        FlowStatus.renderProgressBar(flowSteps, 'examen');
        FlowStatus.renderNextStepCTA(flowSteps, 'examen', document.getElementById('flowNextStepCta'));
    }
```

The hardcoded "Siguiente: Encuesta" link is removed in favor of the shared CTA (which points to the same page, computed instead of hand-written). `renderResultado` becomes `async` — check its one caller (the exam submission handler) and add `await` there the same way as Task 9 Step 3, following the call chain up only as far as needed.

- [ ] **Step 3: Verify syntax**

```bash
cd "/Users/diegogarzamx/Desktop/Paideia Tech"
node -e "const fs=require('fs');const html=fs.readFileSync('examen-conocimientos.html','utf8');const s=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];fs.writeFileSync('/tmp/extracted.js', s[s.length-1][1]);" && node --check /tmp/extracted.js
```
Expected: no output.

- [ ] **Step 4: Commit**

```bash
cd "/Users/diegogarzamx/Desktop/Paideia Tech"
git add examen-conocimientos.html
git commit -m "$(cat <<'EOF'
examen-conocimientos.html: aclara que es autoevaluación, conecta barra/CTA

Agrega una línea aclarando que este resultado no es la evaluación
oficial (esa es el video revisado por el Centro Evaluador) y no
bloquea el avance — para que un resultado bajo no se lea como "reprobé
mi certificación". El CTA de siguiente paso pasa a calcularse desde
flow-status.js en vez de estar escrito a mano.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 13: `ruta-estudio.html` — flow bar for Reforzamiento/Práctica, and the bare-`?boot=` redirect

**Files:**
- Modify: `ruta-estudio.html`

- [ ] **Step 1: Add the script tag**

Find the existing `<script src="auth.js"></script>` tag and add `flow-status.js` right after it (same pattern as every other page).

- [ ] **Step 2: Redirect bare access (no `?boot=` param) to the dashboard**

Old:
```js
  var boot = new URLSearchParams(location.search).get('boot');
```
New:
```js
  var boot = new URLSearchParams(location.search).get('boot');
  if (!boot) {
    location.replace('recuperar.html');
    return;
  }
```

This must go inside the same `(async function(){ ... })()` wrapper this line already lives in — confirm the surrounding function is still an IIFE (it was at last read) so a bare `return` here is valid; if it isn't, use an early exit appropriate to whatever wraps it (e.g. skip the rest of the function body via an `if` around everything below instead of `return`).

- [ ] **Step 3: Add the flow bar for `boot=remedial` and `boot=practice`**

Find where `if (boot) { ... }` finishes handling the open/blocked logic (right after the `hideNav` style injection, before the click-interceptor `document.addEventListener('click', ...)` that follows it), and add the bar there — it should only render for the two steps this page corresponds to (`remedial` → Reforzamiento, `practice` → Práctica), not for `library` (which isn't one of the 10 steps):

```js
    var hideNav = document.createElement('style');
    hideNav.textContent = 'nav.rutas{display:none!important}#stepper{display:none!important}';
    document.head.appendChild(hideNav);
```
becomes:
```js
    var hideNav = document.createElement('style');
    hideNav.textContent = 'nav.rutas{display:none!important}#stepper{display:none!important}';
    document.head.appendChild(hideNav);

    if (boot === 'remedial' || boot === 'practice') {
      var flowStepId = boot === 'remedial' ? 'reforzamiento' : 'practica';
      var flowSteps = await FlowStatus.getSteps();
      FlowStatus.renderProgressBar(flowSteps, flowStepId);
    }
```

This entire block (including the surrounding `if (boot) { ... }`) lives inside the file's single top-level `(async function(){ ... })()` IIFE that wraps the whole integration wrapper script (confirmed directly in an earlier session — the same scope already used for `var openResult = boot === 'remedial' ? window.EC1375.enterReinforcement() ... : ...` a few lines above this insertion point), so a bare `await` here is valid.

- [ ] **Step 4: Verify syntax**

```bash
cd "/Users/diegogarzamx/Desktop/Paideia Tech"
node -e "
const fs=require('fs');
const html=fs.readFileSync('ruta-estudio.html','utf8');
const s=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
fs.writeFileSync('/tmp/extracted.js', s[s.length-1][1]);
"
node --check /tmp/extracted.js
```
Expected: no output.

- [ ] **Step 5: Commit**

```bash
cd "/Users/diegogarzamx/Desktop/Paideia Tech"
git add ruta-estudio.html
git commit -m "$(cat <<'EOF'
ruta-estudio.html: redirige el acceso sin ?boot= al dashboard, conecta barra

Un link/bookmark/QR viejo que apunte aquí sin el parámetro boot caía
en el dashboard interno del motor, ya inconsistente con el flujo
lineal actual — ahora redirige a recuperar.html. También conecta la
barra de progreso del flujo para los pasos Reforzamiento y Práctica.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 14: `ruta-alineacion.html` — real completion CTA on the last screen

**Files:**
- Modify: `ruta-alineacion.html`

- [ ] **Step 1: Add a completion button inside the last slide's own markup**

The deck's content lives on a single physical line (confirmed ~10,944 characters). Target the exact, unique closing text of the last slide (screen 57 of 57) rather than trying to hook into slide-navigation JS — this keeps the edit a precise, safe string match:

Old (the exact tail of slide 57's markup — this string is unique in the file):
```html
<li><span class="box"></span><span>Sin datos personales reales visibles en ningún documento</span></li></ul></div></div></section>
```
New:
```html
<li><span class="box"></span><span>Sin datos personales reales visibles en ningún documento</span></li></ul></div><div style="margin-top:24px;text-align:center;"><a href="alineacion.html" style="display:inline-block;background:#0088FF;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:700;">✅ Alineación completa — Continuar</a></div></div></section>
```

This adds a real, prominent button inside the last screen itself, without touching the always-present top-toolbar "Volver" icon (which stays as secondary/incidental navigation, not the primary "you're done" signal).

- [ ] **Step 2: Verify the edit landed exactly once**

```bash
cd "/Users/diegogarzamx/Desktop/Paideia Tech"
grep -c "Alineación completa — Continuar" ruta-alineacion.html
```
Expected: `1`.

- [ ] **Step 3: Verify syntax of the file's script blocks**

```bash
cd "/Users/diegogarzamx/Desktop/Paideia Tech"
node -e "
const fs=require('fs');
const html=fs.readFileSync('ruta-alineacion.html','utf8');
const s=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
fs.writeFileSync('/tmp/extracted.js', s[s.length-1][1]);
"
node --check /tmp/extracted.js
```
Expected: no output. (This edit only touches HTML content inside a slide, not JS, so this check mainly guards against having accidentally broken the surrounding markup structure in a way that corrupts a later inline script — still worth confirming.)

- [ ] **Step 4: Commit**

```bash
cd "/Users/diegogarzamx/Desktop/Paideia Tech"
git add ruta-alineacion.html
git commit -m "$(cat <<'EOF'
ruta-alineacion.html: botón real de "completado" en la última pantalla

La única señal de que terminaste las 57 pantallas era el ícono
pequeño de "Volver" en la barra superior, fácil de pasar por alto.
Se agrega un botón real dentro de la última pantalla misma.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 15: `auth.js` — bring the admin bar up to date with all 15 pages

**Files:**
- Modify: `auth.js`

- [ ] **Step 1: Add the 5 missing links, interleaved in real step order**

Old:
```js
            <a href="autodiagnostico.html" target="_blank" style="${linkStyle}">Autodiagnóstico</a>
            <a href="alineacion.html" target="_blank" style="${linkStyle}">Alineación</a>
            <a href="plan-evaluacion.html" target="_blank" style="${linkStyle}">Plan Evaluación</a>
            <a href="documentos-sesion.html" target="_blank" style="${linkStyle}">Doc. Sesión</a>
            <a href="encuesta-satisfaccion.html" target="_blank" style="${linkStyle}">Encuesta</a>
            <a href="evidencias.html" target="_blank" style="${linkStyle}">Evidencias</a>
            <a href="entrega.html" target="_blank" style="${linkStyle}">Entrega</a>
            <a href="recuperar.html" target="_blank" style="${linkStyle};background:transparent;border:1px solid #0088FF;">Login</a>
```
New:
```js
            <a href="autodiagnostico.html" target="_blank" style="${linkStyle}">Autodiagnóstico</a>
            <a href="reforzamiento.html" target="_blank" style="${linkStyle}">Reforzamiento</a>
            <a href="alineacion.html" target="_blank" style="${linkStyle}">Alineación</a>
            <a href="biblioteca.html" target="_blank" style="${linkStyle};background:transparent;border:1px solid #0088FF;">Biblioteca</a>
            <a href="plan-evaluacion.html" target="_blank" style="${linkStyle}">Plan Evaluación</a>
            <a href="guion-maestro.html" target="_blank" style="${linkStyle};background:transparent;border:1px solid #0088FF;">Guion Maestro</a>
            <a href="documentos-sesion.html" target="_blank" style="${linkStyle}">Doc. Sesión</a>
            <a href="practica.html" target="_blank" style="${linkStyle}">Práctica</a>
            <a href="examen-conocimientos.html" target="_blank" style="${linkStyle}">Examen</a>
            <a href="encuesta-satisfaccion.html" target="_blank" style="${linkStyle}">Encuesta</a>
            <a href="evidencias.html" target="_blank" style="${linkStyle}">Evidencias</a>
            <a href="entrega.html" target="_blank" style="${linkStyle}">Entrega</a>
            <a href="recuperar.html" target="_blank" style="${linkStyle};background:transparent;border:1px solid #0088FF;">Dashboard</a>
```

(The Login link's label changes to "Dashboard" to match what `recuperar.html` becomes in Task 16 — still the same href.)

- [ ] **Step 2: Verify syntax**

```bash
cd "/Users/diegogarzamx/Desktop/Paideia Tech"
node --check auth.js
```
Expected: no output.

- [ ] **Step 3: Commit**

```bash
cd "/Users/diegogarzamx/Desktop/Paideia Tech"
git add auth.js
git commit -m "$(cat <<'EOF'
auth.js: actualiza la barra de admin con las 5 páginas que faltaban

Reforzamiento, Biblioteca, Práctica, Examen de Conocimientos y Guion
Maestro no estaban — la barra dejó de ser un mapa completo del sitio
según fue creciendo. Reordenados para reflejar la secuencia real.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 16: `recuperar.html` — full rewrite as the dashboard

**Files:**
- Modify: `recuperar.html` (full rewrite of the `<script>` block; head/styles stay)

- [ ] **Step 1: Replace the whole file**

The current version is a simple login gate that only lists 5 of the steps, with no done/current/locked concept — this needs a full rewrite, not a patch (confirmed during research). Add `<script src="flow-status.js"></script>` after `auth.js`, keep the existing `<style>` block as-is, and replace the entire `<script>` body:

Old (full current `<script>` body):
```js
    const STEP_LINKS = {
        autodiagnosticoData: { label: '📋 Autodiagnóstico', href: 'autodiagnostico.html' },
        planEvaluacionData: { label: '📅 Plan de Evaluación', href: 'plan-evaluacion.html' },
        documentosSesionData: { label: '📋 Documentos de Sesión', href: 'documentos-sesion.html' },
        encuestaSatisfaccionData: { label: '📝 Encuesta de Satisfacción', href: 'encuesta-satisfaccion.html' },
        evidenciasData: { label: '📤 Evidencias', href: 'evidencias.html' }
    };

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

    async function handleVerified(session) {
        const container = document.getElementById('authGateContainer');
        if (await Auth.isBypassSession()) {
            Auth.ensureAdminPlaceholderData();
            Auth.renderAdminBar();
            container.innerHTML = `<p class="msg success">✅ Sesión de administrador iniciada. Usa la barra de arriba para navegar cualquier página del flujo.</p>`;
            return;
        }
        container.innerHTML = `<p class="spinner">Cargando tu progreso...</p>`;
        const row = await Auth.pullMyRow();
        const restored = Auth.restoreLocalStorageFromRow(row);

        if (restored.length === 0) {
            container.innerHTML = `
                <p class="msg success">✅ Sesión iniciada. Aún no tienes avance guardado.</p>
                <a href="autodiagnostico.html" class="btn btn-primary btn-full" style="text-decoration:none;margin-top:14px;">📋 Ir al Autodiagnóstico →</a>
            `;
            return;
        }

        container.innerHTML = `
            <p class="msg success">✅ ¡Listo, ${escapeHtml(row.nombre || 'candidato/a')}! Recuperamos tu avance en este dispositivo.</p>
            <p style="font-size:0.85rem;margin-top:14px;margin-bottom:10px;">Continúa donde quieras:</p>
            ${restored.map(key => `<a href="${STEP_LINKS[key].href}" class="btn btn-primary btn-full" style="text-decoration:none;margin-bottom:10px;">${STEP_LINKS[key].label} →</a>`).join('')}
        `;
    }

    function escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    render();
```
New:
```js
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

    async function handleVerified(session) {
        const container = document.getElementById('authGateContainer');
        if (await Auth.isBypassSession()) {
            Auth.ensureAdminPlaceholderData();
            Auth.renderAdminBar();
        }
        container.innerHTML = `<p class="spinner">Cargando tu progreso...</p>`;
        const row = await Auth.pullMyRow();
        const nombre = row && row.nombre ? row.nombre : 'candidato/a';
        const steps = await FlowStatus.getSteps();

        container.innerHTML = `
            <p class="msg success">✅ ¡Hola, ${escapeHtml(nombre)}! Así va tu proceso:</p>
            <div style="margin-top:16px;">
                ${steps.map(renderDashboardStep).join('')}
            </div>
        `;
    }

    function renderDashboardStep(step) {
        if (step.done) {
            return `<div style="display:flex;align-items:center;gap:10px;padding:12px 0;border-bottom:1px solid rgba(255,255,255,0.08);">
                <span style="color:var(--success);font-size:1.2rem;">✓</span>
                <a href="${step.href}" style="color:var(--text-bright);text-decoration:none;flex:1;">${step.label}</a>
            </div>`;
        }
        if (step.locked) {
            const msg = step.reason === 'esperando_evaluador'
                ? 'Esperando el resultado de tu evaluador'
                : 'Completa el paso anterior primero';
            return `<div style="display:flex;align-items:center;gap:10px;padding:12px 0;border-bottom:1px solid rgba(255,255,255,0.08);opacity:0.5;">
                <span style="font-size:1.2rem;">🔒</span>
                <span style="flex:1;">${step.label} — <em style="font-size:0.85rem;">${msg}</em></span>
            </div>`;
        }
        return `<div style="display:flex;align-items:center;gap:10px;padding:12px 0;border-bottom:1px solid rgba(255,255,255,0.08);">
            <span style="color:var(--primary);font-size:1.2rem;">▶</span>
            <a href="${step.href}" class="btn btn-primary" style="text-decoration:none;flex:1;text-align:left;padding:10px 14px;">${step.label} →</a>
        </div>`;
    }

    function escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    render();
```

Note: `STEP_LINKS` and `Auth.restoreLocalStorageFromRow(row)` are no longer used on this page — the dashboard now reads everything through `FlowStatus.getSteps()`, which pulls fresh from `Auth.pullMyRow()` directly rather than restoring into `localStorage` first. This intentionally leaves `Auth.restoreLocalStorageFromRow()` itself untouched in `auth.js` (out of scope — nothing else in this plan requires changing it, and other pages may still rely on its current behavior for their own local caches).

- [ ] **Step 2: Verify syntax**

```bash
cd "/Users/diegogarzamx/Desktop/Paideia Tech"
node -e "const fs=require('fs');const html=fs.readFileSync('recuperar.html','utf8');const s=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];fs.writeFileSync('/tmp/extracted.js', s[s.length-1][1]);" && node --check /tmp/extracted.js
```
Expected: no output.

- [ ] **Step 3: Commit**

```bash
cd "/Users/diegogarzamx/Desktop/Paideia Tech"
git add recuperar.html
git commit -m "$(cat <<'EOF'
recuperar.html: reescrita como el dashboard completo del proceso

Antes solo listaba links para 5 de los pasos, sin noción de qué está
hecho/en curso/bloqueado. Ahora muestra los 10 pasos reales vía
FlowStatus.getSteps() — cada uno con su estado, y para Entrega
específicamente el mensaje de espera correcto en vez de nada.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 17: Full syntax + consistency pass

**Files:** none modified — verification only.

- [ ] **Step 1: Syntax-check every touched file**

```bash
cd "/Users/diegogarzamx/Desktop/Paideia Tech"
node --check flow-status.js
node --check auth.js
for f in autodiagnostico.html alineacion.html plan-evaluacion.html documentos-sesion.html encuesta-satisfaccion.html evidencias.html entrega.html examen-conocimientos.html ruta-estudio.html ruta-alineacion.html recuperar.html; do
  node -e "const fs=require('fs');const html=fs.readFileSync('$f','utf8');const s=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];fs.writeFileSync('/tmp/extracted.js', s[s.length-1][1]);" && node --check /tmp/extracted.js && echo "OK: $f"
done
```
Expected: `OK: <filename>` for all 11 HTML files, no `SyntaxError`.

- [ ] **Step 2: Confirm `flow-status.js` is loaded everywhere it's used**

```bash
cd "/Users/diegogarzamx/Desktop/Paideia Tech"
for f in autodiagnostico.html alineacion.html plan-evaluacion.html documentos-sesion.html encuesta-satisfaccion.html evidencias.html entrega.html examen-conocimientos.html ruta-estudio.html recuperar.html; do
  grep -q 'flow-status.js' "$f" && echo "OK: $f" || echo "MISSING: $f"
done
```
Expected: `OK: <filename>` for all 10 (note: `ruta-alineacion.html` is intentionally excluded — Task 14 didn't add a script tag there, only a static HTML button; `biblioteca.html`/`guion-maestro.html` are intentionally excluded too — side references, not steps).

- [ ] **Step 3: Confirm `FlowStatus.renderProgressBar` is called on all 10 step pages**

```bash
cd "/Users/diegogarzamx/Desktop/Paideia Tech"
for f in autodiagnostico.html alineacion.html plan-evaluacion.html documentos-sesion.html encuesta-satisfaccion.html evidencias.html entrega.html examen-conocimientos.html; do
  grep -q 'FlowStatus.renderProgressBar' "$f" && echo "OK: $f" || echo "MISSING: $f"
done
grep -q 'renderProgressBar' ruta-estudio.html && echo "OK: ruta-estudio.html" || echo "MISSING: ruta-estudio.html"
```
Expected: `OK:` for all 9.

- [ ] **Step 4: No commit needed — verification only.** If any check fails, go back to the relevant task, fix it, and re-run this task before continuing.

---

### Task 18: Deploy and live verification (interactive — needs the user)

**Files:** none — this task pushes and verifies in the browser.

This is a large change (11 files + 1 new module) touching the entire candidate flow — treat this deploy with more caution than a single-file fix. Do not push without explicit confirmation.

- [ ] **Step 1: Push to trigger the Vercel deploy**

Tell the user this pushes ~16 commits to `main` (Tasks 1, 2, 4-16 — one each, plus Task 11 has no commit), which auto-deploys to production (`https://sepconocer.paideiatech.com`). Get explicit confirmation before running:

```bash
cd "/Users/diegogarzamx/Desktop/Paideia Tech"
git push origin main
```

Wait for the deploy to go live before continuing — poll for a distinctive string from the new code:
```bash
until curl -s "https://sepconocer.paideiatech.com/flow-status.js" | grep -q 'FLOW_STEPS_META'; do sleep 3; done
echo "DEPLOY_LIVE"
```

- [ ] **Step 2: Regression check — pages that don't require login still behave correctly**

Using the Browser tool, navigate to `https://sepconocer.paideiatech.com/ruta-estudio.html` (no `?boot=` param) and confirm it redirects to `recuperar.html` instead of showing the old internal dashboard.

- [ ] **Step 3: Ask the user to verify the parts that need a real or admin-bypass session**

Since most of this plan's surface (progress bar, CTAs, dashboard) only renders after login, ask the user to check, from a logged-in session (their own admin bypass account or a real candidate account):
1. The progress bar appears on `autodiagnostico.html`'s result screen, `alineacion.html`, `plan-evaluacion.html`'s result screen, `documentos-sesion.html`'s result screen, `encuesta-satisfaccion.html`'s result screen, `evidencias.html`, `entrega.html`, and `examen-conocimientos.html`'s result screen — 8 pages total.
2. `recuperar.html` shows the full 10-step dashboard with correct done/locked/current status.
3. `evidencias.html`'s completion screen shows either a real "Entrega" button (if authorized) or the waiting-on-evaluator message (if not) — never nothing.
4. The updated admin bar (`auth.js`) shows all 15 links in the right order.
5. `ruta-alineacion.html`'s last slide shows the new "Alineación completa — Continuar" button.
6. `examen-conocimientos.html`'s result screen shows the new self-check clarification line.
7. `plan-evaluacion.html` correctly blocks with a link to `alineacion.html` if Alineación isn't authorized (can verify with the admin bypass account by temporarily considering what a non-authorized candidate would see — or accept this on code review if a live test account without Alineación authorization isn't readily available).

- [ ] **Step 4: Report back to the user**

Summarize what was verified directly vs. what the user confirmed, and flag anything that didn't behave as expected instead of claiming success.
