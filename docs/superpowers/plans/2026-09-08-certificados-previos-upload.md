# Certificados de Formación Previa — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Replace the fixed checkbox accordion of specialties in `autodiagnostico.html`'s "personal" step with a certificate upload list — the candidate writes each certification's name exactly as it appears on the document and uploads the file (PDF/image) to Supabase Storage, and must either do this or explicitly declare they have no prior certificates before advancing.

**Architecture:** This is a static multi-page site (plain HTML + vanilla JS per page, no bundler, no build step, no test framework). "Verification" in this codebase means: (1) `node --check` on extracted inline `<script>` content to catch syntax errors, and (2) manual interaction in the Browser preview tool, since there is no test runner. There is no red/green TDD cycle here — each task's "test" step is one of those two checks, run after the implementation, not before.

**Tech Stack:** Vanilla JS, Supabase JS SDK v2 (`@supabase/supabase-js@2`, loaded via CDN `<script>` tag), Supabase Storage + Postgres RLS, jsPDF (unaffected by this change).

**Reference spec:** `docs/superpowers/specs/2026-09-08-certificados-previos-upload-design.md`

---

### Task 1: `auth.js` — add the Storage upload helper

**Files:**
- Modify: `auth.js:69-85`

- [x] **Step 1: Add `uploadCertificado()` right after `pullMyRow()`**

In `auth.js`, find this exact block (the end of the existing `pullMyRow` method):

```js
    /* Lee la fila del candidato autenticado (RLS ya la limita a la propia). */
    async pullMyRow() {
        const session = await Auth.getSession();
        if (!session) return null;
        try {
            const { data, error } = await supabaseClient
                .from('candidatos_ec1375')
                .select('*')
                .eq('user_id', session.user.id)
                .maybeSingle();
            if (error) { console.warn('No se pudo leer tu progreso:', error); return null; }
            return data;
        } catch (e) {
            console.warn('No se pudo leer tu progreso:', e);
            return null;
        }
    },
```

Replace it with the same block plus a new method appended after it:

```js
    /* Lee la fila del candidato autenticado (RLS ya la limita a la propia). */
    async pullMyRow() {
        const session = await Auth.getSession();
        if (!session) return null;
        try {
            const { data, error } = await supabaseClient
                .from('candidatos_ec1375')
                .select('*')
                .eq('user_id', session.user.id)
                .maybeSingle();
            if (error) { console.warn('No se pudo leer tu progreso:', error); return null; }
            return data;
        } catch (e) {
            console.warn('No se pudo leer tu progreso:', e);
            return null;
        }
    },

    /* Sube un certificado de formación previa al bucket privado
       'certificados-previos' (Storage). El caller arma `path` como
       `{user_id}/{timestamp}-{nombre-sanitizado}` para que la política RLS
       de storage.objects (auth.uid() = primer segmento de la ruta) aplique.
       Nunca lanza — el caller decide qué mostrar según `error`. */
    async uploadCertificado(file, path) {
        try {
            const { data, error } = await supabaseClient.storage.from('certificados-previos').upload(path, file);
            if (error) return { path: null, error };
            return { path: data.path, error: null };
        } catch (e) {
            return { path: null, error: e };
        }
    },
```

- [x] **Step 2: Verify syntax**

Run:

```bash
node --check auth.js
```

Expected: no output, exit code 0.

- [x] **Step 3: Commit**

```bash
git add auth.js
git commit -m "$(cat <<'EOF'
Add Auth.uploadCertificado() Storage upload helper

Supports the new certificate-upload UI being added to
autodiagnostico.html's personal-data step.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: SQL migration for the Storage bucket's RLS policies

**Files:**
- Create: `_internal_no_publicar/02-sql/supabase_setup_v6_certificados_storage.sql`

This file is gitignored (`_internal_no_publicar/` is in `.gitignore`) — it will NOT be committed to git, but still gets created on disk for Diego to run manually in the Supabase SQL Editor.

- [x] **Step 1: Check the directory exists**

```bash
ls "_internal_no_publicar/02-sql/"
```

Expected: a listing of existing `.sql` files (this directory already exists in the project).

- [x] **Step 2: Write the migration file**

Create `_internal_no_publicar/02-sql/supabase_setup_v6_certificados_storage.sql` with this exact content:

```sql
-- Bucket de Storage para certificados de formación previa que el candidato
-- sube durante el Autodiagnóstico (autodiagnostico.html, paso "personal").
-- Este script SOLO agrega políticas RLS sobre storage.objects — el bucket
-- en sí ("certificados-previos", privado) se crea a mano en el dashboard:
-- Storage → New bucket → nombre "certificados-previos" → Public: NO.
--
-- Correr esto DESPUÉS de crear el bucket, en el SQL Editor del proyecto
-- (numsuiuwrvpprhnxovmh, cuenta paideia.tech@outlook.com).
--
-- Convención de ruta: cada archivo se guarda en
-- "{user_id}/{timestamp}-{nombre-archivo}" — el primer segmento de la ruta
-- es el user_id del candidato dueño del archivo, así que las políticas de
-- abajo comparan ese segmento contra auth.uid() en vez de mantener una
-- tabla de dueños aparte. storage.objects ya tiene RLS habilitado por
-- Supabase por defecto — no hace falta (ni se puede) alterarlo aquí.

