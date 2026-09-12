# Admin Flow Bypass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let only `paideia.tech@outlook.com` navigate the entire EC1375 candidate flow (Autodiagnóstico → Entrega) without paying, completing forms, or uploading documents — for internal review/QA — without granting this to any other account and without touching Supabase/SQL.

**Architecture:** One new hardcoded-email check (`Auth.isFlowBypassAdmin`) added to the shared `auth.js` module, plus four small helper functions built on it (a memoized per-page session check, a placeholder-data seeder, a persistent nav bar, and a `syncToSupabase` guard). Every gate across 8 HTML pages gets a one-line `Auth._isBypassSession ||` (or equivalent) short-circuit added next to its existing check — no gate's original logic changes for anyone else.

**Tech Stack:** Vanilla JS, static HTML, Supabase JS client v2 (already loaded via CDN + `auth.js`). No build step, no test framework — verification uses `node --check` for syntax and a throwaway Node harness (with hand-rolled mocks for `window`/`document`/`localStorage`) to unit-test the new `auth.js` logic, matching this project's existing verification conventions (no Jest/Mocha in this repo).

**Reference spec:** [docs/superpowers/specs/2026-09-12-admin-flow-bypass-design.md](../specs/2026-09-12-admin-flow-bypass-design.md)

All commands below assume the working directory is the repo root:
`/Users/diegogarzamx/Desktop/Paideia Tech`

---

### Task 1: `auth.js` — bypass-check + placeholder-data + nav-bar helpers

**Files:**
- Modify: `auth.js:14` (new const), `auth.js:340-341` (append new methods)
- Test: `/tmp/test-auth-bypass.js` (scratch harness, not committed — deleted in Task 3)

- [ ] **Step 1: Write the failing test harness**

Create `/tmp/test-auth-bypass.js`:

```js
// Scratch verification harness for the admin flow bypass — mocks just
// enough of window/document/localStorage to load the real auth.js in
// Node and exercise its logic without a browser. Deleted after Task 3.
const assert = require('assert');

const calls = { upsert: [], signInWithOtp: [] };
let mockSessionEmail = null;
let mockIsEmailAuthorizedResult = false;

global.localStorage = (function () {
    let store = {};
    return {
        getItem: (k) => (k in store ? store[k] : null),
        setItem: (k, v) => { store[k] = String(v); },
        removeItem: (k) => { delete store[k]; },
        clear: () => { store = {}; }
    };
})();

global.document = {
    _byId: {},
    getElementById(id) { return this._byId[id] || null; },
    createElement(tag) { return { tagName: tag, id: '', style: {}, innerHTML: '' }; },
    body: {
        style: {},
        prependCount: 0,
        prepend(el) {
            this.prependCount++;
            if (el.id) global.document._byId[el.id] = el;
        }
    }
};

global.window = {
    supabase: {
        createClient: () => ({
            auth: {
                getSession: async () => ({ data: { session: mockSessionEmail ? { user: { email: mockSessionEmail } } : null } }),
                signInWithOtp: async (args) => { calls.signInWithOtp.push(args); return { error: null }; },
                verifyOtp: async () => ({ data: { session: null }, error: null }),
                signOut: async () => {}
            },
            from(table) {
                return { upsert: (row) => { calls.upsert.push({ table, row }); return Promise.resolve({ error: null }); } };
            },
            rpc: async (fnName) => {
                if (fnName === 'is_email_authorized') return { data: mockIsEmailAuthorizedResult, error: null };
                return { data: false, error: null };
            }
        })
    }
};

require('/Users/diegogarzamx/Desktop/Paideia Tech/auth.js');
const Auth = global.window.Auth;

async function main() {
    // --- isFlowBypassAdmin ---
    assert.strictEqual(Auth.isFlowBypassAdmin('paideia.tech@outlook.com'), true, 'exact match');
    assert.strictEqual(Auth.isFlowBypassAdmin('PAIDEIA.TECH@OUTLOOK.COM'), true, 'case-insensitive');
    assert.strictEqual(Auth.isFlowBypassAdmin('  paideia.tech@outlook.com  '), true, 'trims whitespace');
    assert.strictEqual(Auth.isFlowBypassAdmin('de.minconsciente@outlook.com'), false, 'other admin email must NOT bypass');
    assert.strictEqual(Auth.isFlowBypassAdmin(''), false, 'empty string');
    assert.strictEqual(Auth.isFlowBypassAdmin(null), false, 'null');
    assert.strictEqual(Auth.isFlowBypassAdmin(undefined), false, 'undefined');
    console.log('✓ isFlowBypassAdmin');

    // --- isBypassSession ---
    mockSessionEmail = null;
    assert.strictEqual(await Auth.isBypassSession(), false, 'no session -> false');
    mockSessionEmail = 'someone@else.com';
    assert.strictEqual(await Auth.isBypassSession(), false, 'non-admin session -> false');
    mockSessionEmail = 'paideia.tech@outlook.com';
    assert.strictEqual(await Auth.isBypassSession(), true, 'admin session -> true');
    assert.strictEqual(Auth._isBypassSession, true, 'memoized on Auth._isBypassSession');
    console.log('✓ isBypassSession');

    // --- ADMIN_PLACEHOLDER_AUTODIAGNOSTICO / ensureAdminPlaceholderData ---
    localStorage.clear();
    const placeholder = Auth.ADMIN_PLACEHOLDER_AUTODIAGNOSTICO();
    assert.strictEqual(Object.keys(placeholder.answers).length, 142, '142 answers');
    assert.strictEqual(placeholder.personalData.nombre, 'Candidato de Prueba (Admin)');
    assert.strictEqual(placeholder.ndaAccepted, true);
    assert.strictEqual(placeholder.triptychAccepted, true);

    Auth.ensureAdminPlaceholderData();
    let stored = JSON.parse(localStorage.getItem('autodiagnosticoData'));
    assert.strictEqual(Object.keys(stored.answers).length, 142, 'seeded into localStorage');

    localStorage.setItem('autodiagnosticoData', JSON.stringify({ personalData: { nombre: 'Real Candidate' }, answers: {} }));
    Auth.ensureAdminPlaceholderData();
    stored = JSON.parse(localStorage.getItem('autodiagnosticoData'));
    assert.strictEqual(stored.personalData.nombre, 'Real Candidate', 'must not overwrite existing data');
    console.log('✓ ADMIN_PLACEHOLDER_AUTODIAGNOSTICO / ensureAdminPlaceholderData');

    // --- renderAdminBar ---
    document._byId = {};
    document.body.prependCount = 0;
    Auth.renderAdminBar();
    assert.strictEqual(document.body.prependCount, 1, 'inserts exactly one bar');
    const bar = document._byId['adminBypassBar'];
    assert.ok(bar, 'bar registered under id adminBypassBar');
    assert.ok(bar.innerHTML.includes('entrega.html'), 'links to entrega.html');
    assert.ok(bar.innerHTML.includes('recuperar.html'), 'links to recuperar.html');
    Auth.renderAdminBar();
    assert.strictEqual(document.body.prependCount, 1, 'does not duplicate on second call');
    console.log('✓ renderAdminBar');

    console.log('\nALL TESTS PASSED');
}

main().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node /tmp/test-auth-bypass.js`
Expected: `FAILED: Auth.isFlowBypassAdmin is not a function` (or similar `TypeError`) — the methods don't exist in `auth.js` yet.

- [ ] **Step 3: Add `CANDIDATE_FLOW_BYPASS_EMAIL` constant**

Read `auth.js` first if not already in context. Modify line 14 (right after `SUPABASE_ANON_KEY`):

Old:
```js
const SUPABASE_URL = 'https://numsuiuwrvpprhnxovmh.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im51bXN1aXV3cnZwcHJobnhvdm1oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc2OTg3MDAsImV4cCI6MjEwMzI3NDcwMH0.LA_MJzLcJyVtysxsJAmWwWzKwgynNm-f6ejGEaEpG1Y';
```
New:
```js
const SUPABASE_URL = 'https://numsuiuwrvpprhnxovmh.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im51bXN1aXV3cnZwcHJobnhvdm1oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc2OTg3MDAsImV4cCI6MjEwMzI3NDcwMH0.LA_MJzLcJyVtysxsJAmWwWzKwgynNm-f6ejGEaEpG1Y';

// Correo con navegación libre de todo el flujo de candidato — SOLO este.
// Ver "Nota de seguridad" en docs/superpowers/specs/2026-09-12-admin-flow-bypass-design.md.
const CANDIDATE_FLOW_BYPASS_EMAIL = 'paideia.tech@outlook.com';
```

- [ ] **Step 4: Append the 5 new methods to the `Auth` object**

Modify the end of `auth.js` (lines 340-341, the closing of `_handleVerifyAdminOtp()` and the object):