-- 1. Un candidato autenticado puede subir archivos solo dentro de su
--    propia carpeta (primer segmento de la ruta = su propio user_id).
create policy "candidatos suben su propio certificado"
  on storage.objects
  for insert
  with check (
    bucket_id = 'certificados-previos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- 2. Un candidato autenticado puede leer/descargar solo sus propios
--    archivos ya subidos (por ejemplo, al recargar el paso "personal" a
--    medio llenar y restaurar el estado desde Supabase).
create policy "candidatos leen su propio certificado"
  on storage.objects
  for select
  using (
    bucket_id = 'certificados-previos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- No se agregan políticas de UPDATE/DELETE a propósito: "Quitar" en la UI
-- del Autodiagnóstico solo borra la referencia local, nunca el archivo del
-- bucket (ver docs/superpowers/specs/2026-09-08-certificados-previos-upload-design.md).
```

- [x] **Step 3: Confirm the file is ignored by git (won't get committed by accident)**

```bash
git check-ignore -v "_internal_no_publicar/02-sql/supabase_setup_v6_certificados_storage.sql"
```

Expected: prints a match against the `_internal_no_publicar/` line in `.gitignore` (confirms git will skip this file — nothing to commit for this task).

---

### Task 3: `autodiagnostico.html` — replace the specialty accordion with the certificate upload UI (CSS + state + functions + markup + validation)

This is one task because all these pieces only make sense together — splitting them into separate commits would leave the file referencing functions/variables that don't exist yet in between commits.

**Files:**
- Modify: `autodiagnostico.html` (CSS block ~line 150-254, data constant ~line 503-556, state ~line 934-937, `loadProgress`/`saveProgress` ~line 958-991, `restartDiagnostico` ~line 1154-1174, `renderPersonalForm` cert field-group ~line 1192-1197, the accordion function block ~line 1232-1307, `isStepValid` ~line 1779-1801)

- [x] **Step 1: Replace the accordion CSS with the certificate-row CSS**

Find this exact block:

```css
        /* CERTIFICACIONES ACCORDION */
        .cert-accordion {
            border: 1px solid rgba(255,255,255,0.15);
            border-radius: 8px;
            overflow: hidden;
        }

        .cert-category {
            border-bottom: 1px solid rgba(255,255,255,0.1);
        }

        .cert-category:last-child { border-bottom: none; }

        .cert-category summary {
            padding: 14px 16px;
            background: var(--dark);
            color: var(--text-bright);
            font-size: 0.88rem;
            font-weight: 600;
            cursor: pointer;
            list-style: none;
            display: flex;
            align-items: center;
            justify-content: space-between;
            user-select: none;
        }

        .cert-category summary::-webkit-details-marker { display: none; }

        .cert-category summary::after {
            content: '▾';
            color: var(--primary);
            font-size: 0.8rem;
            margin-left: 8px;
        }

        .cert-category[open] summary::after { content: '▴'; }

        .cert-count {
            background: var(--primary);
            color: white;
            font-size: 0.72rem;
            font-weight: 700;
            padding: 2px 8px;
            border-radius: 10px;
            margin-left: auto;
            margin-right: 8px;
        }

        .cert-items {
            padding: 8px 16px 14px;
            background: rgba(0,0,0,0.15);
        }

        .cert-item-row {
            display: flex;
            align-items: flex-start;
            gap: 10px;
            padding: 8px 0;
            font-size: 0.85rem;
            color: var(--text);
            cursor: pointer;
        }

        .cert-item-row input[type="checkbox"] {
            width: 18px;
            height: 18px;
            flex-shrink: 0;
            margin-top: 1px;
            accent-color: var(--primary);
        }

        .cert-items input[type="text"] {
            padding: 10px 12px;
            background: var(--dark);
            border: 1px solid rgba(255,255,255,0.15);
            border-radius: 6px;
            color: var(--text-bright);
            font-size: 0.85rem;
            font-family: inherit;
        }

        .cert-chips {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            margin-top: 12px;
        }

        .cert-chip {
            background: rgba(0, 255, 136, 0.1);
            border: 1px solid var(--success);
            color: var(--success);
            font-size: 0.78rem;
            font-weight: 600;
            padding: 5px 12px;
            border-radius: 20px;
        }

        .cert-empty-hint {
            font-size: 0.8rem;
            color: rgba(255,255,255,0.35);
            font-style: italic;
            margin-top: 10px;
        }
```

Replace it with:

```css
        /* CERTIFICADOS DE FORMACIÓN PREVIA */
        .cert-sin-toggle {
            display: flex;
            align-items: flex-start;
            gap: 10px;
            font-size: 0.85rem;
            color: var(--text);
            cursor: pointer;
            margin-bottom: 14px;
        }

        .cert-sin-toggle input[type="checkbox"] {
            width: 18px;
            height: 18px;
            flex-shrink: 0;
            margin-top: 1px;
            accent-color: var(--primary);
        }

        .cert-row {
            border: 1px solid rgba(255,255,255,0.15);
            border-radius: 8px;
            padding: 14px;
            margin-bottom: 12px;
            background: rgba(0,0,0,0.15);
        }

        .cert-row input[type="text"] {
            width: 100%;
            padding: 10px 12px;
            background: var(--dark);
            border: 1px solid rgba(255,255,255,0.15);
            border-radius: 6px;
            color: var(--text-bright);
            font-size: 0.85rem;
            font-family: inherit;
            margin-bottom: 10px;
        }

        .cert-row input[type="file"] {
            width: 100%;
            font-size: 0.8rem;
            color: var(--text);
            margin-bottom: 10px;
        }

        .cert-row-status { font-size: 0.8rem; margin-bottom: 10px; }
        .cert-row-status-ok { color: var(--success); }
        .cert-row-status-error { color: var(--danger); }
        .cert-row-status-pending { color: rgba(255,255,255,0.5); }

        .btn-sm { padding: 8px 16px; font-size: 0.82rem; }
```

- [x] **Step 2: Remove the `CERTIFICACIONES_EC1375` data constant**

Find this exact block:

```js
    /* =========================================================
       DATA: Certificaciones y especialidades que cubre el EC1375
    ========================================================= */
    const CERTIFICACIONES_EC1375 = [
        {
            categoria: "🔹 Terapeutas corporales y energéticos",
            items: [
                "Acupuntura y/o Auriculoterapia",
                "Reflexología podal o facial",
                "Masaje holístico, Shiatsu, tejido profundo, drenaje linfático, masaje ayurvédico",
                "Reiki, Johrei, sanación energética o vibracional",
                "Biomagnetismo, bioenergética y polaridad",
                "Terapias con sonido (cuencos, diapasones, frecuencias)"
            ]
        },
        {
            categoria: "🔹 Terapeutas de apoyo emocional (no psicólogos)",
            items: [
                "Descodificación biológica y transgeneracional",
                "Constelaciones familiares",
                "Técnicas de liberación emocional (EFT, tapping, respiración consciente)",
                "Hipnosis no clínica",
                "Terapia del niño interior, acompañamiento emocional y espiritual"
            ]
        },
        {
            categoria: "🔹 Facilitadores y asistentes",
            items: [
                "Asistentes de terapeutas o médicos integrativos o de salud holística",
                "Facilitadores de círculos, talleres o encuentros de sanación",
                "Brigadistas comunitarios en salud y bienestar",
                "Personas que apoyan espacios terapéuticos (consultorios, centros de salud natural, retiros, etc.)"
            ]
        },
        {
            categoria: "🔹 Terapeutas vibracionales y naturales",
            items: [
                "Flores de Bach y otras esencias florales",
                "Aromaterapia",
                "Herbolaria tradicional y fitoterapia",
                "Gemoterapia y uso terapéutico de cristales",
                "Terapias cuánticas o de reconexión energética"
            ]
        },
        {
            categoria: "🔹 Personas formadas en técnicas tradicionales",
            items: [
                "Curandería, partería tradicional, sobadores, hueseros, temazcaleros",
                "Practicantes de tradiciones ancestrales de sanación",
                "Promotores de medicina de los pueblos originarios"
            ]
        }
    ];

```

Replace it with nothing (delete the block entirely, leaving the `<script>` tag directly followed by the next comment block `DATA: 142 reactivos oficiales del EC1375...`).

- [x] **Step 3: Replace the state variables**

Find this exact block:

```js
    let personalData = { nombre: '', curp: '', domicilio: '', escolaridad: '', telefonoCasa: '', telefonoCelular: '', email: '', fecha: todayISO() };
    let selectedCertificaciones = [];
    let otraCertificacionText = '';
    let openCertCategories = new Set();
    let answers = {};
```

Replace it with:

```js
    let personalData = { nombre: '', curp: '', domicilio: '', escolaridad: '', telefonoCasa: '', telefonoCelular: '', email: '', fecha: todayISO() };
    let certificados = []; // [{ nombre, path, fileName, size, uploadedAt, uploading, error }]
    let sinCertificadosPrevios = false;
    let answers = {};
```

- [x] **Step 4: Update `loadProgress()`**

Find this exact block:

```js
                selectedCertificaciones = saved.selectedCertificaciones || [];
                otraCertificacionText = saved.otraCertificacionText || '';
```

Replace it with:

```js
                certificados = saved.certificados || [];
                sinCertificadosPrevios = saved.sinCertificadosPrevios || false;
```

- [x] **Step 5: Update `saveProgress()`**

Find this exact line:

```js
            personalData, selectedCertificaciones, otraCertificacionText, answers,
```

Replace it with:

```js
            personalData, certificados, sinCertificadosPrevios, answers,
```

- [x] **Step 6: Update `restartDiagnostico()`**

Find this exact block:

```js
        selectedCertificaciones = [];
        otraCertificacionText = '';
        openCertCategories = new Set();
```

Replace it with:

```js
        certificados = [];
        sinCertificadosPrevios = false;
```

- [x] **Step 7: Replace the accordion functions with the certificate-list functions**

Find this exact block:

```js
    /* =========================================================
       CERTIFICACIONES EC1375 - Selector acordeón
    ========================================================= */
    function renderCertAccordion() {
        let html = '<div class="cert-accordion">';
        CERTIFICACIONES_EC1375.forEach((cat, catIdx) => {
            const count = cat.items.filter(item => selectedCertificaciones.includes(item)).length;
            const isOpen = openCertCategories.has(catIdx);
            html += `
                <details class="cert-category" ${isOpen ? 'open' : ''} ontoggle="onCertDetailsToggle(${catIdx}, this)">
                    <summary>${cat.categoria} ${count > 0 ? `<span class="cert-count">${count}</span>` : ''}</summary>
                    <div class="cert-items">`;
            cat.items.forEach((item, itemIdx) => {
                const checked = selectedCertificaciones.includes(item);
                html += `
                        <label class="cert-item-row">
                            <input type="checkbox" ${checked ? 'checked' : ''} onchange="toggleCertificacion(${catIdx}, ${itemIdx})">
                            <span>${item}</span>
                        </label>`;
            });
            html += `</div></details>`;
        });
        html += `
                <details class="cert-category" ${openCertCategories.has('otra') ? 'open' : ''} ontoggle="onCertDetailsToggle('otra', this)">
                    <summary>🔹 Otra especialidad no listada</summary>
                    <div class="cert-items">
                        <input type="text" id="f_otraCertificacion" value="${escapeHtml(otraCertificacionText)}" placeholder="Escribe tu especialidad" oninput="updateOtraCertificacion(this.value)" style="width:100%;">
                    </div>
                </details>
            </div>`;
        return html;
    }

    function onCertDetailsToggle(catIdx, el) {
        if (el.open) openCertCategories.add(catIdx);
        else openCertCategories.delete(catIdx);
    }

    function toggleCertificacion(catIdx, itemIdx) {
        const item = CERTIFICACIONES_EC1375[catIdx].items[itemIdx];
        const pos = selectedCertificaciones.indexOf(item);
        if (pos >= 0) selectedCertificaciones.splice(pos, 1);
        else selectedCertificaciones.push(item);
        syncEscolaridad();
        rerenderCertSection();
    }

    function updateOtraCertificacion(value) {
        otraCertificacionText = value;
        syncEscolaridad();
        updateNavButtons();
        const chipsEl = document.getElementById('certChips');
        if (chipsEl) chipsEl.innerHTML = renderCertChips();
    }

    function syncEscolaridad() {
        const parts = [...selectedCertificaciones];
        if (otraCertificacionText && otraCertificacionText.trim()) parts.push(otraCertificacionText.trim());
        personalData.escolaridad = parts.join(', ');
        saveProgress();
    }

    function renderCertChips() {
        const parts = [...selectedCertificaciones];
        if (otraCertificacionText && otraCertificacionText.trim()) parts.push(otraCertificacionText.trim());
        if (!parts.length) return '<p class="cert-empty-hint">Aún no has seleccionado ninguna especialidad</p>';
        return parts.map(p => `<span class="cert-chip">✓ ${escapeHtml(p)}</span>`).join('');
    }

    function rerenderCertSection() {
        const accordionEl = document.querySelector('.cert-accordion');
        const chipsEl = document.getElementById('certChips');
        if (accordionEl) accordionEl.outerHTML = renderCertAccordion();
        if (chipsEl) chipsEl.innerHTML = renderCertChips();
        updateNavButtons();
    }
```

Replace it with:

```js
    /* =========================================================
       CERTIFICADOS DE FORMACIÓN PREVIA — lista con subida de archivo
    ========================================================= */
    const CERTIFICADO_MAX_BYTES = 10 * 1024 * 1024; // 10MB
    const CERTIFICADO_ACCEPT_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

    function renderCertificadosSection() {
        const rowsHtml = certificados.map((c, idx) => renderCertificadoRow(c, idx)).join('');
        return `
            <label class="cert-sin-toggle">
                <input type="checkbox" id="f_sinCertificados" ${sinCertificadosPrevios ? 'checked' : ''} onchange="toggleSinCertificados(this.checked)">
                <span>No tengo ningún certificado o diploma de formación previa</span>
            </label>
            <div id="certificadosList" ${sinCertificadosPrevios ? 'style="display:none;"' : ''}>
                ${rowsHtml}
                <button type="button" class="btn btn-secondary btn-sm" onclick="addCertificadoRow()">+ Agregar otro certificado</button>
            </div>
        `;
    }

    function renderCertificadoRow(c, idx) {
        let statusHtml = '';
        if (c.uploading) statusHtml = `<p class="cert-row-status cert-row-status-pending">Subiendo...</p>`;
        else if (c.error) statusHtml = `<p class="cert-row-status cert-row-status-error">⚠ ${escapeHtml(c.error)}</p>`;
        else if (c.path) statusHtml = `<p class="cert-row-status cert-row-status-ok">✓ ${escapeHtml(c.fileName || 'Archivo subido')}</p>`;
        return `
            <div class="cert-row">
                <input type="text" value="${escapeHtml(c.nombre || '')}" placeholder="Nombre de la certificación tal cual aparece en tu certificado" oninput="updateCertificadoNombre(${idx}, this.value)">
                <input type="file" accept=".pdf,image/*" onchange="handleCertificadoFileChange(${idx}, this)">
                ${statusHtml}
                <button type="button" class="btn btn-secondary btn-sm" onclick="removeCertificadoRow(${idx})">Quitar</button>
            </div>
        `;
    }

    function toggleSinCertificados(checked) {
        sinCertificadosPrevios = checked;
        syncEscolaridad();
        rerenderCertificadosSection();
    }

    function addCertificadoRow() {
        certificados.push({ nombre: '', path: null, fileName: null, size: null, uploadedAt: null, uploading: false, error: null });
        syncEscolaridad();
        rerenderCertificadosSection();
    }

    function removeCertificadoRow(idx) {
        certificados.splice(idx, 1);
        syncEscolaridad();
        rerenderCertificadosSection();
    }

    function updateCertificadoNombre(idx, value) {
        certificados[idx].nombre = value;
        syncEscolaridad();
        updateNavButtons();
    }

    async function handleCertificadoFileChange(idx, inputEl) {
        const file = inputEl.files[0];
        if (!file) return;
        if (!CERTIFICADO_ACCEPT_TYPES.includes(file.type)) {
            certificados[idx].error = 'Tipo de archivo no permitido. Usa PDF, JPG, PNG o WEBP.';
            rerenderCertificadosSection();
            return;
        }
        if (file.size > CERTIFICADO_MAX_BYTES) {
            certificados[idx].error = 'El archivo pesa más de 10MB.';
            rerenderCertificadosSection();
            return;
        }
        certificados[idx].uploading = true;
        certificados[idx].error = null;
        rerenderCertificadosSection();

        const session = await Auth.getSession();
        if (!session) {
            certificados[idx].uploading = false;
            certificados[idx].error = 'Tu sesión expiró. Vuelve a iniciar sesión.';
            rerenderCertificadosSection();
            return;
        }
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const path = `${session.user.id}/${Date.now()}-${safeName}`;
        const { path: savedPath, error } = await Auth.uploadCertificado(file, path);
        certificados[idx].uploading = false;
        if (error) {
            certificados[idx].error = 'No se pudo subir el archivo. Intenta de nuevo.';
        } else {
            certificados[idx].path = savedPath;
            certificados[idx].fileName = file.name;
            certificados[idx].size = file.size;
            certificados[idx].uploadedAt = new Date().toISOString();
            certificados[idx].error = null;
        }
        syncEscolaridad();
        rerenderCertificadosSection();
    }

    function syncEscolaridad() {
        personalData.escolaridad = sinCertificadosPrevios
            ? 'Sin certificaciones previas'
            : certificados.filter(c => c.nombre && c.nombre.trim()).map(c => c.nombre.trim()).join(', ');
        saveProgress();
    }

    function rerenderCertificadosSection() {
        const container = document.getElementById('certificadosSectionContainer');
        if (container) container.innerHTML = renderCertificadosSection();
        updateNavButtons();
    }
```

- [x] **Step 8: Update the "personal" form markup**

Find this exact block:

```html
                <div class="field-group">
                    <label>Grado de estudio o Certificaciones (EC1375) *</label>
                    <p class="field-hint" style="margin-top:-2px;margin-bottom:10px;">Selecciona todas las especialidades que apliquen a tu formación</p>
                    ${renderCertAccordion()}
                    <div class="cert-chips" id="certChips">${renderCertChips()}</div>
                </div>
```

Replace it with:

```html
                <div class="field-group">
                    <label>Certificados de formación previa *</label>
                    <p class="field-hint" style="margin-top:-2px;margin-bottom:10px;">Sube el certificado o diploma de cada especialidad en la que ya te has formado. Escribe el nombre tal cual aparece en el documento.</p>
                    <div id="certificadosSectionContainer">${renderCertificadosSection()}</div>
                </div>
```

- [x] **Step 9: Update `isStepValid('personal')`**

Find this exact block:

```js
        if (step === 'personal') {
            return personalData.nombre && personalData.curp && personalData.domicilio &&
                   personalData.escolaridad && personalData.telefonoCelular && personalData.email && personalData.fecha;
        }
```

Replace it with:

```js
        if (step === 'personal') {
            const certificadosOk = sinCertificadosPrevios ||
                (certificados.length > 0 && certificados.every(c => c.nombre && c.nombre.trim() && c.path));
            return personalData.nombre && personalData.curp && personalData.domicilio &&
                   personalData.escolaridad && personalData.telefonoCelular && personalData.email &&
                   personalData.fecha && certificadosOk;
        }
```

- [x] **Step 10: Verify syntax**

```bash
TMPJS="/tmp/check-$$-autodiagnostico.js"
node -e "const fs=require('fs'); const html=fs.readFileSync('autodiagnostico.html','utf8'); const m=html.match(/<script>([\s\S]*?)<\/script>/); fs.writeFileSync(process.argv[1], m[1]);" "$TMPJS"
node --check "$TMPJS" && echo "Syntax OK"
rm "$TMPJS"
```

Expected output: `Syntax OK`.

- [x] **Step 11: Confirm no leftover references to removed identifiers**

```bash
grep -n "selectedCertificaciones\|otraCertificacionText\|openCertCategories\|CERTIFICACIONES_EC1375\|renderCertAccordion\|renderCertChips\|onCertDetailsToggle\|toggleCertificacion\|updateOtraCertificacion\|certChips\|cert-accordion\|cert-category\|cert-item-row\|cert-count\|cert-chip\|cert-empty-hint" autodiagnostico.html
```

Expected: no output (empty — everything was removed).

- [x] **Step 12: Commit**

```bash
git add autodiagnostico.html
git commit -m "$(cat <<'EOF'
Replace specialty accordion with certificate upload in Autodiagnóstico

Candidates now write each certification's name exactly as it appears
on the document and upload the file (Supabase Storage) instead of
picking from a fixed checklist of specialties. Uploading at least one
certificate (or declaring they have none) is required to advance past
the personal-data step.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Manual browser verification of the new flow

No code changes in this task — it only verifies Task 3's work. Uses the Browser preview tool against the project's existing static server config (`.claude/launch.json`, server name `ec1375-static`, serves the project root on port 8420).

- [x] **Step 1: Start the static server and open the page**

Use the preview tool to start server `ec1375-static`, then navigate to `http://localhost:8420/autodiagnostico.html`.

- [x] **Step 2: Bypass the OTP auth gate and jump to the "personal" step**

The page has no test hooks, so bypass auth via the page's own global scope (it's a classic non-module `<script>`, so its top-level `let`/`function` declarations, and `auth.js`'s top-level `const Auth`, are reachable from an injected script in the same page). Run this JS in the page context:

```js
Auth.hasSession = () => true;
Auth.getSession = async () => ({ user: { id: 'test-user-verification' } });
currentStepIndex = STEPS.indexOf('personal');
renderStep();
```

Expected: the page now shows the "👤 Datos Personales" card, and the "Certificados de formación previa *" field-group shows the checkbox and the "+ Agregar otro certificado" button with no rows yet.

- [x] **Step 3: Verify the "Siguiente" button is disabled with no certificates and the box unchecked**

Read the page and check the "Siguiente" button's `disabled` attribute.

Expected: `disabled` is present (button greyed out) — even if Nombre/CURP/etc. are filled in, because `certificadosOk` is false.

- [x] **Step 4: Verify the "sin certificados" path**

Click the "No tengo ningún certificado o diploma de formación previa" checkbox. Then check that `document.getElementById('certificadosList').style.display` is `'none'` and that `personalData.escolaridad === 'Sin certificaciones previas'` (evaluate this in the page JS context).

Expected: both true. Fill in the rest of the required personal fields (Nombre, CURP, domicilio, teléfono celular, correo, fecha already defaults to today) and confirm the "Siguiente" button becomes enabled.

- [x] **Step 5: Verify the certificate-list path with a simulated successful upload**

Uncheck the "sin certificados" checkbox. In the page JS context, stub the upload to avoid depending on the real bucket (which Diego has not created yet at this point):

```js
Auth.uploadCertificado = async (file, path) => ({ path, error: null });
```

Click "+ Agregar otro certificado", type a name into the text field (e.g. "Diplomado en Masaje Terapéutico"), and attach any small file via the file input. After the upload resolves, read the page again.

Expected: the row shows `✓ <filename>` in green (`.cert-row-status-ok`), and the "Siguiente" button is enabled once the other required personal fields are also filled in.

- [x] **Step 6: Verify client-side validation rejects a bad file**

Add a second certificate row, type a name, and attach a file whose type is not in `application/pdf, image/jpeg, image/png, image/webp` (e.g. a `.txt` file) — or check via JS instead if constructing such a file through the file picker isn't practical:

```js
certificados.push({ nombre: 'Prueba inválida', path: null, fileName: null, size: null, uploadedAt: null, uploading: false, error: null });
handleCertificadoFileChange(certificados.length - 1, { files: [new File(['x'], 'nota.txt', { type: 'text/plain' })] });
```

Expected: after this runs, `certificados[certificados.length - 1].error` is `'Tipo de archivo no permitido. Usa PDF, JPG, PNG o WEBP.'` and no upload was attempted (no `uploading: true` state persisted). Re-render (`rerenderCertificadosSection()` already runs inside the function) and confirm the row shows the red error text.

- [x] **Step 7: Verify the real (unstubbed) upload fails gracefully when the bucket doesn't exist yet**

Reload the page (this discards the in-memory stub and restores the real `Auth.uploadCertificado` from `auth.js`), then repeat step 2 (auth bypass) and step 5's setup (uncheck "sin certificados", add a row, type a name) — but this time do NOT run the `Auth.uploadCertificado = async (...) => ...` stub line. Attach a real small file to the certificate row.

Expected: since the `certificados-previos` bucket does not exist in Supabase yet (Diego creates it manually per Task 2), the row ends up showing the red "⚠ No se pudo subir el archivo. Intenta de nuevo." status instead of crashing the page. This confirms the error path is handled gracefully — this will start succeeding for real once Diego completes the manual Supabase step.

- [x] **Step 8: Verify certificate metadata survives a page reload**

Repeat step 2 (auth bypass) and step 5 (including the `Auth.uploadCertificado` stub, so the row ends up with `path` set successfully), then reload the page and repeat step 2's auth bypass and jump to `personal` again (`loadProgress()` already runs unconditionally on `window load`, before the auth bypass, so it will have loaded whatever was in `localStorage.autodiagnosticoData`).

Expected: the certificate row you added before the reload reappears with its typed name and its `✓ <filename>` status already showing — confirming `certificados` metadata (not the file itself) round-trips through `localStorage` via `loadProgress()`/`saveProgress()` correctly.

- [x] **Step 9: Take a screenshot of the final state**

Screenshot the "personal" step showing one certificate row with a green "✓ uploaded" status and the "Siguiente" button enabled (redo steps 2 and 5 if the page is currently in an error or reloaded state you don't want in the screenshot).

No commit for this task (no code changed). Two checks from the spec's "Testing / verificación manual" section are intentionally NOT done here because they require the real bucket + a second real user session, neither of which exists until Diego finishes the manual Supabase setup (see "Post-implementation note" at the end of this plan): confirming the file appears under `{user_id}/...` in the Supabase Storage dashboard, and confirming a different user's session cannot read it via RLS.

---

### Task 5: Update the 3 downstream pages that read the specialty list

**Files:**
- Modify: `documentos-sesion.html:335-336`
- Modify: `evidencias.html:186-187`
- Modify: `plan-evaluacion.html:605-606`

All three files currently contain this exact two-line pattern (same indentation in all three):

```js
            const especialidades = Array.isArray(saved.selectedCertificaciones) ? [...saved.selectedCertificaciones] : [];
            if (saved.otraCertificacionText && saved.otraCertificacionText.trim()) especialidades.push(saved.otraCertificacionText.trim());
```

- [x] **Step 1: Update `documentos-sesion.html`**

Find the block above in `documentos-sesion.html` and replace it with:

```js
            const especialidades = Array.isArray(saved.certificados)
                ? saved.certificados.map(c => c.nombre).filter(n => n && n.trim())
                : [];
```

- [x] **Step 2: Update `evidencias.html`**

Find the same block in `evidencias.html` and replace it with the same replacement as Step 1.

- [x] **Step 3: Update `plan-evaluacion.html`**

Find the same block in `plan-evaluacion.html` and replace it with the same replacement as Step 1.

- [x] **Step 4: Verify syntax of all three**

```bash
for f in documentos-sesion.html evidencias.html plan-evaluacion.html; do
  TMPJS="/tmp/check-$$-$f.js"
  node -e "const fs=require('fs'); const html=fs.readFileSync(process.argv[1],'utf8'); const m=html.match(/<script>([\s\S]*?)<\/script>/); fs.writeFileSync(process.argv[2], m[1]);" "$f" "$TMPJS"
  node --check "$TMPJS" && echo "$f: Syntax OK"
  rm "$TMPJS"
done
```

Expected output:
```
documentos-sesion.html: Syntax OK
evidencias.html: Syntax OK
plan-evaluacion.html: Syntax OK
```

- [x] **Step 5: Confirm no leftover references**

```bash
grep -n "selectedCertificaciones\|otraCertificacionText" documentos-sesion.html evidencias.html plan-evaluacion.html
```

Expected: no output.

- [x] **Step 6: Commit**

```bash
git add documentos-sesion.html evidencias.html plan-evaluacion.html
git commit -m "$(cat <<'EOF'
Read especialidades from the new certificados list

Follows up on the Autodiagnóstico's switch from a fixed specialty
checklist to a free-text certificate list — these 3 pages only
displayed the derived list, so this is a one-line change per file.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Document the change in `Claude.md`

**Files:**
- Modify: `Claude.md:606-608`

- [x] **Step 1: Insert the new dated section**

Find this exact block:

```markdown
- Registro manual en portal SEP y subida del portafolio final — procesos del equipo de Diego en el portal gubernamental, no automatizables desde el sitio.

### 🔮 Backlog — no urgente, pero anotado para cuando escale a más candidatos
```

Replace it with:

```markdown
- Registro manual en portal SEP y subida del portafolio final — procesos del equipo de Diego en el portal gubernamental, no automatizables desde el sitio.

### ✅ Certificados de formación previa — captura obligatoria en el Autodiagnóstico (8 de septiembre, 2026)

El acordeón de selección de especialidades (`CERTIFICACIONES_EC1375`, checkboxes por categoría) se quitó de `autodiagnostico.html` — se reemplazó por una lista donde el candidato escribe el nombre de cada certificación **tal cual aparece en su certificado** y sube el archivo (PDF o imagen, máx. 10MB) en el mismo paso "personal", junto a Nombre/CURP/domicilio. Es obligatorio: o marcan "No tengo ningún certificado o diploma de formación previa", o suben al menos uno con su nombre para poder avanzar.

Los archivos se guardan en un bucket privado de Supabase Storage (`certificados-previos`, RLS por `user_id` vía el primer segmento de la ruta) — solo los metadatos (nombre escrito, ruta del archivo) viajan en el JSON que ya se sincronizaba a `candidatos_ec1375.autodiagnostico_data`. Nueva función en `auth.js`: `Auth.uploadCertificado(file, path)`.

El campo oficial "Escolaridad / Certificaciones" del PDF del Autodiagnóstico se sigue llenando automático, ahora a partir de los nombres escritos por el candidato (o "Sin certificaciones previas" si marcó que no tiene ninguno) en vez de la lista fija de especialidades.

`documentos-sesion.html`, `evidencias.html` y `plan-evaluacion.html` ya leían esta info como un array `especialidades` (para mostrarla en resúmenes/PDFs) — se actualizó esa única línea en cada uno para leerla desde `certificados[].nombre` en vez de la selección vieja, sin más cambios.

**Pendiente que Diego haga en el dashboard de Supabase:** crear el bucket `certificados-previos` (Storage → New bucket → privado) y correr `_internal_no_publicar/02-sql/supabase_setup_v6_certificados_storage.sql` (políticas RLS).

**Fuera de alcance (documentado, no urgente):** `assemble_expediente.py` no lee de este bucket todavía (sigue usando el Google Form/Drive); no hay panel para ver/descargar los archivos subidos (quedan visibles desde el dashboard de Supabase Storage); no se migran datos de candidatos que ya estén a medio wizard con la selección vieja de especialidades; migración a Cloudflare Storage queda pendiente de que esa integración esté lista (mencionada por Diego como plan futuro). El ítem "Certificados / diplomas de formación" en el checklist de `evidencias.html` se deja igual, como respaldo opcional.

### 🔮 Backlog — no urgente, pero anotado para cuando escale a más candidatos
```

- [x] **Step 2: Commit**

```bash
git add Claude.md
git commit -m "$(cat <<'EOF'
Document certificados de formación previa feature in Claude.md

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Post-implementation note for the user (Diego)

After all tasks are done, two manual steps remain before this works in production (already called out in Task 2 and the Claude.md entry):

1. Create the private bucket `certificados-previos` in the Supabase dashboard (Storage → New bucket → Public: NO).
2. Run `_internal_no_publicar/02-sql/supabase_setup_v6_certificados_storage.sql` in the Supabase SQL Editor.

Until both are done, candidates will see the graceful upload-error state (verified in Task 4, Step 7) instead of a successful upload.