Old:
```js
            Auth._renderAdminGateStep('code', 'Código incorrecto o expirado. Intenta de nuevo.');
        }
    }
};

window.Auth = Auth;
```
New:
```js
            Auth._renderAdminGateStep('code', 'Código incorrecto o expirado. Intenta de nuevo.');
        }
    },

    /* =========================================================
       Bypass de navegación libre — SOLO paideia.tech@outlook.com.
       Independiente de admins/is_admin() (esa tabla sigue siendo solo
       para admin-precios.html/admin-index.html). No otorga ningún
       privilegio de escritura real — ver "Nota de seguridad" en
       docs/superpowers/specs/2026-09-12-admin-flow-bypass-design.md.
    ========================================================= */
    isFlowBypassAdmin(email) {
        return !!email && email.trim().toLowerCase() === CANDIDATE_FLOW_BYPASS_EMAIL;
    },

    /* Memoiza en Auth._isBypassSession — cada página lo llama una vez y
       reutiliza el valor en el resto de sus checks sin volver a llamarlo. */
    async isBypassSession() {
        const session = await Auth.getSession();
        Auth._isBypassSession = !!session && Auth.isFlowBypassAdmin(session.user.email);
        return Auth._isBypassSession;
    },

    ADMIN_PLACEHOLDER_AUTODIAGNOSTICO() {
        const answers = {};
        for (let i = 0; i < 142; i++) answers[`admin_placeholder_${i}`] = 'SI';
        const nowIso = new Date().toISOString();
        return {
            personalData: {
                nombre: 'Candidato de Prueba (Admin)', curp: 'XAXX010101HNEXXXA4',
                domicilio: 'N/A', escolaridad: 'N/A', telefonoCasa: '', telefonoCelular: '',
                email: CANDIDATE_FLOW_BYPASS_EMAIL, fecha: nowIso.slice(0, 10)
            },
            certificados: [], sinCertificadosPrevios: true, answers,
            signatureDataUrl: null, signatureTypedName: 'Candidato de Prueba (Admin)', signatureMode: 'typed',
            triptychAccepted: true,
            ndaAccepted: true, ndaSignedAt: nowIso,
            ndaSignatureDataUrl: null, ndaSignatureTypedName: 'Candidato de Prueba (Admin)', ndaSignatureMode: 'typed',
            documentosNextcloud: {}
        };
    },

    /* Solo siembra si no hay nada guardado — nunca pisa avance real. */
    ensureAdminPlaceholderData() {
        if (!localStorage.getItem('autodiagnosticoData')) {
            localStorage.setItem('autodiagnosticoData', JSON.stringify(Auth.ADMIN_PLACEHOLDER_AUTODIAGNOSTICO()));
        }
    },

    /* Barra fija con links a las 8 páginas del flujo — llamada por cada
       una tras confirmar Auth._isBypassSession === true. */
    renderAdminBar() {
        if (document.getElementById('adminBypassBar')) return;
        const bar = document.createElement('div');
        bar.id = 'adminBypassBar';
        bar.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;background:#050a1a;border-bottom:2px solid #FFD700;padding:8px 12px;display:flex;gap:10px;flex-wrap:wrap;align-items:center;font-size:0.8rem;';
        bar.innerHTML = `
            <strong style="color:#FFD700;">🔧 Admin</strong>
            <a href="autodiagnostico.html" style="color:#0088FF;">Autodiagnóstico</a>
            <a href="alineacion.html" style="color:#0088FF;">Alineación</a>
            <a href="plan-evaluacion.html" style="color:#0088FF;">Plan Evaluación</a>
            <a href="documentos-sesion.html" style="color:#0088FF;">Doc. Sesión</a>
            <a href="encuesta-satisfaccion.html" style="color:#0088FF;">Encuesta</a>
            <a href="evidencias.html" style="color:#0088FF;">Evidencias</a>
            <a href="entrega.html" style="color:#0088FF;">Entrega</a>
            <a href="recuperar.html" style="color:#0088FF;">Login</a>
        `;
        document.body.prepend(bar);
        document.body.style.paddingTop = '40px';
    }
};

window.Auth = Auth;
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `node /tmp/test-auth-bypass.js`
Expected:
```
✓ isFlowBypassAdmin
✓ isBypassSession
✓ ADMIN_PLACEHOLDER_AUTODIAGNOSTICO / ensureAdminPlaceholderData
✓ renderAdminBar

ALL TESTS PASSED
```

- [ ] **Step 6: Commit**

```bash
cd "/Users/diegogarzamx/Desktop/Paideia Tech"
git add auth.js
git commit -m "$(cat <<'EOF'
Agrega bypass de navegación libre para paideia.tech@outlook.com

Nuevos helpers en auth.js (isFlowBypassAdmin, isBypassSession,
placeholder de Autodiagnóstico, barra de navegación) — todavía no
conectados a ninguna página. Exclusivo de esta cuenta, independiente
de admins/is_admin().

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `auth.js` — skip `syncToSupabase` for the bypass session

**Files:**
- Modify: `auth.js:51-52`
- Test: `/tmp/test-auth-bypass.js`

- [ ] **Step 1: Add the failing test**

Insert this new section into `/tmp/test-auth-bypass.js`, right before the `console.log('\nALL TESTS PASSED');` line:

```js
    // --- syncToSupabase guard ---
    mockSessionEmail = 'paideia.tech@outlook.com';
    calls.upsert = [];
    Auth.syncToSupabase('autodiagnostico_data', { foo: 'bar' }, 'CURP123', 'Nombre');
    await new Promise((r) => setTimeout(r, 900));
    assert.strictEqual(calls.upsert.length, 0, 'bypass admin session must NOT upsert');

    mockSessionEmail = 'real.candidate@example.com';
    calls.upsert = [];
    Auth.syncToSupabase('autodiagnostico_data', { foo: 'bar' }, 'CURP123', 'Nombre');
    await new Promise((r) => setTimeout(r, 900));
    assert.strictEqual(calls.upsert.length, 1, 'normal session must still upsert');
    console.log('✓ syncToSupabase guard');

```

- [ ] **Step 2: Run it to verify it fails**

Run: `node /tmp/test-auth-bypass.js`
Expected: `FAILED: bypass admin session must NOT upsert` (the guard doesn't exist yet, so it upserts for every session with one).

- [ ] **Step 3: Add the guard**

Modify `auth.js` lines 51-52:

Old:
```js
            try {
                const session = await Auth.getSession();
                if (!session) return;
                const row = {
```
New:
```js
            try {
                const session = await Auth.getSession();
                if (!session) return;
                if (await Auth.isBypassSession()) return;
                const row = {
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node /tmp/test-auth-bypass.js`
Expected: all previous `✓` lines plus `✓ syncToSupabase guard`, ending in `ALL TESTS PASSED`.

- [ ] **Step 5: Commit**

```bash
cd "/Users/diegogarzamx/Desktop/Paideia Tech"
git add auth.js
git commit -m "$(cat <<'EOF'
auth.js: no sincronizar progreso a Supabase para la sesión bypass

Reforzado además por RLS (paideia.tech@outlook.com nunca se agrega
a candidatos_fase_pagos), así que aunque este guard fallara la
escritura real seguiría rechazada del lado de la base de datos.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `auth.js` — let the bypass email through the OTP-send gate; clean up harness

**Files:**
- Modify: `auth.js:224`
- Test: `/tmp/test-auth-bypass.js` (deleted at the end of this task)

- [ ] **Step 1: Add the failing test**

Insert this new section into `/tmp/test-auth-bypass.js`, right before `console.log('\nALL TESTS PASSED');`:

```js
    // --- _handleSendOtp OR-check ---
    document._byId['authEmailInput'] = { value: 'paideia.tech@outlook.com' };
    Auth._authGateContainer = { innerHTML: '' };
    mockIsEmailAuthorizedResult = false; // simulate NOT authorized in candidatos_fase_pagos
    calls.signInWithOtp = [];
    await Auth._handleSendOtp();
    assert.strictEqual(calls.signInWithOtp.length, 1, 'bypass admin reaches signInWithOtp even when isEmailAuthorized is false');

    document._byId['authEmailInput'] = { value: 'random@nonauthorized.com' };
    Auth._authGateContainer = { innerHTML: '' };
    mockIsEmailAuthorizedResult = false;
    calls.signInWithOtp = [];
    await Auth._handleSendOtp();
    assert.strictEqual(calls.signInWithOtp.length, 0, 'non-authorized non-admin email stays blocked');
    console.log('✓ _handleSendOtp OR-check');

```

- [ ] **Step 2: Run it to verify it fails**

Run: `node /tmp/test-auth-bypass.js`
Expected: `FAILED: bypass admin reaches signInWithOtp even when isEmailAuthorized is false` — today the gate blocks everyone not in `candidatos_fase_pagos`, admin included.

- [ ] **Step 3: Add the OR-check**

Modify `auth.js` line 224:

Old:
```js
        const authorized = await Auth.isEmailAuthorized(email);
```
New:
```js
        const authorized = Auth.isFlowBypassAdmin(email) || await Auth.isEmailAuthorized(email);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node /tmp/test-auth-bypass.js`
Expected: all `✓` lines plus `✓ _handleSendOtp OR-check`, ending in `ALL TESTS PASSED`.

- [ ] **Step 5: Delete the scratch harness**

```bash
rm /tmp/test-auth-bypass.js
```

- [ ] **Step 6: Commit**

```bash
cd "/Users/diegogarzamx/Desktop/Paideia Tech"
git add auth.js
git commit -m "$(cat <<'EOF'
auth.js: deja pasar el envío de OTP para paideia.tech@outlook.com

Última pieza de auth.js para el bypass — con esto la cuenta puede
recibir un código real y obtener sesión aunque no esté en
candidatos_fase_pagos. Los 8 archivos HTML que consumen estos
helpers se conectan en las siguientes tareas.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Wire up `autodiagnostico.html`

**Files:**
- Modify: `autodiagnostico.html:1020-1021`

- [ ] **Step 1: Make the edit**

Old:
```js
    async function handleAuthVerified(session) {
        if (localStorage.getItem('autodiagnosticoData')) {
```
New:
```js
    async function handleAuthVerified(session) {
        if (Auth.isFlowBypassAdmin(session.user.email)) {
            Auth._isBypassSession = true;
            Auth.ensureAdminPlaceholderData();
            Auth.renderAdminBar();
            currentStepIndex = 0;
            renderStep();
            return;
        }
        if (localStorage.getItem('autodiagnosticoData')) {
```

This is an early return before the existing recover/claim-progress logic, so the bypass session never touches `saveProgress()` (which would overwrite the just-seeded placeholder with the still-empty in-memory `personalData`/`answers`).

- [ ] **Step 2: Verify syntax**

```bash
cd "/Users/diegogarzamx/Desktop/Paideia Tech"
node -e "const fs=require('fs');const html=fs.readFileSync('autodiagnostico.html','utf8');const s=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];fs.writeFileSync('/tmp/extracted.js', s[s.length-1][1]);" && node --check /tmp/extracted.js
```
Expected: no output (exit code 0). A syntax error would print `SyntaxError: ...` and exit non-zero.

- [ ] **Step 3: Commit**

```bash
cd "/Users/diegogarzamx/Desktop/Paideia Tech"
git add autodiagnostico.html
git commit -m "$(cat <<'EOF'
autodiagnostico.html: conecta el bypass de admin al login OTP

paideia.tech@outlook.com, tras verificar su código, siembra el
placeholder y ve la barra de navegación en vez de entrar al wizard.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Wire up `recuperar.html`

**Files:**
- Modify: `recuperar.html:82-86`

- [ ] **Step 1: Make the edit**

Old:
```js
    async function handleVerified(session) {
        const container = document.getElementById('authGateContainer');
        container.innerHTML = `<p class="spinner">Cargando tu progreso...</p>`;
        const row = await Auth.pullMyRow();
        const restored = Auth.restoreLocalStorageFromRow(row);
```
New:
```js
    async function handleVerified(session) {
        const container = document.getElementById('authGateContainer');
        if (Auth.isFlowBypassAdmin(session.user.email)) {
            Auth._isBypassSession = true;
            Auth.ensureAdminPlaceholderData();
            Auth.renderAdminBar();
            container.innerHTML = `<p class="msg success">✅ Sesión de administrador iniciada. Usa la barra de arriba para navegar cualquier página del flujo.</p>`;
            return;
        }
        container.innerHTML = `<p class="spinner">Cargando tu progreso...</p>`;
        const row = await Auth.pullMyRow();
        const restored = Auth.restoreLocalStorageFromRow(row);
```

- [ ] **Step 2: Verify syntax**

```bash
cd "/Users/diegogarzamx/Desktop/Paideia Tech"
node -e "const fs=require('fs');const html=fs.readFileSync('recuperar.html','utf8');const s=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];fs.writeFileSync('/tmp/extracted.js', s[s.length-1][1]);" && node --check /tmp/extracted.js
```
Expected: no output (exit code 0).

- [ ] **Step 3: Commit**

```bash
cd "/Users/diegogarzamx/Desktop/Paideia Tech"
git add recuperar.html
git commit -m "$(cat <<'EOF'
recuperar.html: conecta el bypass de admin al login OTP

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Wire up `plan-evaluacion.html`

**Files:**
- Modify: `plan-evaluacion.html:729-731`

- [ ] **Step 1: Make the edit**

Old:
```js
    async function render() {
        const app = document.getElementById('app');
        const result = loadAutodiagnosticoResult();
```
New:
```js
    async function render() {
        const app = document.getElementById('app');
        if (await Auth.isBypassSession()) {
            Auth.ensureAdminPlaceholderData();
            Auth.renderAdminBar();
        }
        const result = loadAutodiagnosticoResult();
```

No Nextcloud or payment gate on this page — this is the only change it needs.

- [ ] **Step 2: Verify syntax**

```bash
cd "/Users/diegogarzamx/Desktop/Paideia Tech"
node -e "const fs=require('fs');const html=fs.readFileSync('plan-evaluacion.html','utf8');const s=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];fs.writeFileSync('/tmp/extracted.js', s[s.length-1][1]);" && node --check /tmp/extracted.js
```
Expected: no output (exit code 0).

- [ ] **Step 3: Commit**

```bash
cd "/Users/diegogarzamx/Desktop/Paideia Tech"
git add plan-evaluacion.html
git commit -m "$(cat <<'EOF'
plan-evaluacion.html: conecta el bypass de admin

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Wire up `alineacion.html`

**Files:**
- Modify: `alineacion.html:238-240`, `alineacion.html:286`, `alineacion.html:301-304`

- [ ] **Step 1: Seed placeholder + bar at the top of `render()`**

Old:
```js
    async function render() {
        const app = document.getElementById('app');
        const result = loadAutodiagnosticoResult();
```
New:
```js
    async function render() {
        const app = document.getElementById('app');
        if (await Auth.isBypassSession()) {
            Auth.ensureAdminPlaceholderData();
            Auth.renderAdminBar();
        }
        const result = loadAutodiagnosticoResult();
```

- [ ] **Step 2: Bypass the Nextcloud-documents gate**

Old:
```js
        const registroCompleto = documentosFaseCompletos(filaCandidato && filaCandidato.autodiagnostico_data, ['autodiagnostico', 'acuseTriptico', 'acuseNda']);
```
New:
```js
        const registroCompleto = Auth._isBypassSession || documentosFaseCompletos(filaCandidato && filaCandidato.autodiagnostico_data, ['autodiagnostico', 'acuseTriptico', 'acuseNda']);
```

- [ ] **Step 3: Bypass the payment gate**

Old:
```js
        const email = session.user.email;
        const autorizado = await Auth.isPhaseAuthorized(email, 'alineacion');

        if (!autorizado) {
```
New:
```js
        const email = session.user.email;
        const autorizado = Auth._isBypassSession || await Auth.isPhaseAuthorized(email, 'alineacion');

        if (!autorizado) {
```

- [ ] **Step 4: Verify syntax**

```bash
cd "/Users/diegogarzamx/Desktop/Paideia Tech"
node -e "const fs=require('fs');const html=fs.readFileSync('alineacion.html','utf8');const s=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];fs.writeFileSync('/tmp/extracted.js', s[s.length-1][1]);" && node --check /tmp/extracted.js
```
Expected: no output (exit code 0).

- [ ] **Step 5: Commit**

```bash
cd "/Users/diegogarzamx/Desktop/Paideia Tech"
git add alineacion.html
git commit -m "$(cat <<'EOF'
alineacion.html: conecta el bypass de admin (Nextcloud + pago)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Wire up `documentos-sesion.html`

**Files:**
- Modify: `documentos-sesion.html:606-609`, `documentos-sesion.html:633`, `documentos-sesion.html:645`

- [ ] **Step 1: Seed placeholder + bar at the top of `renderStep()`**

Old:
```js
        const app = document.getElementById('app');
        const result = loadAutodiagnosticoResult();

        if (step !== 'intro' && !result) {
```
New:
```js
        const app = document.getElementById('app');
        if (await Auth.isBypassSession()) {
            Auth.ensureAdminPlaceholderData();
            Auth.renderAdminBar();
        }
        const result = loadAutodiagnosticoResult();

        if (step !== 'intro' && !result) {
```

- [ ] **Step 2: Bypass the Nextcloud-documents gate**

Old:
```js
            const alineacionCompleta = documentosFaseCompletos(filaCandidato && filaCandidato.plan_evaluacion_data, ['planEvaluacion', 'acusePlanEvaluacion']);
```
New:
```js
            const alineacionCompleta = Auth._isBypassSession || documentosFaseCompletos(filaCandidato && filaCandidato.plan_evaluacion_data, ['planEvaluacion', 'acusePlanEvaluacion']);
```

- [ ] **Step 3: Bypass the payment gate**

Old:
```js
        if (step !== 'intro' && !(await Auth.isPhaseAuthorized(session.user.email, 'evaluacion'))) {
```
New:
```js
        if (step !== 'intro' && !Auth._isBypassSession && !(await Auth.isPhaseAuthorized(session.user.email, 'evaluacion'))) {
```

- [ ] **Step 4: Verify syntax**

```bash
cd "/Users/diegogarzamx/Desktop/Paideia Tech"
node -e "const fs=require('fs');const html=fs.readFileSync('documentos-sesion.html','utf8');const s=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];fs.writeFileSync('/tmp/extracted.js', s[s.length-1][1]);" && node --check /tmp/extracted.js
```
Expected: no output (exit code 0).

- [ ] **Step 5: Commit**

```bash
cd "/Users/diegogarzamx/Desktop/Paideia Tech"
git add documentos-sesion.html
git commit -m "$(cat <<'EOF'
documentos-sesion.html: conecta el bypass de admin (Nextcloud + pago)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Wire up `encuesta-satisfaccion.html`

**Files:**
- Modify: `encuesta-satisfaccion.html:216-218`, `encuesta-satisfaccion.html:250`

- [ ] **Step 1: Seed placeholder + bar at the top of `render()`**

Old:
```js
    async function render() {
        const app = document.getElementById('app');
        const result = loadAutodiagnosticoResult();
```
New:
```js
    async function render() {
        const app = document.getElementById('app');
        if (await Auth.isBypassSession()) {
            Auth.ensureAdminPlaceholderData();
            Auth.renderAdminBar();
        }
        const result = loadAutodiagnosticoResult();
```

- [ ] **Step 2: Bypass the Nextcloud-documents gate (no payment gate on this page)**

Old:
```js
        const sesionCompleta = documentosFaseCompletos(filaCandidato && filaCandidato.documentos_sesion_data, ['ficha', 'consentimiento', 'plan_sesion', 'plan_seguimiento']);
```
New:
```js
        const sesionCompleta = Auth._isBypassSession || documentosFaseCompletos(filaCandidato && filaCandidato.documentos_sesion_data, ['ficha', 'consentimiento', 'plan_sesion', 'plan_seguimiento']);
```

- [ ] **Step 3: Verify syntax**

```bash
cd "/Users/diegogarzamx/Desktop/Paideia Tech"
node -e "const fs=require('fs');const html=fs.readFileSync('encuesta-satisfaccion.html','utf8');const s=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];fs.writeFileSync('/tmp/extracted.js', s[s.length-1][1]);" && node --check /tmp/extracted.js
```
Expected: no output (exit code 0).

- [ ] **Step 4: Commit**

```bash
cd "/Users/diegogarzamx/Desktop/Paideia Tech"
git add encuesta-satisfaccion.html
git commit -m "$(cat <<'EOF'
encuesta-satisfaccion.html: conecta el bypass de admin (Nextcloud)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Wire up `evidencias.html`

**Files:**
- Modify: `evidencias.html:289-291`, `evidencias.html:323`

- [ ] **Step 1: Seed placeholder + bar at the top of `render()`**

Old:
```js
    async function render() {
        const app = document.getElementById('app');
        const result = loadAutodiagnosticoResult();
```
New:
```js
    async function render() {
        const app = document.getElementById('app');
        if (await Auth.isBypassSession()) {
            Auth.ensureAdminPlaceholderData();
            Auth.renderAdminBar();
        }
        const result = loadAutodiagnosticoResult();
```

- [ ] **Step 2: Bypass the Nextcloud-documents gate (no payment gate on this page)**

Old:
```js
        const encuestaCompleta = documentosFaseCompletos(filaCandidato && filaCandidato.encuesta_data, ['encuesta']);
```
New:
```js
        const encuestaCompleta = Auth._isBypassSession || documentosFaseCompletos(filaCandidato && filaCandidato.encuesta_data, ['encuesta']);
```

- [ ] **Step 3: Verify syntax**

```bash
cd "/Users/diegogarzamx/Desktop/Paideia Tech"
node -e "const fs=require('fs');const html=fs.readFileSync('evidencias.html','utf8');const s=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];fs.writeFileSync('/tmp/extracted.js', s[s.length-1][1]);" && node --check /tmp/extracted.js
```
Expected: no output (exit code 0).

- [ ] **Step 4: Commit**

```bash
cd "/Users/diegogarzamx/Desktop/Paideia Tech"
git add evidencias.html
git commit -m "$(cat <<'EOF'
evidencias.html: conecta el bypass de admin (Nextcloud)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: Wire up `entrega.html`

**Files:**
- Modify: `entrega.html:189-191`, `entrega.html:217`, `entrega.html:238`

- [ ] **Step 1: Seed placeholder + bar at the top of `render()`**

Old:
```js
    async function render() {
        const app = document.getElementById('app');
        const result = loadAutodiagnosticoResult();
```
New:
```js
    async function render() {
        const app = document.getElementById('app');
        if (await Auth.isBypassSession()) {
            Auth.ensureAdminPlaceholderData();
            Auth.renderAdminBar();
        }
        const result = loadAutodiagnosticoResult();
```

- [ ] **Step 2: Bypass the Nextcloud-documents gate**

Old:
```js
        const evidenciasCompletas = documentosFaseCompletos(filaCandidato && filaCandidato.evidencias_data, ['zoom', 'ine', 'curp', 'fotoDiploma']);
```
New:
```js
        const evidenciasCompletas = Auth._isBypassSession || documentosFaseCompletos(filaCandidato && filaCandidato.evidencias_data, ['zoom', 'ine', 'curp', 'fotoDiploma']);
```

- [ ] **Step 3: Bypass the payment gate**

Old:
```js
        const email = session.user.email;
        const autorizado = await Auth.isPhaseAuthorized(email, 'entrega');
```
New:
```js
        const email = session.user.email;
        const autorizado = Auth._isBypassSession || await Auth.isPhaseAuthorized(email, 'entrega');
```

- [ ] **Step 4: Verify syntax**

```bash
cd "/Users/diegogarzamx/Desktop/Paideia Tech"
node -e "const fs=require('fs');const html=fs.readFileSync('entrega.html','utf8');const s=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];fs.writeFileSync('/tmp/extracted.js', s[s.length-1][1]);" && node --check /tmp/extracted.js
```
Expected: no output (exit code 0).

- [ ] **Step 5: Commit**

```bash
cd "/Users/diegogarzamx/Desktop/Paideia Tech"
git add entrega.html
git commit -m "$(cat <<'EOF'
entrega.html: conecta el bypass de admin (Nextcloud + pago)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: Full syntax pass + regression sanity check

**Files:** none modified — verification only.

- [ ] **Step 1: Syntax-check every touched file in one pass**

```bash
cd "/Users/diegogarzamx/Desktop/Paideia Tech"
node --check auth.js
for f in autodiagnostico.html recuperar.html plan-evaluacion.html alineacion.html documentos-sesion.html encuesta-satisfaccion.html evidencias.html entrega.html; do
  node -e "const fs=require('fs');const html=fs.readFileSync('$f','utf8');const s=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];fs.writeFileSync('/tmp/extracted.js', s[s.length-1][1]);" && node --check /tmp/extracted.js && echo "OK: $f"
done
```
Expected: `OK: <filename>` printed for all 8 HTML files, no `SyntaxError` anywhere, and `node --check auth.js` prints nothing.

- [ ] **Step 2: Grep-verify every gate site got the bypass condition**

```bash
cd "/Users/diegogarzamx/Desktop/Paideia Tech"
echo "--- Auth._isBypassSession (gate short-circuits, underscore) ---"
grep -c "Auth\._isBypassSession" alineacion.html documentos-sesion.html entrega.html encuesta-satisfaccion.html evidencias.html autodiagnostico.html recuperar.html
echo "--- Auth.isBypassSession() (bar-injection call, no underscore) ---"
grep -c "Auth\.isBypassSession()" plan-evaluacion.html alineacion.html documentos-sesion.html encuesta-satisfaccion.html evidencias.html entrega.html
```
Expected counts for the first command (each file has its own line in the output, in the order listed above):
```
alineacion.html:2
documentos-sesion.html:2
entrega.html:2
encuesta-satisfaccion.html:1
evidencias.html:1
autodiagnostico.html:1
recuperar.html:1
```
(`alineacion.html`/`documentos-sesion.html`/`entrega.html` each have 2 — the Nextcloud-documents gate and the payment gate; `encuesta-satisfaccion.html`/`evidencias.html` have 1 — Nextcloud gate only, no payment gate on those pages; `autodiagnostico.html`/`recuperar.html` have 1 — the manual `Auth._isBypassSession = true;` in their early-return block.)

Expected counts for the second command — every listed file (`plan-evaluacion.html`, `alineacion.html`, `documentos-sesion.html`, `encuesta-satisfaccion.html`, `evidencias.html`, `entrega.html`) prints `1` (the single `await Auth.isBypassSession()` call at the top of its render function that seeds the placeholder and bar).

If any count doesn't match, re-open that file and check the corresponding task's edit landed correctly before continuing.

- [ ] **Step 3: No commit needed — this task is verification-only.** If Step 2 surfaced a missing edit, go back and fix it as part of the relevant Task 4-11, re-run Task 12, then continue.

---

### Task 13: Deploy and live verification (interactive — needs the user)

**Files:** none — this task pushes and verifies in the browser.

This task cannot be fully automated: confirming the bypass actually works requires receiving a real OTP email at `paideia.tech@outlook.com`, which only the user can read. Do not skip straight to claiming success — get the user's confirmation of the code at Step 3 below.

- [ ] **Step 1: Push to trigger the Vercel deploy**

Tell the user this pushes 11 commits to `main` (Tasks 1-11, one each), which auto-deploys to the live production site (`https://sepconocer.paideiatech.com`). Get explicit confirmation before running:

```bash
cd "/Users/diegogarzamx/Desktop/Paideia Tech"
git push origin main
```

Wait ~30-60 seconds for the Vercel deploy to finish (per `CLAUDE.md`'s documented deploy time) before continuing.

- [ ] **Step 2: Regression check — a normal (non-bypass) email still gets blocked**

Using the Browser tool, navigate to `https://sepconocer.paideiatech.com/recuperar.html`, enter an email that is neither the bypass account nor a real authorized candidate (e.g. `test-regression-check@example.com`), and click send code. Confirm the page shows the existing "no está autorizado todavía" message and does **not** proceed to a code-entry screen — this proves the bypass didn't accidentally weaken the gate for everyone else.

- [ ] **Step 3: Verify the bypass — ask the user to relay the OTP code**

Using the Browser tool, navigate to `https://sepconocer.paideiatech.com/recuperar.html`, enter `paideia.tech@outlook.com`, and click send code. Then ask the user (who has access to that inbox) for the code that arrives, enter it, and confirm:
- The page shows "Sesión de administrador iniciada" (not the normal "recuperamos tu avance" message).
- The 🔧 Admin bar appears fixed at the top with all 8 links.
- Clicking each link (`alineacion.html`, `plan-evaluacion.html`, `documentos-sesion.html`, `encuesta-satisfaccion.html`, `evidencias.html`, `entrega.html`) loads that page's real content — not a "completa tu Autodiagnóstico first", "verifica tu correo", "faltan documentos por subir", or payment screen.
- `read_console_messages` shows no new JS errors on any of the 8 pages.

- [ ] **Step 4: Report back to the user**

Summarize what was verified (regression check + full bypass walk-through), and flag anything that didn't behave as expected instead of claiming success.
