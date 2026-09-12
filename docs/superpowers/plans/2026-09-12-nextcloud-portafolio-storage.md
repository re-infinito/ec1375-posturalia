# Almacenamiento automático en Nextcloud (Portafolios EC1375) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar el flujo manual de descarga/re-subida de documentos (PDFs generados por el sitio + Google Form de evidencias) por subida automática a un Nextcloud propio, con bloqueo duro entre fases condicionado a que los documentos de la fase anterior estén confirmados como subidos.

**Architecture:** Un endpoint serverless nuevo (`api/subir-portafolio.js`) recibe un archivo en base64 desde el navegador, valida la sesión de Supabase del candidato, y lo sube vía WebDAV a un Nextcloud de terceros (servidor de Humberto, expuesto por Cloudflare Tunnel), organizando por `Portafolios/{candidato}/{fase}/{archivo}`. Cada página que genera un documento gana un helper duplicado (`subirDocumento()`, mismo patrón de "sin módulos compartidos" del proyecto) que sube automáticamente al generarse, guarda el resultado en el mismo JSONB que ya sincroniza esa página, y muestra estado por documento con reintento manual + descarga de respaldo. Cada página gateada agrega una verificación más a su cadena de gates existente: ¿la fase anterior tiene todos sus documentos subidos?

**Tech Stack:** Vercel Serverless Functions (Node, CommonJS), `@supabase/supabase-js` (ya es dependencia), `fetch` nativo de Node para hablar WebDAV con Nextcloud, jsPDF (ya en uso) en el navegador.

**Spec de referencia:** `docs/superpowers/specs/2026-09-12-nextcloud-portafolio-storage-design.md`

**Nota de riesgo que aplica a TODO este plan:** `NEXTCLOUD_URL` está guardada hoy en Vercel como `https://nextcloud.paideiatech.net/login` — probablemente la URL de la pantalla de login del navegador, no el endpoint WebDAV real. El endpoint normaliza defensivamente sufijos conocidos (`/login`), pero **antes de considerar esto "funciona en producción" hay que confirmar con Diego/Humberto la URL base real** y, si es distinta, corregir la variable de entorno (`vercel env rm NEXTCLOUD_URL production && vercel env add NEXTCLOUD_URL production --value "<url correcta>" --sensitive` — repetir para `preview`). Todas las tareas de este plan pueden implementarse y probarse (sintaxis, lógica pura, gates) sin depender de esto; solo la prueba end-to-end contra el Nextcloud real de la Tarea 1 y las pruebas en navegador de las Tareas 2-8 necesitan la URL correcta.

---

## Convenciones que se repiten en todo este plan

**Nombres de fase → carpeta:** `registro`→`01-Registro`, `alineacion`→`02-Alineacion`, `evaluacion`→`03-Evaluacion`, `entrega`→`04-Entrega` (ya fijos en `api/subir-portafolio.js`, Tarea 1).

**Columnas JSONB en `candidatos_ec1375`** (ya existen, confirmadas en `auth.js:restoreLocalStorageFromRow`): `autodiagnostico_data`, `plan_evaluacion_data`, `documentos_sesion_data`, `encuesta_data`, `evidencias_data`. Cada una gana un campo nuevo `documentosNextcloud: { clave: "ruta/en/nextcloud.pdf" | ["ruta1", "ruta2"] | undefined }`.

**Helper `subirDocumento()` duplicado en cada página** (mismo cuerpo en todas, con el `access_token`/`email` de la sesión real):

```js
async function subirDocumento(fase, filename, blob, nombre, curp) {
    try {
        const session = await Auth.getSession();
        if (!session) return { success: false, error: 'Sin sesión activa' };
        const fileBase64 = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result.split(',')[1]);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
        const resp = await fetch('/api/subir-portafolio', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify({ email: session.user.email, fase, nombre, curp, filename, fileBase64 })
        });
        const data = await resp.json();
        if (!resp.ok || !data.success) return { success: false, error: data.error || 'Error desconocido' };
        return { success: true, path: data.path };
    } catch (e) {
        return { success: false, error: e.message || 'Error de red' };
    }
}
```

**Helper de verificación de gate `documentosFaseCompletos()`** (duplicado en cada página que gatea contra la fase anterior):

```js
function documentosFaseCompletos(jsonbData, requiredKeys) {
    if (!jsonbData || !jsonbData.documentosNextcloud) return false;
    return requiredKeys.every(key => {
        const val = jsonbData.documentosNextcloud[key];
        return Array.isArray(val) ? val.length > 0 : !!val;
    });
}
```

---

### Task 1: `api/subir-portafolio.js` — endpoint de subida a Nextcloud

**Files:**
- Create: `api/subir-portafolio.js`
- Test (scratch, no se commitea): `/tmp/test-subir-portafolio.js` — usar la ruta del scratchpad de la sesión, no el repo

- [ ] **Step 1: Escribir el endpoint completo**

Crear `api/subir-portafolio.js`:

```js
/**
 * POST /api/subir-portafolio
 * Sube un archivo (PDF generado por el sitio, o evidencia subida por el
 * candidato) al Nextcloud de almacenamiento (servidor de Humberto, WebDAV
 * vía Cloudflare Tunnel), organizado por candidato y fase.
 *
 * Body: { email, fase, nombre, curp, filename, fileBase64 }
 * Header: Authorization: Bearer <access_token de la sesión real de Supabase>
 * Retorna: { success: true, path } o { success: false, error }
 *
 * Variables de entorno requeridas: NEXTCLOUD_URL, NEXTCLOUD_USERNAME,
 * NEXTCLOUD_APP_PASSWORD (ya configuradas en Vercel).
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://numsuiuwrvpprhnxovmh.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im51bXN1aXV3cnZwcHJobnhvdm1oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc2OTg3MDAsImV4cCI6MjEwMzI3NDcwMH0.LA_MJzLcJyVtysxsJAmWwWzKwgynNm-f6ejGEaEpG1Y';

const FASE_CARPETA = {
    registro: '01-Registro',
    alineacion: '02-Alineacion',
    evaluacion: '03-Evaluacion',
    entrega: '04-Entrega'
};

const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15MB

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

async function ensureFolder(baseWebdavUrl, authBasic, folderPath) {
    const partes = folderPath.split('/').filter(Boolean);
    let acumulado = '';
    for (const parte of partes) {
        acumulado += `/${encodeURIComponent(parte)}`;
        const resp = await fetch(`${baseWebdavUrl}${acumulado}`, {
            method: 'MKCOL',
            headers: { Authorization: authBasic }
        });
        // 201 = creada. 405 = ya existía. Cualquier otra cosa es un error real.
        if (resp.status !== 201 && resp.status !== 405) {
            throw new Error(`No se pudo crear la carpeta ${acumulado} (status ${resp.status})`);
        }
    }
}

async function handler(req, res) {
    res.setHeader('Content-Type', 'application/json');

    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    const { email, fase, nombre, curp, filename, fileBase64 } = req.body || {};

    if (!email || !fase || !filename || !fileBase64) {
        return res.status(400).json({ success: false, error: 'Faltan campos requeridos (email, fase, filename, fileBase64)' });
    }
    if (!FASE_CARPETA[fase]) {
        return res.status(400).json({ success: false, error: 'Fase inválida' });
    }

    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) {
        return res.status(401).json({ success: false, error: 'Falta el token de sesión' });
    }

    try {
        const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        const { data: userData, error: userError } = await supabase.auth.getUser(token);
        if (userError || !userData || !userData.user) {
            return res.status(401).json({ success: false, error: 'Sesión inválida o expirada' });
        }
        if (userData.user.email.toLowerCase() !== String(email).toLowerCase()) {
            return res.status(403).json({ success: false, error: 'El correo no coincide con la sesión activa' });
        }

        let fileBuffer;
        try {
            fileBuffer = Buffer.from(fileBase64, 'base64');
        } catch (e) {
            return res.status(400).json({ success: false, error: 'fileBase64 inválido' });
        }
        if (fileBuffer.length === 0) {
            return res.status(400).json({ success: false, error: 'El archivo está vacío' });
        }
        if (fileBuffer.length > MAX_FILE_BYTES) {
            return res.status(400).json({ success: false, error: `El archivo excede el límite de ${MAX_FILE_BYTES / (1024 * 1024)}MB` });
        }

        const nextcloudUrl = normalizarNextcloudUrl(process.env.NEXTCLOUD_URL);
        const nextcloudUser = process.env.NEXTCLOUD_USERNAME;
        const nextcloudPass = process.env.NEXTCLOUD_APP_PASSWORD;
        if (!nextcloudUrl || !nextcloudUser || !nextcloudPass) {
            return res.status(500).json({ success: false, error: 'Almacenamiento no configurado (faltan variables de entorno de Nextcloud)' });
        }

        const baseWebdavUrl = `${nextcloudUrl}/remote.php/dav/files/${encodeURIComponent(nextcloudUser)}`;
        const authBasic = 'Basic ' + Buffer.from(`${nextcloudUser}:${nextcloudPass}`).toString('base64');

        const carpeta = carpetaCandidato(nombre, curp);
        const faseCarpeta = FASE_CARPETA[fase];
        const folderPath = `Portafolios/${carpeta}/${faseCarpeta}`;

        await ensureFolder(baseWebdavUrl, authBasic, folderPath);

        const filePath = `${folderPath}/${filename}`;
        const putUrl = `${baseWebdavUrl}/${filePath.split('/').map(encodeURIComponent).join('/')}`;
        const putResp = await fetch(putUrl, {
            method: 'PUT',
            headers: { Authorization: authBasic, 'Content-Type': 'application/octet-stream' },
            body: fileBuffer
        });

        if (putResp.status !== 201 && putResp.status !== 204) {
            return res.status(502).json({ success: false, error: `Nextcloud respondió con status ${putResp.status}` });
        }

        return res.status(200).json({ success: true, path: filePath });
    } catch (e) {
        console.error('Error en subir-portafolio:', e);
        return res.status(500).json({ success: false, error: e.message || 'Error interno' });
    }
}

// Funciones puras expuestas solo para pruebas aisladas (ver plan de
// implementación) — Vercel sigue llamando a este módulo como función.
handler._normalizarNextcloudUrl = normalizarNextcloudUrl;
handler._slugify = slugify;
handler._carpetaCandidato = carpetaCandidato;

module.exports = handler;
```

- [ ] **Step 2: Verificar sintaxis**

Run: `node --check api/subir-portafolio.js`
Expected: sin salida (éxito silencioso).

- [ ] **Step 3: Probar las funciones puras con un script aislado**

Crear `/tmp/test-subir-portafolio.js` (fuera del repo, es scratch):

```js
const handler = require('/Users/diegogarzamx/Desktop/Paideia Tech/api/subir-portafolio.js');

function assertEqual(actual, expected, label) {
    if (actual !== expected) {
        console.error(`FALLÓ: ${label} — esperado "${expected}", obtuvo "${actual}"`);
        process.exitCode = 1;
    } else {
        console.log(`OK: ${label}`);
    }
}

assertEqual(handler._normalizarNextcloudUrl('https://nextcloud.paideiatech.net/login'), 'https://nextcloud.paideiatech.net', 'quita /login');
assertEqual(handler._normalizarNextcloudUrl('https://nextcloud.paideiatech.net/'), 'https://nextcloud.paideiatech.net', 'quita barra final');
assertEqual(handler._normalizarNextcloudUrl('https://nextcloud.paideiatech.net'), 'https://nextcloud.paideiatech.net', 'ya limpia, sin cambios');
assertEqual(handler._normalizarNextcloudUrl('https://nextcloud.paideiatech.net/index.php/login'), 'https://nextcloud.paideiatech.net', 'quita /index.php/login');

assertEqual(handler._slugify('Diego Garza Arroyo'), 'Diego_Garza_Arroyo', 'slugify con espacios');
assertEqual(handler._slugify('José Ñuñez'), 'Jose_Nunez', 'slugify quita acentos y eñe');
assertEqual(handler._slugify(''), '', 'slugify de vacío');
assertEqual(handler._slugify(null), '', 'slugify de null');

assertEqual(handler._carpetaCandidato('Diego Garza', 'GADI900101HDFXXX01'), 'Diego_Garza_GADI900101HDFXXX01', 'carpeta candidato normal');
assertEqual(handler._carpetaCandidato('', ''), 'candidato_sin_identificar', 'carpeta candidato sin datos');
```

- [ ] **Step 4: Ejecutar el script de prueba**

Run: `node /tmp/test-subir-portafolio.js`
Expected: 9 líneas `OK: ...`, sin ninguna línea `FALLÓ`.

- [ ] **Step 5: Borrar el script de prueba**

Run: `rm /tmp/test-subir-portafolio.js`

- [ ] **Step 6: Commit**

```bash
git add api/subir-portafolio.js
git commit -m "$(cat <<'EOF'
Agrega api/subir-portafolio.js — endpoint de subida a Nextcloud

Sube archivos vía WebDAV al Nextcloud de Humberto (servidor propio,
Cloudflare Tunnel), organizados por Portafolios/{candidato}/{fase}/.
Verifica el access_token de la sesión real de Supabase antes de
aceptar la subida.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 7: Push y verificación de despliegue**

```bash
git push origin main
```

Después de 30-60s, correr:

```bash
curl -s -X POST https://sepconocer.paideiatech.com/api/subir-portafolio -H "Content-Type: application/json" -d '{"email":"test@test.com","fase":"registro","filename":"test.pdf","fileBase64":"dGVzdA=="}'
```

Expected (sin `Authorization` header): `{"success":false,"error":"Falta el token de sesión"}` con status 401. Esto confirma que el endpoint está desplegado y la validación de auth funciona, sin necesitar todavía acceso al Nextcloud real.

---

### Task 2: `autodiagnostico.html` — subida automática de los documentos de Registro

**Files:**
- Modify: `autodiagnostico.html:827-845` (estado), `:875-883` (saveProgress/loadProgress), `:913-954` (renderStep), `:1658-1702` (generateAcuseNdaPDF), `:1704-1768` (renderResultado), `:1911-2010` (generatePDF), `:2015-2054` (generateAcuseTripticoPDF)

- [ ] **Step 1: Agregar estado nuevo**

En `autodiagnostico.html`, justo después de la línea 845 (`let ndaLastX = 0, ndaLastY = 0;`), agregar:

```js
    let documentosNextcloud = {};
    let generatedDocsRegistro = {};
    let autoUploadIntentado = false;
```

- [ ] **Step 2: Persistir el nuevo campo en `loadProgress()`/`saveProgress()`**

En `loadProgress()` (línea ~850-873), dentro del bloque `if (saved) { ... }`, después de `ndaHasSignature = !!ndaSignatureDataUrl;`, agregar:

```js
                documentosNextcloud = saved.documentosNextcloud || {};
```

En `saveProgress()` (línea 875-883), cambiar:

```js
    function saveProgress() {
        const data = {
            personalData, certificados, sinCertificadosPrevios, answers,
            signatureDataUrl, signatureTypedName, signatureMode, triptychAccepted,
            ndaAccepted, ndaSignedAt, ndaSignatureDataUrl, ndaSignatureTypedName, ndaSignatureMode
        };
```

a:

```js
    function saveProgress() {
        const data = {
            personalData, certificados, sinCertificadosPrevios, answers,
            signatureDataUrl, signatureTypedName, signatureMode, triptychAccepted,
            ndaAccepted, ndaSignedAt, ndaSignatureDataUrl, ndaSignatureTypedName, ndaSignatureMode,
            documentosNextcloud
        };
```

- [ ] **Step 3: Verificar sintaxis tras el paso 1-2**

Run: `node --check /dev/stdin <<< "$(sed -n '/<script>/,/<\/script>/p' 'autodiagnostico.html' | sed '1d;$d')"`
Expected: sin salida. (Si el comando falla por comillas del shell, extraer el `<script>` a un archivo temporal con un editor y correr `node --check` sobre ese archivo — es el método ya usado en sesiones anteriores de este proyecto.)

- [ ] **Step 4: Agregar el helper `subirDocumento()` y el helper de UI de estado**

Justo antes de `function generateAcuseNdaPDF() {` (línea 1658), agregar:

```js
    async function subirDocumento(fase, filename, blob, nombre, curp) {
        try {
            const session = await Auth.getSession();
            if (!session) return { success: false, error: 'Sin sesión activa' };
            const fileBase64 = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result.split(',')[1]);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
            const resp = await fetch('/api/subir-portafolio', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
                body: JSON.stringify({ email: session.user.email, fase, nombre, curp, filename, fileBase64 })
            });
            const data = await resp.json();
            if (!resp.ok || !data.success) return { success: false, error: data.error || 'Error desconocido' };
            return { success: true, path: data.path };
        } catch (e) {
            return { success: false, error: e.message || 'Error de red' };
        }
    }

    function renderEstadoDoc(key, label) {
        const val = documentosNextcloud[key];
        if (val) {
            return `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.08);">
                <span>${label}</span><span style="color:var(--success);font-weight:600;">✅ Subido</span>
            </div>`;
        }
        return `<div style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.08);">
            <div style="display:flex;justify-content:space-between;align-items:center;">
                <span>${label}</span><span style="color:var(--danger);font-weight:600;">❌ No subido</span>
            </div>
            <div style="display:flex;gap:8px;margin-top:8px;">
                <button class="btn btn-secondary" style="flex:1;font-size:0.8rem;" onclick="reintentarSubidaRegistro('${key}')">🔄 Reintentar subida</button>
                <button class="btn btn-secondary" style="flex:1;font-size:0.8rem;" onclick="descargarDocRegistro('${key}')">⬇️ Descargar</button>
            </div>
        </div>`;
    }

    async function subirDocumentosPendientesRegistro() {
        const pd = personalData;
        for (const key of Object.keys(generatedDocsRegistro)) {
            if (documentosNextcloud[key]) continue;
            const { blob, filename } = generatedDocsRegistro[key];
            const result = await subirDocumento('registro', filename, blob, pd.nombre, pd.curp);
            if (result.success) documentosNextcloud[key] = result.path;
        }
        saveProgress();
    }

    async function reintentarSubidaRegistro(key) {
        const pd = personalData;
        const { blob, filename } = generatedDocsRegistro[key];
        const result = await subirDocumento('registro', filename, blob, pd.nombre, pd.curp);
        if (result.success) { documentosNextcloud[key] = result.path; saveProgress(); }
        await renderResultado(document.getElementById('app'));
    }

    function descargarDocRegistro(key) {
        const { blob, filename } = generatedDocsRegistro[key];
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

```

- [ ] **Step 5: Refactorizar las 3 funciones de generación para devolver `{blob, filename}` en vez de descargar**

En `generateAcuseNdaPDF()` (ahora más abajo por el Step 4, buscar por su contenido), cambiar el nombre y el final:

```js
    function generateAcuseNdaPDF() {
```
a:
```js
    function generateAcuseNdaPDFBlob() {
```

y cambiar:
```js
        doc.save(`Acuerdo_Confidencialidad_EC1375_${(pd.nombre || 'candidato').replace(/\s+/g, '_')}.pdf`);
    }
```
a:
```js
        return { blob: doc.output('blob'), filename: `Acuerdo_Confidencialidad_EC1375_${(pd.nombre || 'candidato').replace(/\s+/g, '_')}.pdf` };
    }
```

En `generatePDF()` (línea ~1911-2010), cambiar el nombre y el final:
```js
    function generatePDF() {
```
a:
```js
    function generatePDFBlob() {
```

y cambiar:
```js
        const filename = `Autodiagnostico_EC1375_${(pd.nombre || 'candidato').replace(/\s+/g, '_')}.pdf`;
        doc.save(filename);
    }
```
a:
```js
        const filename = `Autodiagnostico_EC1375_${(pd.nombre || 'candidato').replace(/\s+/g, '_')}.pdf`;
        return { blob: doc.output('blob'), filename };
    }
```

En `generateAcuseTripticoPDF()` (línea ~2015-2054), cambiar el nombre y el final:
```js
    function generateAcuseTripticoPDF() {
```
a:
```js
    function generateAcuseTripticoPDFBlob() {
```

y cambiar:
```js
        doc.save(`Acuse_Triptico_EC1375_${(pd.nombre || 'candidato').replace(/\s+/g, '_')}.pdf`);
    }
```
a:
```js
        return { blob: doc.output('blob'), filename: `Acuse_Triptico_EC1375_${(pd.nombre || 'candidato').replace(/\s+/g, '_')}.pdf` };
    }
```

**Nota:** `generatePDF()` seguía usada por el botón "Descargar Word (.doc)"? No — `generateWord()` es una función aparte, sin relación. `generatePDF()`/`generateAcuseNdaPDF()`/`generateAcuseTripticoPDF()` solo se llamaban desde los `onclick` de `renderResultado()`, que se reescribe en el Step 6 — no quedan más referencias a los nombres viejos. Confirmarlo en el Step 7.

- [ ] **Step 6: Reescribir `renderResultado()` para generar, subir, y mostrar estado**

Cambiar (línea 1704):

```js
    function renderResultado() {
        const score = calculateScore();
        const isReady = score.percentage >= 90;
        const quiz = JSON.parse(localStorage.getItem('quizResponses') || '{}');

        return `
            <div class="resultado-hero">
                <div class="score-circle ${isReady ? 'high' : 'low'}">
                    <div class="score-percent">${score.percentage}%</div>
                    <div class="score-label">${score.si}/${score.total} reactivos</div>
                </div>
                <h1 class="intro-title">${isReady ? '¡Felicidades! 🎉' : 'Vas por buen camino 💪'}</h1>
            </div>

            <div class="recomendacion-box ${isReady ? 'evaluate' : 'assess'}">
                ${isReady
                    ? '✅ Tu resultado indica que estás LISTO para EVALUARTE. Tu Centro Evaluador te contactará para agendar tu evaluación oficial.'
                    : '📚 Te recomendamos ASESORARTE con tu Centro Evaluador antes de la evaluación oficial, para reforzar las áreas pendientes.'}
            </div>

            <div class="card">
                <h2>📥 Descarga tu documento</h2>
                <p style="margin-bottom: 16px; color: var(--text); font-size: 0.9rem;">Genera tu Autodiagnóstico EC1375 completo, con tus 142 respuestas, listo para entregar a tu evaluador.</p>
                <div class="download-buttons">
                    <button class="btn btn-primary btn-full" onclick="generatePDF()">📄 Descargar PDF</button>
                    <button class="btn btn-secondary btn-full" onclick="generateWord()">📝 Descargar Word (.doc)</button>
                </div>
            </div>

            <div class="card">
                <h2>📄 Acuse de Recibido — Tríptico</h2>
                <p style="margin-bottom: 16px; color: var(--text); font-size: 0.9rem;">Confirma que recibiste el Tríptico de Derechos y Obligaciones del Usuario (ya lo aceptaste al firmar arriba — no necesitas hacer nada más).</p>
                <button class="btn btn-secondary btn-full" onclick="generateAcuseTripticoPDF()">📄 Descargar Acuse de Tríptico</button>
            </div>

            <div class="card">
                <h2>🔒 Acuerdo de Confidencialidad (NDA)</h2>
                <p style="margin-bottom: 16px; color: var(--text); font-size: 0.9rem;">Ya lo aceptaste y firmaste antes de empezar tus reactivos — aquí puedes descargar tu copia.</p>
                <button class="btn btn-secondary btn-full" onclick="generateAcuseNdaPDF()">🔒 Descargar Acuerdo de Confidencialidad</button>
            </div>

            <div class="card">
                <h2>📱 Envía tu resultado al equipo</h2>
                <p style="margin-bottom: 12px; color: var(--text); font-size: 0.9rem;">Se abrirá WhatsApp con tu resumen. Adjunta el PDF que descargaste en el chat.</p>
                <button class="btn btn-whatsapp btn-full" onclick="sendWhatsAppSummary()">📱 ENVIAR RESULTADO POR WHATSAPP</button>
                <p class="whatsapp-note">Recuerda adjuntar tu PDF descargado en el chat de WhatsApp</p>
            </div>

            <div class="card">
                <h2>📚 Ruta de Estudio</h2>
                <p style="margin-bottom: 16px; color: var(--text); font-size: 0.9rem;">Curso interactivo, a tu ritmo, del EC1375 completo — se enfoca automáticamente en los reactivos que marcaste como "No" arriba.</p>
                <a href="ruta-estudio.html" class="btn btn-secondary btn-full" style="display:block; text-decoration:none;">📚 IR A MI RUTA DE ESTUDIO</a>
            </div>

            <div class="card">
                <h2>🎓 Siguiente Paso</h2>
                <p style="margin-bottom: 16px; color: var(--text); font-size: 0.9rem;">Continúa con tu Alineación (Capacitación) — material y video de preparación antes de tu evaluación práctica.</p>
                <a href="alineacion.html" class="btn btn-primary btn-full" style="display:block; text-decoration:none;">🎓 IR A MI ALINEACIÓN</a>
            </div>

            <div class="card" style="text-align:center;">
                <a href="success.html" style="color: var(--primary); text-decoration:none; font-size: 0.9rem;">← Volver a mi confirmación de pago</a>
            </div>
        `;
    }
```

a:

```js
    async function renderResultado(app) {
        const score = calculateScore();
        const isReady = score.percentage >= 90;

        if (!generatedDocsRegistro.autodiagnostico) {
            generatedDocsRegistro = {
                autodiagnostico: generatePDFBlob(),
                acuseTriptico: generateAcuseTripticoPDFBlob(),
                acuseNda: generateAcuseNdaPDFBlob()
            };
        }
        if (!autoUploadIntentado) {
            autoUploadIntentado = true;
            await subirDocumentosPendientesRegistro();
        }

        app.innerHTML = `
            <div class="resultado-hero">
                <div class="score-circle ${isReady ? 'high' : 'low'}">
                    <div class="score-percent">${score.percentage}%</div>
                    <div class="score-label">${score.si}/${score.total} reactivos</div>
                </div>
                <h1 class="intro-title">${isReady ? '¡Felicidades! 🎉' : 'Vas por buen camino 💪'}</h1>
            </div>

            <div class="recomendacion-box ${isReady ? 'evaluate' : 'assess'}">
                ${isReady
                    ? '✅ Tu resultado indica que estás LISTO para EVALUARTE. Tu Centro Evaluador te contactará para agendar tu evaluación oficial.'
                    : '📚 Te recomendamos ASESORARTE con tu Centro Evaluador antes de la evaluación oficial, para reforzar las áreas pendientes.'}
            </div>

            <div class="card">
                <h2>📥 Tus documentos de Registro</h2>
                <p style="margin-bottom: 16px; color: var(--text); font-size: 0.9rem;">Se suben automáticamente a tu portafolio. Aquí puedes ver su estado, o descargarlos como respaldo.</p>
                ${renderEstadoDoc('autodiagnostico', '📄 Autodiagnóstico EC1375')}
                ${renderEstadoDoc('acuseTriptico', '📄 Acuse de Recibido — Tríptico')}
                ${renderEstadoDoc('acuseNda', '🔒 Acuerdo de Confidencialidad (NDA)')}
            </div>

            <div class="card">
                <h2>📝 Versión Word (.doc)</h2>
                <p style="margin-bottom: 16px; color: var(--text); font-size: 0.9rem;">Versión editable de tu Autodiagnóstico — es solo un respaldo local, no se sube automáticamente.</p>
                <button class="btn btn-secondary btn-full" onclick="generateWord()">📝 Descargar Word (.doc)</button>
            </div>

            <div class="card">
                <h2>📱 Envía tu resultado al equipo</h2>
                <p style="margin-bottom: 12px; color: var(--text); font-size: 0.9rem;">Se abrirá WhatsApp con tu resumen. Adjunta el PDF que descargaste en el chat.</p>
                <button class="btn btn-whatsapp btn-full" onclick="sendWhatsAppSummary()">📱 ENVIAR RESULTADO POR WHATSAPP</button>
                <p class="whatsapp-note">Recuerda adjuntar tu PDF descargado en el chat de WhatsApp</p>
            </div>

            <div class="card">
                <h2>📚 Ruta de Estudio</h2>
                <p style="margin-bottom: 16px; color: var(--text); font-size: 0.9rem;">Curso interactivo, a tu ritmo, del EC1375 completo — se enfoca automáticamente en los reactivos que marcaste como "No" arriba.</p>
                <a href="ruta-estudio.html" class="btn btn-secondary btn-full" style="display:block; text-decoration:none;">📚 IR A MI RUTA DE ESTUDIO</a>
            </div>

            <div class="card">
                <h2>🎓 Siguiente Paso</h2>
                <p style="margin-bottom: 16px; color: var(--text); font-size: 0.9rem;">Continúa con tu Alineación (Capacitación) — material y video de preparación antes de tu evaluación práctica.</p>
                <a href="alineacion.html" class="btn btn-primary btn-full" style="display:block; text-decoration:none;">🎓 IR A MI ALINEACIÓN</a>
            </div>

            <div class="card" style="text-align:center;">
                <a href="success.html" style="color: var(--primary); text-decoration:none; font-size: 0.9rem;">← Volver a mi confirmación de pago</a>
            </div>
        `;
    }
```

**Nota de diseño:** la pantalla queda en blanco (o con el paso anterior visible) un instante mientras se genera+sube — es un trade-off deliberado por simplicidad (los PDFs son pequeños, la subida suele tardar menos de 1-2 segundos). No se agrega un spinner para no complicar el render.

- [ ] **Step 7: Actualizar el sitio de llamada en `renderStep()`**

Cambiar (línea ~913):
```js
    function renderStep() {
```
a:
```js
    async function renderStep() {
```

Cambiar (línea 950-954):
```js
        } else if (step === 'resultado') {
            navBar.style.display = 'none';
            topBarStep.textContent = 'Resultado';
            app.innerHTML = renderResultado();
        }
```
a:
```js
        } else if (step === 'resultado') {
            navBar.style.display = 'none';
            topBarStep.textContent = 'Resultado';
            await renderResultado(app);
        }
```

- [ ] **Step 8: Verificar que no quedan referencias a los nombres viejos**

Run: `grep -n "generatePDF()\|generateAcuseNdaPDF()\|generateAcuseTripticoPDF()" autodiagnostico.html`
Expected: ninguna coincidencia (los únicos usos eran los `onclick` ya reescritos en el Step 6, y las definiciones ya renombradas en el Step 5).

- [ ] **Step 9: Verificar sintaxis del archivo completo**

Extraer el contenido de `<script>...</script>` a un archivo temporal y correr `node --check` sobre él (método usado en sesiones anteriores de este proyecto — Bash con `sed`/`awk` para extraer, ya que el archivo es demasiado grande para leerlo completo con las herramientas de edición). Expected: sin errores de sintaxis.

- [ ] **Step 10: Prueba en navegador con stub de Supabase**

Construir una copia de prueba de `autodiagnostico.html` en el scratchpad de la sesión, reemplazando el `<script src=".../@supabase/supabase-js">` y `<script src="auth.js">` por un stub inline que define `window.Auth` (con `getSession()` devolviendo una sesión falsa con `access_token`/`user.email`) y mockea `window.fetch` para `/api/subir-portafolio` (responde `{success:true, path:'Portafolios/Test/01-Registro/archivo.pdf'}` en el primer intento, y para probar el flujo de reintento, mockear una respuesta `{success:false, error:'Nextcloud no disponible'}` en una segunda pasada). Servir con `python3 -m http.server` desde el scratchpad, navegar con las herramientas de `mcp__Claude_Browser__*` hasta el paso `resultado` (completando los pasos previos con datos mínimos), y verificar:
- Los 3 documentos muestran ✅ Subido cuando el mock devuelve éxito.
- Con el mock de falla, el documento correspondiente muestra ❌ No subido + los botones "🔄 Reintentar subida" y "⬇️ Descargar".
- El botón "⬇️ Descargar" dispara una descarga del blob correcto (verificar `read_network_requests`/consola sin errores).
- El botón "🔄 Reintentar subida", con el mock cambiado a éxito, actualiza el estado a ✅.
- Consola sin errores (`read_console_messages`).

Borrar la copia de prueba y el servidor del scratchpad al terminar.

- [ ] **Step 11: Commit**

```bash
git add autodiagnostico.html
git commit -m "$(cat <<'EOF'
Sube automáticamente los documentos de Registro a Nextcloud

Autodiagnóstico, Acuse de Tríptico y Acuerdo de Confidencialidad ya no
se descargan directamente — se generan, se suben automáticamente al
llegar a la pantalla de resultado, y se muestra su estado con
reintento manual + descarga de respaldo si la subida falla.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
git push origin main
```

---

### Task 3: `alineacion.html` — gate de documentos de Registro

**Files:**
- Modify: `alineacion.html:109-117` (loadAutodiagnosticoResult, sin cambios de contenido — solo referencia), `:263-278` (insertar gate nuevo)

- [ ] **Step 1: Agregar el helper de verificación de gate**

Antes de `async function render() {` (línea 230), agregar:

```js
    function documentosFaseCompletos(jsonbData, requiredKeys) {
        if (!jsonbData || !jsonbData.documentosNextcloud) return false;
        return requiredKeys.every(key => {
            const val = jsonbData.documentosNextcloud[key];
            return Array.isArray(val) ? val.length > 0 : !!val;
        });
    }
```

- [ ] **Step 2: Insertar el gate entre el chequeo de NDA y el de pago**

Cambiar (línea 275-278):
```js
                </div>`;
            return;
        }

        const email = session.user.email;
        const autorizado = await Auth.isPhaseAuthorized(email, 'alineacion');
```
a:
```js
                </div>`;
            return;
        }

        const filaCandidato = await Auth.pullMyRow();
        const registroCompleto = documentosFaseCompletos(filaCandidato && filaCandidato.autodiagnostico_data, ['autodiagnostico', 'acuseTriptico', 'acuseNda']);
        if (!registroCompleto) {
            app.innerHTML = `
                <div class="hero">
                    <div class="hero-icon">📤</div>
                    <h1 class="hero-title">Alineación (Capacitación)</h1>
                    <p class="hero-subtitle">Hola ${escapeHtml(result.personalData.nombre)}, falta un paso</p>
                </div>
                <div class="blocked-box">
                    <p><strong>Faltan documentos de tu Registro por subir</strong><br>Vuelve a la pantalla de resultado de tu Autodiagnóstico — ahí puedes ver cuál falta, reintentar la subida, o descargarlo para enviarlo manualmente.</p>
                    <a href="autodiagnostico.html" class="btn btn-primary">📋 Ir a mi Autodiagnóstico</a>
                </div>`;
            return;
        }

        const email = session.user.email;
        const autorizado = await Auth.isPhaseAuthorized(email, 'alineacion');
```

- [ ] **Step 3: Verificar que `escapeHtml` existe en este archivo**

Run: `grep -n "function escapeHtml" alineacion.html`
Expected: una coincidencia (ya se usa en otras partes de este mismo archivo). Si no existiera, agregar antes de `render()`:
```js
    function escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
```

- [ ] **Step 4: Verificar sintaxis**

Extraer y correr `node --check` sobre el `<script>` (mismo método que Task 2, Step 9).

- [ ] **Step 5: Prueba en navegador con stub**

Construir copia de prueba con `Auth.pullMyRow()` mockeado para devolver primero `{ autodiagnostico_data: null }` (debe bloquear con el mensaje nuevo), luego `{ autodiagnostico_data: { documentosNextcloud: { autodiagnostico: 'x', acuseTriptico: 'x', acuseNda: 'x' } } }` (debe pasar al chequeo de pago normal). Verificar ambos casos con `get_page_text`.

- [ ] **Step 6: Commit**

```bash
git add alineacion.html
git commit -m "$(cat <<'EOF'
Agrega gate: Alineación exige documentos de Registro subidos

Antes de mostrar el pago o contenido de Alineación, verifica que los
3 documentos de Registro (Autodiagnóstico, Acuse Tríptico, Acuerdo de
Confidencialidad) estén confirmados en Nextcloud.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
git push origin main
```

---

### Task 4: `plan-evaluacion.html` — subida automática de los documentos de Alineación

**Files:**
- Modify: `plan-evaluacion.html:583-594` (estado), `:631-636` (savePlanProgress/loadPlanProgress), `:959-963` (generatePlan), `:965-982` (renderGeneratedState), `:1003-1091` (generatePDF), `:1093-1133` (generateAcusePlanEvaluacionPDF)

- [ ] **Step 1: Agregar estado nuevo**

Después de línea 594 (`let generated = false;`), agregar:

```js
    let documentosNextcloud = {};
    let generatedDocsAlineacion = {};
```

- [ ] **Step 2: Persistir en `loadPlanProgress()`/`savePlanProgress()`**

Cambiar `loadPlanProgress()` (línea 618-629):
```js
    function loadPlanProgress() {
        try {
            const saved = JSON.parse(localStorage.getItem('planEvaluacionData') || 'null');
            if (saved) {
                planData = Object.assign(planData, saved.planData || {});
                signatureDataUrl = saved.signatureDataUrl || null;
                signatureTypedName = saved.signatureTypedName || '';
                signatureMode = saved.signatureMode || 'draw';
                hasSignature = !!signatureDataUrl;
            }
        } catch (e) {}
    }
```
a:
```js
    function loadPlanProgress() {
        try {
            const saved = JSON.parse(localStorage.getItem('planEvaluacionData') || 'null');
            if (saved) {
                planData = Object.assign(planData, saved.planData || {});
                signatureDataUrl = saved.signatureDataUrl || null;
                signatureTypedName = saved.signatureTypedName || '';
                signatureMode = saved.signatureMode || 'draw';
                hasSignature = !!signatureDataUrl;
                documentosNextcloud = saved.documentosNextcloud || {};
            }
        } catch (e) {}
    }
```

Cambiar `savePlanProgress()` (línea 631-636):
```js
    function savePlanProgress() {
        const data = { planData, signatureDataUrl, signatureTypedName, signatureMode };
        localStorage.setItem('planEvaluacionData', JSON.stringify(data));
        const result = loadAutodiagnosticoResult();
        if (result) Auth.syncToSupabase('plan_evaluacion_data', data, result.personalData.curp, result.personalData.nombre);
    }
```
a:
```js
    function savePlanProgress() {
        const data = { planData, signatureDataUrl, signatureTypedName, signatureMode, documentosNextcloud };
        localStorage.setItem('planEvaluacionData', JSON.stringify(data));
        const result = loadAutodiagnosticoResult();
        if (result) Auth.syncToSupabase('plan_evaluacion_data', data, result.personalData.curp, result.personalData.nombre);
    }
```

- [ ] **Step 3: Agregar helpers de subida y estado**

Antes de `function loadAutodiagnosticoResult() {` (línea 596), agregar:

```js
    async function subirDocumento(fase, filename, blob, nombre, curp) {
        try {
            const session = await Auth.getSession();
            if (!session) return { success: false, error: 'Sin sesión activa' };
            const fileBase64 = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result.split(',')[1]);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
            const resp = await fetch('/api/subir-portafolio', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
                body: JSON.stringify({ email: session.user.email, fase, nombre, curp, filename, fileBase64 })
            });
            const data = await resp.json();
            if (!resp.ok || !data.success) return { success: false, error: data.error || 'Error desconocido' };
            return { success: true, path: data.path };
        } catch (e) {
            return { success: false, error: e.message || 'Error de red' };
        }
    }

    function renderEstadoDoc(key, label) {
        const val = documentosNextcloud[key];
        if (val) {
            return `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.08);">
                <span>${label}</span><span style="color:var(--success);font-weight:600;">✅ Subido</span>
            </div>`;
        }
        return `<div style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.08);">
            <div style="display:flex;justify-content:space-between;align-items:center;">
                <span>${label}</span><span style="color:var(--danger);font-weight:600;">❌ No subido</span>
            </div>
            <div style="display:flex;gap:8px;margin-top:8px;">
                <button class="btn btn-secondary" style="flex:1;font-size:0.8rem;" onclick="reintentarSubidaAlineacion('${key}')">🔄 Reintentar subida</button>
                <button class="btn btn-secondary" style="flex:1;font-size:0.8rem;" onclick="descargarDocAlineacion('${key}')">⬇️ Descargar</button>
            </div>
        </div>`;
    }

    async function subirDocumentosPendientesAlineacion(result) {
        const pd = result.personalData;
        for (const key of Object.keys(generatedDocsAlineacion)) {
            if (documentosNextcloud[key]) continue;
            const { blob, filename } = generatedDocsAlineacion[key];
            const uploadResult = await subirDocumento('alineacion', filename, blob, pd.nombre, pd.curp);
            if (uploadResult.success) documentosNextcloud[key] = uploadResult.path;
        }
        savePlanProgress();
    }

    async function reintentarSubidaAlineacion(key) {
        const result = loadAutodiagnosticoResult();
        const pd = result.personalData;
        const { blob, filename } = generatedDocsAlineacion[key];
        const uploadResult = await subirDocumento('alineacion', filename, blob, pd.nombre, pd.curp);
        if (uploadResult.success) { documentosNextcloud[key] = uploadResult.path; savePlanProgress(); }
        await render();
    }

    function descargarDocAlineacion(key) {
        const { blob, filename } = generatedDocsAlineacion[key];
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

```

- [ ] **Step 4: Refactorizar `generatePDF()` y `generateAcusePlanEvaluacionPDF()` para devolver blob**

Cambiar (línea 1003):
```js
    function generatePDF() {
```
a:
```js
    function generatePDFBlob() {
```

Cambiar el final (línea 1090):
```js
        doc.save(`Plan_Evaluacion_EC1375_${(pd.nombre || 'candidato').replace(/\s+/g, '_')}.pdf`);
    }
```
a:
```js
        return { blob: doc.output('blob'), filename: `Plan_Evaluacion_EC1375_${(pd.nombre || 'candidato').replace(/\s+/g, '_')}.pdf` };
    }
```

Cambiar (línea 1093):
```js
    function generateAcusePlanEvaluacionPDF() {
```
a:
```js
    function generateAcusePlanEvaluacionPDFBlob() {
```

Cambiar el final (línea 1132):
```js
        doc.save(`Acuse_Plan_Evaluacion_EC1375_${(pd.nombre || 'candidato').replace(/\s+/g, '_')}.pdf`);
    }
```
a:
```js
        return { blob: doc.output('blob'), filename: `Acuse_Plan_Evaluacion_EC1375_${(pd.nombre || 'candidato').replace(/\s+/g, '_')}.pdf` };
    }
```

- [ ] **Step 5: Reescribir `generatePlan()` y `renderGeneratedState()`**

Cambiar (línea 959-963):
```js
    function generatePlan() {
        generated = true;
        savePlanProgress();
        render();
    }
```
a:
```js
    async function generatePlan() {
        generated = true;
        savePlanProgress();
        await render();
    }
```

Cambiar `renderGeneratedState()` (línea 965-982):
```js
    function renderGeneratedState(app, result) {
        app.innerHTML = `
            <div class="success-box">
                <h3>✅ Tu Plan de Evaluación está listo</h3>
                <p style="color:var(--text);margin-bottom:20px;">Descárgalo y compártelo con tu evaluador. Tu cita: <strong>${escapeHtml(planData.fechaHoraAgendada)}</strong></p>
                <button class="btn btn-primary btn-full" onclick="generatePDF()">📄 Descargar PDF</button>
                <button class="btn btn-secondary btn-full" onclick="generateWord()">📝 Descargar Word (.doc)</button>
                <button class="btn btn-secondary btn-full" onclick="generateAcusePlanEvaluacionPDF()">📄 Descargar Acuse de Recibido</button>
                <button class="btn btn-whatsapp btn-full" onclick="notifyWhatsApp()">📱 AVISAR AL EQUIPO POR WHATSAPP</button>
            </div>
            <div class="card" style="text-align:center;margin-top:20px;">
                <a href="guion-maestro.html" class="btn btn-secondary btn-full" style="display:block;text-decoration:none;margin-bottom:14px;">📜 Guion Maestro — para tener a la mano durante tu sesión</a>
                <a href="ruta-estudio.html" class="btn btn-secondary btn-full" style="display:block;text-decoration:none;margin-bottom:14px;">🧠 Presentar Examen de Conocimientos</a>
                <a href="documentos-sesion.html" class="btn btn-primary btn-full" style="display:block;text-decoration:none;margin-bottom:14px;">📋 Después de tu sesión: Llena tus Documentos →</a>
                <a href="success.html" style="color:var(--primary);text-decoration:none;font-size:0.9rem;">← Volver a mi confirmación de pago</a>
            </div>
        `;
    }
```
a:
```js
    async function renderGeneratedState(app, result) {
        if (!generatedDocsAlineacion.planEvaluacion) {
            generatedDocsAlineacion = {
                planEvaluacion: generatePDFBlob(),
                acusePlanEvaluacion: generateAcusePlanEvaluacionPDFBlob()
            };
        }
        await subirDocumentosPendientesAlineacion(result);

        app.innerHTML = `
            <div class="success-box">
                <h3>✅ Tu Plan de Evaluación está listo</h3>
                <p style="color:var(--text);margin-bottom:20px;">Tu cita: <strong>${escapeHtml(planData.fechaHoraAgendada)}</strong></p>
                ${renderEstadoDoc('planEvaluacion', '📄 Plan de Evaluación')}
                ${renderEstadoDoc('acusePlanEvaluacion', '📄 Acuse de Recibido')}
                <button class="btn btn-secondary btn-full" style="margin-top:14px;" onclick="generateWord()">📝 Descargar Word (.doc)</button>
                <button class="btn btn-whatsapp btn-full" onclick="notifyWhatsApp()">📱 AVISAR AL EQUIPO POR WHATSAPP</button>
            </div>
            <div class="card" style="text-align:center;margin-top:20px;">
                <a href="guion-maestro.html" class="btn btn-secondary btn-full" style="display:block;text-decoration:none;margin-bottom:14px;">📜 Guion Maestro — para tener a la mano durante tu sesión</a>
                <a href="ruta-estudio.html" class="btn btn-secondary btn-full" style="display:block;text-decoration:none;margin-bottom:14px;">🧠 Presentar Examen de Conocimientos</a>
                <a href="documentos-sesion.html" class="btn btn-primary btn-full" style="display:block;text-decoration:none;margin-bottom:14px;">📋 Después de tu sesión: Llena tus Documentos →</a>
                <a href="success.html" style="color:var(--primary);text-decoration:none;font-size:0.9rem;">← Volver a mi confirmación de pago</a>
            </div>
        `;
    }
```

- [ ] **Step 6: Actualizar el sitio de llamada en `render()`**

Cambiar (línea 679-682):
```js
        if (generated) {
            renderGeneratedState(app, result);
            return;
        }
```
a:
```js
        if (generated) {
            await renderGeneratedState(app, result);
            return;
        }
```

- [ ] **Step 7: Verificar que no quedan referencias a los nombres viejos**

Run: `grep -n "generatePDF()\|generateAcusePlanEvaluacionPDF()" plan-evaluacion.html`
Expected: ninguna coincidencia.

- [ ] **Step 8: Verificar sintaxis**

Extraer y correr `node --check` sobre el `<script>` (mismo método de Task 2).

- [ ] **Step 9: Prueba en navegador con stub**

Igual metodología que Task 2, Step 10, adaptada a este archivo: completar hasta `generatePlan()`, verificar que ambos documentos muestran su estado, probar el flujo de falla+reintento+descarga.

- [ ] **Step 10: Commit**

```bash
git add plan-evaluacion.html
git commit -m "$(cat <<'EOF'
Sube automáticamente los documentos de Alineación a Nextcloud

Plan de Evaluación y su Acuse de Recibido ya no se descargan
directamente — se suben automáticamente al generar el plan, con
estado por documento, reintento manual, y descarga de respaldo.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
git push origin main
```

---

### Task 5: `documentos-sesion.html` — gate de Alineación + subida automática de Evaluación (sesión)

**Files:**
- Modify: `documentos-sesion.html:327` (estado), `:347-363` (loadProgress/saveProgress), `:559` (insertar gate), `:1348-1389` (renderResultado/downloadDoc)

- [ ] **Step 1: Agregar estado nuevo**

Cambiar (línea 327):
```js
    let generatedPdfs = {};
```
a:
```js
    let generatedPdfs = {};
    let documentosNextcloud = {};
```

- [ ] **Step 2: Persistir en `loadProgress()`/`saveProgress()`**

Cambiar (línea 347-356):
```js
    function loadProgress() {
        try {
            const saved = JSON.parse(localStorage.getItem('documentosSesionData') || 'null');
            if (saved) {
                sessionData = Object.assign(sessionData, saved.sessionData || {});
                sesionesSeguimiento = saved.sesionesSeguimiento || sesionesSeguimiento;
                signatures = Object.assign(signatures, saved.signatures || {});
            }
        } catch (e) {}
    }
```
a:
```js
    function loadProgress() {
        try {
            const saved = JSON.parse(localStorage.getItem('documentosSesionData') || 'null');
            if (saved) {
                sessionData = Object.assign(sessionData, saved.sessionData || {});
                sesionesSeguimiento = saved.sesionesSeguimiento || sesionesSeguimiento;
                signatures = Object.assign(signatures, saved.signatures || {});
                documentosNextcloud = saved.documentosNextcloud || {};
            }
        } catch (e) {}
    }
```

Cambiar (línea 358-363):
```js
    function saveProgress() {
        const data = { sessionData, sesionesSeguimiento, signatures };
        localStorage.setItem('documentosSesionData', JSON.stringify(data));
        const result = loadAutodiagnosticoResult();
        if (result) Auth.syncToSupabase('documentos_sesion_data', data, result.personalData.curp, result.personalData.nombre);
    }
```
a:
```js
    function saveProgress() {
        const data = { sessionData, sesionesSeguimiento, signatures, documentosNextcloud };
        localStorage.setItem('documentosSesionData', JSON.stringify(data));
        const result = loadAutodiagnosticoResult();
        if (result) Auth.syncToSupabase('documentos_sesion_data', data, result.personalData.curp, result.personalData.nombre);
    }
```

- [ ] **Step 3: Agregar helpers de subida, estado, y de verificación de gate**

Después de `saveProgress()` (ahora terminando en la línea nueva correspondiente), agregar:

```js
    function documentosFaseCompletos(jsonbData, requiredKeys) {
        if (!jsonbData || !jsonbData.documentosNextcloud) return false;
        return requiredKeys.every(key => {
            const val = jsonbData.documentosNextcloud[key];
            return Array.isArray(val) ? val.length > 0 : !!val;
        });
    }

    async function subirDocumento(fase, filename, blob, nombre, curp) {
        try {
            const session = await Auth.getSession();
            if (!session) return { success: false, error: 'Sin sesión activa' };
            const fileBase64 = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result.split(',')[1]);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
            const resp = await fetch('/api/subir-portafolio', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
                body: JSON.stringify({ email: session.user.email, fase, nombre, curp, filename, fileBase64 })
            });
            const data = await resp.json();
            if (!resp.ok || !data.success) return { success: false, error: data.error || 'Error desconocido' };
            return { success: true, path: data.path };
        } catch (e) {
            return { success: false, error: e.message || 'Error de red' };
        }
    }

    function renderEstadoDoc(key, label) {
        const val = documentosNextcloud[key];
        if (val) {
            return `<div class="doc-download-item"><span>${label}</span><span style="color:var(--success);font-weight:600;">✅ Subido</span></div>`;
        }
        return `<div class="doc-download-item" style="flex-direction:column;align-items:stretch;gap:8px;">
            <div style="display:flex;justify-content:space-between;align-items:center;">
                <span>${label}</span><span style="color:var(--danger);font-weight:600;">❌ No subido</span>
            </div>
            <div style="display:flex;gap:8px;">
                <button class="btn btn-secondary" style="flex:1;font-size:0.8rem;" onclick="reintentarSubidaSesion('${key}')">🔄 Reintentar subida</button>
                <button class="btn btn-secondary" style="flex:1;font-size:0.8rem;" onclick="downloadDoc('${key}')">⬇️ Descargar</button>
            </div>
        </div>`;
    }

    async function subirDocumentosPendientesSesion(result) {
        const pd = result.personalData;
        for (const key of Object.keys(generatedPdfs)) {
            if (documentosNextcloud[key]) continue;
            const { blob, filename } = generatedPdfs[key];
            const uploadResult = await subirDocumento('evaluacion', filename, blob, pd.nombre, pd.curp);
            if (uploadResult.success) documentosNextcloud[key] = uploadResult.path;
        }
        saveProgress();
    }

    async function reintentarSubidaSesion(key) {
        const result = loadAutodiagnosticoResult();
        const pd = result.personalData;
        const { blob, filename } = generatedPdfs[key];
        const uploadResult = await subirDocumento('evaluacion', filename, blob, pd.nombre, pd.curp);
        if (uploadResult.success) { documentosNextcloud[key] = uploadResult.path; saveProgress(); }
        await renderResultado(document.getElementById('app'), result);
    }

```

- [ ] **Step 4: Insertar el gate de Alineación entre el chequeo de sesión y el de pago**

Cambiar (línea 559-561):
```js
                </div>`;
            return;
        }

        if (step !== 'intro' && !(await Auth.isPhaseAuthorized(session.user.email, 'evaluacion'))) {
```
a:
```js
                </div>`;
            return;
        }

        if (step !== 'intro') {
            const filaCandidato = await Auth.pullMyRow();
            const alineacionCompleta = documentosFaseCompletos(filaCandidato && filaCandidato.plan_evaluacion_data, ['planEvaluacion', 'acusePlanEvaluacion']);
            if (!alineacionCompleta) {
                app.innerHTML = `
                    <div class="hero"><div class="hero-icon">📤</div><h1 class="hero-title">Documentos de Sesión</h1></div>
                    <div class="blocked-box">
                        <p style="margin-bottom:18px;"><strong>Faltan documentos de tu Alineación por subir</strong><br>Vuelve a tu Plan de Evaluación — ahí puedes ver cuál falta, reintentar la subida, o descargarlo para enviarlo manualmente.</p>
                        <a href="plan-evaluacion.html" class="btn btn-primary">📅 Ir a mi Plan de Evaluación</a>
                    </div>`;
                return;
            }
        }

        if (step !== 'intro' && !(await Auth.isPhaseAuthorized(session.user.email, 'evaluacion'))) {
```

- [ ] **Step 5: Reescribir `renderResultado()` y quitar la copia vieja de `downloadDoc()`**

Cambiar (línea 1348-1389, todo el bloque de `renderResultado` hasta el final de `downloadDoc`):
```js
    function renderResultado(app, result) {
        generatedPdfs = {
            ficha: generateFichaPDF(result),
            consentimiento: generateConsentimientoPDF(result),
            plan_sesion: generatePlanSesionPDF(result),
            plan_seguimiento: generatePlanSeguimientoPDF(result)
        };
        saveProgress();

        const docs = [
            { key: 'ficha', label: '📋 Ficha de Registro de Atención' },
            { key: 'consentimiento', label: '📝 Carta de Consentimiento Informado' },
            { key: 'plan_sesion', label: '📅 Plan de Sesión' },
            { key: 'plan_seguimiento', label: '📞 Plan de Seguimiento' }
        ];

        app.innerHTML = `
            <div class="success-box">
                <h3 style="color:var(--success);margin-bottom:10px;">✅ Tus 4 documentos están listos</h3>
                <p style="color:var(--text);margin-bottom:20px;">Descarga cada uno y súbelo a la pregunta correspondiente en el formulario de Evidencias.</p>
                ${docs.map(d => `
                    <div class="doc-download-item">
                        <span>${d.label}</span>
                        <button class="btn btn-primary" onclick="downloadDoc('${d.key}')">Descargar</button>
                    </div>
                `).join('')}
            </div>
            <div class="card" style="text-align:center;margin-top:20px;">
                <a href="encuesta-satisfaccion.html" class="btn btn-primary btn-full" style="display:block;text-decoration:none;margin-bottom:14px;">📝 Siguiente: Encuesta de Satisfacción →</a>
                <a href="plan-evaluacion.html" style="color:var(--primary);text-decoration:none;font-size:0.9rem;">← Volver a mi Plan de Evaluación</a>
            </div>
        `;
    }

    function downloadDoc(key) {
        const { blob, filename } = generatedPdfs[key];
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
```
a:
```js
    async function renderResultado(app, result) {
        if (!generatedPdfs.ficha) {
            generatedPdfs = {
                ficha: generateFichaPDF(result),
                consentimiento: generateConsentimientoPDF(result),
                plan_sesion: generatePlanSesionPDF(result),
                plan_seguimiento: generatePlanSeguimientoPDF(result)
            };
        }
        await subirDocumentosPendientesSesion(result);

        const docs = [
            { key: 'ficha', label: '📋 Ficha de Registro de Atención' },
            { key: 'consentimiento', label: '📝 Carta de Consentimiento Informado' },
            { key: 'plan_sesion', label: '📅 Plan de Sesión' },
            { key: 'plan_seguimiento', label: '📞 Plan de Seguimiento' }
        ];

        app.innerHTML = `
            <div class="success-box">
                <h3 style="color:var(--success);margin-bottom:10px;">✅ Tus 4 documentos están listos</h3>
                <p style="color:var(--text);margin-bottom:20px;">Se suben automáticamente a tu portafolio.</p>
                ${docs.map(d => renderEstadoDoc(d.key, d.label)).join('')}
            </div>
            <div class="card" style="text-align:center;margin-top:20px;">
                <a href="encuesta-satisfaccion.html" class="btn btn-primary btn-full" style="display:block;text-decoration:none;margin-bottom:14px;">📝 Siguiente: Encuesta de Satisfacción →</a>
                <a href="plan-evaluacion.html" style="color:var(--primary);text-decoration:none;font-size:0.9rem;">← Volver a mi Plan de Evaluación</a>
            </div>
        `;
    }

    function downloadDoc(key) {
        const { blob, filename } = generatedPdfs[key];
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
```

- [ ] **Step 6: Actualizar el sitio de llamada en `renderStep()`**

Cambiar (línea 601):
```js
        if (step === 'resultado') { renderResultado(app, result); return; }
```
a:
```js
        if (step === 'resultado') { await renderResultado(app, result); return; }
```

(`renderStep()` ya es `async function renderStep()` en este archivo — confirmado en la exploración previa, línea 531 — no requiere cambio.)

- [ ] **Step 7: Verificar sintaxis**

Extraer y correr `node --check` sobre el `<script>`.

- [ ] **Step 8: Prueba en navegador con stub**

Cubrir: (a) el gate nuevo bloquea si `plan_evaluacion_data.documentosNextcloud` no tiene ambas claves; (b) pasa el gate y llega al pago normal si sí las tiene; (c) en `resultado`, los 4 documentos muestran su estado, con el flujo de falla+reintento+descarga probado igual que en tareas anteriores.

- [ ] **Step 9: Commit**

```bash
git add documentos-sesion.html
git commit -m "$(cat <<'EOF'
Gate de Alineación + subida automática de Documentos de Sesión

Documentos de Sesión ahora exige que el Plan de Evaluación y su Acuse
estén subidos a Nextcloud antes de continuar, y sus 4 PDFs (Ficha,
Consentimiento, Plan de Sesión, Plan de Seguimiento) se suben
automáticamente en vez de solo descargarse.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
git push origin main
```

---

### Task 6: `encuesta-satisfaccion.html` — gate de Documentos de Sesión + subida automática

**Files:**
- Modify: `encuesta-satisfaccion.html:107-114` (estado), `:138-143` (saveProgress/loadProgress), `:171-184` (insertar gate), `:353-368` (generateEncuesta/renderGeneratedState), `:387-437` (generatePDF)

- [ ] **Step 1: Agregar estado nuevo**

Después de línea 114 (`let generated = false;`), agregar:

```js
    let documentosNextcloud = {};
    let generatedDocEncuesta = null;
```

- [ ] **Step 2: Persistir en `loadProgress()`/`saveProgress()`**

Cambiar (línea 124-136):
```js
    function loadProgress() {
        try {
            const saved = JSON.parse(localStorage.getItem('encuestaSatisfaccionData') || 'null');
            if (saved) {
                respuestas = saved.respuestas || {};
                comentarios = saved.comentarios || '';
                signatureDataUrl = saved.signatureDataUrl || null;
                signatureTypedName = saved.signatureTypedName || '';
                signatureMode = saved.signatureMode || 'draw';
                hasSignature = !!signatureDataUrl;
            }
        } catch (e) {}
    }
```
a:
```js
    function loadProgress() {
        try {
            const saved = JSON.parse(localStorage.getItem('encuestaSatisfaccionData') || 'null');
            if (saved) {
                respuestas = saved.respuestas || {};
                comentarios = saved.comentarios || '';
                signatureDataUrl = saved.signatureDataUrl || null;
                signatureTypedName = saved.signatureTypedName || '';
                signatureMode = saved.signatureMode || 'draw';
                hasSignature = !!signatureDataUrl;
                documentosNextcloud = saved.documentosNextcloud || {};
            }
        } catch (e) {}
    }
```

Cambiar (línea 138-143):
```js
    function saveProgress() {
        const data = { respuestas, comentarios, signatureDataUrl, signatureTypedName, signatureMode };
        localStorage.setItem('encuestaSatisfaccionData', JSON.stringify(data));
        const result = loadAutodiagnosticoResult();
        if (result) Auth.syncToSupabase('encuesta_data', data, result.personalData.curp, result.personalData.nombre);
    }
```
a:
```js
    function saveProgress() {
        const data = { respuestas, comentarios, signatureDataUrl, signatureTypedName, signatureMode, documentosNextcloud };
        localStorage.setItem('encuestaSatisfaccionData', JSON.stringify(data));
        const result = loadAutodiagnosticoResult();
        if (result) Auth.syncToSupabase('encuesta_data', data, result.personalData.curp, result.personalData.nombre);
    }
```

- [ ] **Step 3: Agregar helpers de subida, estado, y de verificación de gate**

Después de `saveProgress()`, agregar:

```js
    function documentosFaseCompletos(jsonbData, requiredKeys) {
        if (!jsonbData || !jsonbData.documentosNextcloud) return false;
        return requiredKeys.every(key => {
            const val = jsonbData.documentosNextcloud[key];
            return Array.isArray(val) ? val.length > 0 : !!val;
        });
    }

    async function subirDocumento(fase, filename, blob, nombre, curp) {
        try {
            const session = await Auth.getSession();
            if (!session) return { success: false, error: 'Sin sesión activa' };
            const fileBase64 = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result.split(',')[1]);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
            const resp = await fetch('/api/subir-portafolio', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
                body: JSON.stringify({ email: session.user.email, fase, nombre, curp, filename, fileBase64 })
            });
            const data = await resp.json();
            if (!resp.ok || !data.success) return { success: false, error: data.error || 'Error desconocido' };
            return { success: true, path: data.path };
        } catch (e) {
            return { success: false, error: e.message || 'Error de red' };
        }
    }

    function renderEstadoDoc(key, label) {
        const val = documentosNextcloud[key];
        if (val) {
            return `<p style="color:var(--success);font-weight:600;margin-bottom:10px;">✅ ${label} subido</p>`;
        }
        return `<div style="margin-bottom:14px;">
            <p style="color:var(--danger);font-weight:600;margin-bottom:8px;">❌ ${label} no subido</p>
            <div style="display:flex;gap:8px;">
                <button class="btn btn-secondary" style="flex:1;font-size:0.8rem;" onclick="reintentarSubidaEncuesta('${key}')">🔄 Reintentar subida</button>
                <button class="btn btn-secondary" style="flex:1;font-size:0.8rem;" onclick="generatePDF()">⬇️ Descargar</button>
            </div>
        </div>`;
    }

    async function subirDocumentoPendienteEncuesta(result) {
        const pd = result.personalData;
        if (documentosNextcloud.encuesta) return;
        const { blob, filename } = generatedDocEncuesta;
        const uploadResult = await subirDocumento('evaluacion', filename, blob, pd.nombre, pd.curp);
        if (uploadResult.success) documentosNextcloud.encuesta = uploadResult.path;
        saveProgress();
    }

    async function reintentarSubidaEncuesta(key) {
        const result = loadAutodiagnosticoResult();
        await subirDocumentoPendienteEncuesta(result);
        renderGeneratedState(document.getElementById('app'), result);
    }

```

- [ ] **Step 4: Insertar el gate de Documentos de Sesión entre el chequeo de sesión y el flujo normal**

Cambiar (línea 183-186, el cierre del bloque de sesión y el inicio del flujo):
```js
                </div>`;
            return;
        }

        if (generated) { renderGeneratedState(app, result); return; }
```
a:
```js
                </div>`;
            return;
        }

        const filaCandidato = await Auth.pullMyRow();
        const sesionCompleta = documentosFaseCompletos(filaCandidato && filaCandidato.documentos_sesion_data, ['ficha', 'consentimiento', 'plan_sesion', 'plan_seguimiento']);
        if (!sesionCompleta) {
            app.innerHTML = `
                <div class="hero">
                    <div class="hero-icon">📤</div>
                    <h1 class="hero-title">Encuesta de Satisfacción</h1>
                    <p class="hero-subtitle">Falta un paso antes de continuar</p>
                </div>
                <div class="blocked-box">
                    <p><strong>Faltan documentos de tu sesión por subir</strong><br>Vuelve a Documentos de Sesión — ahí puedes ver cuál falta, reintentar la subida, o descargarlo para enviarlo manualmente.</p>
                    <a href="documentos-sesion.html" class="btn btn-primary">📋 Ir a mis Documentos de Sesión</a>
                </div>`;
            return;
        }

        if (generated) { await renderGeneratedState(app, result); return; }
```

- [ ] **Step 5: Refactorizar `generatePDF()` para devolver blob**

Cambiar (línea 387):
```js
    function generatePDF() {
```
a:
```js
    function generatePDFBlob() {
```

Cambiar el final (línea 436):
```js
        doc.save(`Encuesta_Satisfaccion_EC1375_${(pd.nombre || 'candidato').replace(/\s+/g, '_')}.pdf`);
    }
```
a:
```js
        return { blob: doc.output('blob'), filename: `Encuesta_Satisfaccion_EC1375_${(pd.nombre || 'candidato').replace(/\s+/g, '_')}.pdf` };
    }
```

**Nota:** el botón "⬇️ Descargar" del Step 3 llama a `generatePDF()` (nombre viejo) a propósito — como esta página no cachea un blob descargable aparte, el botón de descarga de respaldo simplemente vuelve a generar el PDF y lo descarga directo. Como el nombre cambió a `generatePDFBlob()`, hay que exponer una función `generatePDF()` nueva y pequeña que sí descargue, ver Step 6.

- [ ] **Step 6: Reescribir `generateEncuesta()`, `renderGeneratedState()`, y agregar un `generatePDF()` de descarga**

Cambiar (línea 353):
```js
    function generateEncuesta() { generated = true; saveProgress(); render(); }
```
a:
```js
    async function generateEncuesta() { generated = true; saveProgress(); await render(); }

    function generatePDF() {
        const { blob, filename } = generatePDFBlob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
```

Cambiar `renderGeneratedState()` (línea 355-368):
```js
    function renderGeneratedState(app, result) {
        app.innerHTML = `
            <div class="success-box">
                <h3>🎉 ¡Ya tienes tus 3 documentos generados!</h3>
                <p style="color:var(--text);margin-bottom:20px;">Descarga tu Encuesta y súbela junto con tu Autodiagnóstico y Plan de Evaluación en el último paso: la Carga de Evidencias.</p>
                <button class="btn btn-primary btn-full" onclick="generatePDF()">📄 Descargar Encuesta (PDF)</button>
                <button class="btn btn-whatsapp btn-full" onclick="notifyWhatsApp()">📱 AVISAR AL EQUIPO POR WHATSAPP</button>
            </div>
            <div class="card" style="text-align:center;margin-top:20px;">
                <a href="evidencias.html" class="btn btn-primary btn-full" style="display:block;text-decoration:none;margin-bottom:14px;">📤 Siguiente: Sube tus Evidencias →</a>
                <a href="documentos-sesion.html" style="color:var(--primary);text-decoration:none;font-size:0.9rem;">← Volver a mis Documentos de Sesión</a>
            </div>
        `;
    }
```
a:
```js
    async function renderGeneratedState(app, result) {
        if (!generatedDocEncuesta) generatedDocEncuesta = generatePDFBlob();
        await subirDocumentoPendienteEncuesta(result);

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

- [ ] **Step 7: Verificar sintaxis**

Extraer y correr `node --check` sobre el `<script>`.

- [ ] **Step 8: Prueba en navegador con stub**

Cubrir: gate bloquea/pasa según `documentos_sesion_data.documentosNextcloud`; estado del documento en `renderGeneratedState`; reintento; descarga con `generatePDF()` nuevo.

- [ ] **Step 9: Commit**

```bash
git add encuesta-satisfaccion.html
git commit -m "$(cat <<'EOF'
Gate de Documentos de Sesión + subida automática de la Encuesta

La Encuesta de Satisfacción ahora exige que los 4 documentos de
Documentos de Sesión estén subidos a Nextcloud antes de continuar, y
su propio PDF se sube automáticamente en vez de solo descargarse.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
git push origin main
```

---

### Task 7: `evidencias.html` — gate de Encuesta + reemplazo del Google Form

**Files:**
- Modify: `evidencias.html:152-168` (checklist), `:170` (estado), `:200-218` (loadProgress/saveProgress), `:246-260` (insertar gate), `:278-306` (checklist + Form), `:352-381` (updateGenerateButton)

- [ ] **Step 1: Recortar `EVIDENCIAS_REQUERIDAS` a lo que el sitio no genera**

Cambiar (línea 152-168):
```js
    const GOOGLE_FORM_EMBED_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSeI6K5YkxBnw_-ER8lHQNXk11AiujztXiyFnTHV2S0eJc0qxw/viewform?embedded=true';

    const EVIDENCIAS_REQUERIDAS = [
        { icon: '📸', titulo: 'Capturas de tu sesión Zoom', desc: 'Fotos/capturas de pantalla que muestren tu sesión en vivo con el usuario. Se anexan directamente a tu expediente.', required: true },
        { icon: '🔗', titulo: 'Liga al video completo (YouTube u otra plataforma)', desc: 'Sube tu grabación completa a YouTube (puede ser "oculto/no listado") u otra plataforma, y pega la liga en el campo de abajo. Tu evaluador la revisa para calificar el Instrumento de Evaluación.', required: true, isLink: true },
        { icon: '📋', titulo: 'Ficha de Registro de Atención', desc: 'PDF generado en "Documentos de Sesión" (ya no es una foto — llénalo digitalmente con la firma del usuario).', required: true },
        { icon: '📝', titulo: 'Carta de Consentimiento Informado', desc: 'PDF generado en "Documentos de Sesión", con la firma digital del usuario.', required: true },
        { icon: '📅', titulo: 'Plan de Sesión', desc: 'PDF generado en "Documentos de Sesión" — condiciones, número de sesiones y objetivos.', required: true },
        { icon: '📆', titulo: 'Plan de Seguimiento', desc: 'PDF generado en "Documentos de Sesión" — contacto y sesiones programadas, con firma del usuario.', required: true },
        { icon: '🪪', titulo: 'Identificación oficial (INE/Pasaporte)', desc: 'Copia legible de tu identificación vigente, frente y reverso.', required: true },
        { icon: '📄', titulo: 'Comprobante CURP', desc: 'Constancia o copia de tu CURP.', required: true },
        { icon: '📸', titulo: 'Foto para tu diploma', desc: 'De frente, fondo blanco, sin texturas, formal y nítida (JPG, BMP o PNG). Mujeres: frente y orejas descubiertas, sin maquillaje ni aretes, blusa clara y lisa. Hombres: orejas descubiertas, pelo corto, sin barba/bigote, camisa clara y lisa. Sin retoques. No mayor a 2 meses de antigüedad.', required: true },
        { icon: '🎓', titulo: 'Certificados / diplomas de formación', desc: 'Respaldo de las especialidades que marcaste en tu Autodiagnóstico.', required: false },
        { icon: '📑', titulo: 'Tus 3 PDFs generados (Autodiagnóstico, Plan de Evaluación, Encuesta)', desc: 'Descarga los PDFs que ya generaste en pasos anteriores y súbelos aquí también — se integran directamente a tu expediente final.', required: true },
        { icon: '✅', titulo: 'Acuse de Recibido — Tríptico', desc: 'Descárgalo desde la pantalla de resultado de tu Autodiagnóstico (botón "Descargar Acuse de Tríptico").', required: true },
        { icon: '✅', titulo: 'Acuse de Recibido — Plan de Evaluación', desc: 'Descárgalo desde la pantalla final de tu Plan de Evaluación (botón "Descargar Acuse de Recibido").', required: true }
    ];
```
a:
```js
    const EVIDENCIAS_REQUERIDAS = [
        { icon: '📸', titulo: 'Capturas de tu sesión Zoom', desc: 'Fotos/capturas de pantalla que muestren tu sesión en vivo con el usuario. Se suben directo a tu portafolio con el botón de abajo.', required: true },
        { icon: '🔗', titulo: 'Liga al video completo (YouTube u otra plataforma)', desc: 'Sube tu grabación completa a YouTube (puede ser "oculto/no listado") u otra plataforma, y pega la liga en el campo de abajo. Tu evaluador la revisa para calificar el Instrumento de Evaluación.', required: true, isLink: true },
        { icon: '🪪', titulo: 'Identificación oficial (INE/Pasaporte)', desc: 'Copia legible de tu identificación vigente, frente y reverso.', required: true },
        { icon: '📄', titulo: 'Comprobante CURP', desc: 'Constancia o copia de tu CURP.', required: true },
        { icon: '📸', titulo: 'Foto para tu diploma', desc: 'De frente, fondo blanco, sin texturas, formal y nítida (JPG, BMP o PNG). Mujeres: frente y orejas descubiertas, sin maquillaje ni aretes, blusa clara y lisa. Hombres: orejas descubiertas, pelo corto, sin barba/bigote, camisa clara y lisa. Sin retoques. No mayor a 2 meses de antigüedad.', required: true },
        { icon: '🎓', titulo: 'Certificados / diplomas de formación', desc: 'Respaldo adicional de tus especialidades (opcional — ya capturaste lo principal en tu Autodiagnóstico).', required: false }
    ];
```

(Se eliminan las 7 líneas de PDFs/Acuses que ya se suben solos, y la constante `GOOGLE_FORM_EMBED_URL` — el Form se retira por completo en el Step 4.)

- [ ] **Step 2: Agregar estado nuevo**

Cambiar (línea 170):
```js
    let planData = { evidenciasConfirmadas: false, notas: '', videoLink: '' };
```
a:
```js
    let planData = { evidenciasConfirmadas: false, notas: '', videoLink: '' };
    let documentosNextcloud = {};
```

- [ ] **Step 3: Persistir en `loadProgress()`/`saveProgress()`, agregar helpers**

Cambiar (línea 200-211):
```js
    function loadProgress() {
        try {
            const saved = JSON.parse(localStorage.getItem('evidenciasData') || 'null');
            if (saved) {
                planData = Object.assign(planData, saved.planData || {});
                signatureDataUrl = saved.signatureDataUrl || null;
                signatureTypedName = saved.signatureTypedName || '';
                signatureMode = saved.signatureMode || 'draw';
                hasSignature = !!signatureDataUrl;
            }
        } catch (e) {}
    }
```
a:
```js
    function loadProgress() {
        try {
            const saved = JSON.parse(localStorage.getItem('evidenciasData') || 'null');
            if (saved) {
                planData = Object.assign(planData, saved.planData || {});
                signatureDataUrl = saved.signatureDataUrl || null;
                signatureTypedName = saved.signatureTypedName || '';
                signatureMode = saved.signatureMode || 'draw';
                hasSignature = !!signatureDataUrl;
                documentosNextcloud = saved.documentosNextcloud || {};
            }
        } catch (e) {}
    }
```

Cambiar (línea 213-218):
```js
    function saveProgress() {
        const data = { planData, signatureDataUrl, signatureTypedName, signatureMode };
        localStorage.setItem('evidenciasData', JSON.stringify(data));
        const result = loadAutodiagnosticoResult();
        if (result) Auth.syncToSupabase('evidencias_data', data, result.personalData.curp, result.personalData.nombre);
    }
```
a:
```js
    function saveProgress() {
        const data = { planData, signatureDataUrl, signatureTypedName, signatureMode, documentosNextcloud };
        localStorage.setItem('evidenciasData', JSON.stringify(data));
        const result = loadAutodiagnosticoResult();
        if (result) Auth.syncToSupabase('evidencias_data', data, result.personalData.curp, result.personalData.nombre);
    }
```

Después de `saveProgress()`, agregar:

```js
    function documentosFaseCompletos(jsonbData, requiredKeys) {
        if (!jsonbData || !jsonbData.documentosNextcloud) return false;
        return requiredKeys.every(key => {
            const val = jsonbData.documentosNextcloud[key];
            return Array.isArray(val) ? val.length > 0 : !!val;
        });
    }

    async function subirDocumento(fase, filename, blob, nombre, curp) {
        try {
            const session = await Auth.getSession();
            if (!session) return { success: false, error: 'Sin sesión activa' };
            const fileBase64 = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result.split(',')[1]);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
            const resp = await fetch('/api/subir-portafolio', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
                body: JSON.stringify({ email: session.user.email, fase, nombre, curp, filename, fileBase64 })
            });
            const data = await resp.json();
            if (!resp.ok || !data.success) return { success: false, error: data.error || 'Error desconocido' };
            return { success: true, path: data.path };
        } catch (e) {
            return { success: false, error: e.message || 'Error de red' };
        }
    }

    function renderEstadoArchivo(key) {
        const val = documentosNextcloud[key];
        const count = Array.isArray(val) ? val.length : (val ? 1 : 0);
        if (count === 0) return '';
        return `<p style="color:var(--success);font-size:0.8rem;margin-top:6px;">✅ ${count} archivo${count > 1 ? 's' : ''} subido${count > 1 ? 's' : ''}</p>`;
    }

    async function handleFileUpload(key, fileList, esMultiple) {
        const files = Array.from(fileList);
        if (files.length === 0) return;
        const result = loadAutodiagnosticoResult();
        const pd = result.personalData;
        const estadoId = 'estado' + key.charAt(0).toUpperCase() + key.slice(1);
        const estadoEl = document.getElementById(estadoId);
        if (estadoEl) estadoEl.innerHTML = '<p style="color:var(--text);font-size:0.8rem;">⏳ Subiendo...</p>';

        if (esMultiple) {
            if (!Array.isArray(documentosNextcloud[key])) documentosNextcloud[key] = [];
            for (const file of files) {
                const uniqueName = `${Date.now()}_${file.name}`;
                const uploadResult = await subirDocumento('evaluacion', uniqueName, file, pd.nombre, pd.curp);
                if (uploadResult.success) documentosNextcloud[key].push(uploadResult.path);
            }
        } else {
            const file = files[0];
            const uploadResult = await subirDocumento('evaluacion', file.name, file, pd.nombre, pd.curp);
            if (uploadResult.success) {
                documentosNextcloud[key] = uploadResult.path;
            } else if (estadoEl) {
                estadoEl.innerHTML = `<p style="color:var(--danger);font-size:0.8rem;">❌ ${escapeHtml(uploadResult.error || 'No se pudo subir')}</p>`;
                return;
            }
        }
        saveProgress();
        if (estadoEl) estadoEl.innerHTML = renderEstadoArchivo(key);
        updateGenerateButton();
    }

```

- [ ] **Step 4: Insertar el gate de Encuesta, y reemplazar la sección del Google Form**

Cambiar (línea 258-260, el cierre del bloque de sesión):
```js
                </div>`;
            return;
        }

        if (generated) { renderGeneratedState(app, result); return; }
```
a:
```js
                </div>`;
            return;
        }

        const filaCandidato = await Auth.pullMyRow();
        const encuestaCompleta = documentosFaseCompletos(filaCandidato && filaCandidato.encuesta_data, ['encuesta']);
        if (!encuestaCompleta) {
            app.innerHTML = `
                <div class="hero">
                    <div class="hero-icon">📤</div>
                    <h1 class="hero-title">Carga de Evidencias</h1>
                    <p class="hero-subtitle">Falta un paso antes de continuar</p>
                </div>
                <div class="blocked-box">
                    <p><strong>Falta tu Encuesta de Satisfacción por subir</strong><br>Vuelve a la Encuesta — ahí puedes reintentar la subida o descargarla para enviarla manualmente.</p>
                    <a href="encuesta-satisfaccion.html" class="btn btn-primary">📝 Ir a mi Encuesta</a>
                </div>`;
            return;
        }

        if (generated) { renderGeneratedState(app, result); return; }
```

Cambiar (línea 294-306, la tarjeta del Formulario de Carga):
```js
            <div class="card">
                <h2>📤 Formulario de Carga</h2>
                <p class="desc">Sube tus archivos directamente aquí. Necesitas iniciar sesión con una cuenta de Google para subir archivos (requisito de Google Forms).</p>
                ${GOOGLE_FORM_EMBED_URL ? `
                    <iframe id="evidenceFrame" src="${GOOGLE_FORM_EMBED_URL}">Cargando…</iframe>
                ` : `
                    <div class="form-cta-box">
                        <p style="color:var(--text-bright);font-weight:600;margin-bottom:10px;">El formulario de carga se está configurando</p>
                        <p class="desc" style="margin-bottom:16px;">Mientras tanto, envía tus archivos directamente por WhatsApp:</p>
                        <button class="btn btn-whatsapp" onclick="requestUploadViaWhatsApp()">📱 ENVIAR EVIDENCIAS POR WHATSAPP</button>
                    </div>
                `}
            </div>
```
a:
```js
            <div class="card">
                <h2>📤 Sube tus archivos</h2>
                <p class="desc">Se guardan automáticamente en tu portafolio en cuanto los seleccionas.</p>
                <div class="field-group">
                    <label>📸 Capturas de tu sesión Zoom (puedes subir varias)</label>
                    <input type="file" id="f_zoom" accept="image/*" multiple onchange="handleFileUpload('zoom', this.files, true)">
                    <div id="estadoZoom">${renderEstadoArchivo('zoom')}</div>
                </div>
                <div class="field-group">
                    <label>🪪 Identificación oficial (INE/Pasaporte)</label>
                    <input type="file" id="f_ine" accept="image/*,application/pdf" onchange="handleFileUpload('ine', this.files, false)">
                    <div id="estadoIne">${renderEstadoArchivo('ine')}</div>
                </div>
                <div class="field-group">
                    <label>📄 Comprobante CURP</label>
                    <input type="file" id="f_curp" accept="image/*,application/pdf" onchange="handleFileUpload('curp', this.files, false)">
                    <div id="estadoCurp">${renderEstadoArchivo('curp')}</div>
                </div>
                <div class="field-group">
                    <label>📸 Foto para tu diploma</label>
                    <input type="file" id="f_fotoDiploma" accept="image/*" onchange="handleFileUpload('fotoDiploma', this.files, false)">
                    <div id="estadoFotoDiploma">${renderEstadoArchivo('fotoDiploma')}</div>
                </div>
                <div class="field-group">
                    <label>🎓 Certificados / diplomas de formación (opcional)</label>
                    <input type="file" id="f_certificados" accept="image/*,application/pdf" multiple onchange="handleFileUpload('certificados', this.files, true)">
                    <div id="estadoCertificados">${renderEstadoArchivo('certificados')}</div>
                </div>
            </div>
```

- [ ] **Step 5: Extender `updateGenerateButton()` con los nuevos requisitos**

Cambiar (línea 358-361):
```js
        const missing = [];
        if (!hasVideoLink) missing.push('liga a tu video de sesión');
        if (!planData.evidenciasConfirmadas) missing.push('marcar la casilla de confirmación');
        if (!hasSig) missing.push('proporcionar tu firma');
```
a:
```js
        const missing = [];
        if (!hasVideoLink) missing.push('liga a tu video de sesión');
        if (!(Array.isArray(documentosNextcloud.zoom) && documentosNextcloud.zoom.length > 0)) missing.push('subir al menos una captura de tu sesión Zoom');
        if (!documentosNextcloud.ine) missing.push('subir tu identificación oficial (INE)');
        if (!documentosNextcloud.curp) missing.push('subir tu comprobante CURP');
        if (!documentosNextcloud.fotoDiploma) missing.push('subir tu foto para el diploma');
        if (!planData.evidenciasConfirmadas) missing.push('marcar la casilla de confirmación');
        if (!hasSig) missing.push('proporcionar tu firma');
```

- [ ] **Step 6: Verificar que `requestUploadViaWhatsApp()` no queda huérfano**

Run: `grep -n "requestUploadViaWhatsApp" evidencias.html`
La función sigue definida pero ya no se llama desde ningún `onclick` (era el fallback del Form embed vacío). Dejarla tal cual — es una función pequeña y no rota, no vale la pena borrarla ahora (fuera del alcance de esta tarea). Confirmar que el `grep` solo encuentra la definición, no un `onclick` roto.

- [ ] **Step 7: Verificar sintaxis**

Extraer y correr `node --check` sobre el `<script>`.

- [ ] **Step 8: Prueba en navegador con stub**

Cubrir: gate bloquea/pasa según `encuesta_data.documentosNextcloud`; los 5 `<input type="file">` nuevos disparan `handleFileUpload` (usar `form_input`/`javascript_tool` para simular selección de archivo, ya que los inputs de tipo file no se pueden rellenar por `computer`); el botón "Confirmar Entrega" permanece deshabilitado hasta que los 4 obligatorios (zoom, ine, curp, fotoDiploma) más los requisitos previos estén completos; `missingHint` lista exactamente lo que falta.

- [ ] **Step 9: Commit**

```bash
git add evidencias.html
git commit -m "$(cat <<'EOF'
Gate de Encuesta + reemplaza el Google Form por subida directa

evidencias.html ya no re-pide los 7 documentos que el sitio ya sube
solo (Ficha, Consentimiento, Plan de Sesión, Plan de Seguimiento,
Autodiagnóstico, Plan de Evaluación, Encuesta, ambos Acuses). El
Google Form se reemplaza por <input type="file"> nativos para lo que
el sitio de verdad no genera: capturas de Zoom, INE, CURP, foto de
diploma, certificados (opcional).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
git push origin main
```

---

### Task 8: `entrega.html` — gate de evidencias de Evaluación

**Files:**
- Modify: `entrega.html:196-209` (insertar gate)

- [ ] **Step 1: Agregar el helper de verificación de gate**

Antes de `async function render() {` (línea 181), agregar:

```js
    function documentosFaseCompletos(jsonbData, requiredKeys) {
        if (!jsonbData || !jsonbData.documentosNextcloud) return false;
        return requiredKeys.every(key => {
            const val = jsonbData.documentosNextcloud[key];
            return Array.isArray(val) ? val.length > 0 : !!val;
        });
    }
```

- [ ] **Step 2: Insertar el gate entre el chequeo de sesión y el de pago**

Cambiar (línea 204-209):
```js
                </div>`;
            return;
        }

        const email = session.user.email;
        const autorizado = await Auth.isPhaseAuthorized(email, 'entrega');
```
a:
```js
                </div>`;
            return;
        }

        const filaCandidato = await Auth.pullMyRow();
        const evidenciasCompletas = documentosFaseCompletos(filaCandidato && filaCandidato.evidencias_data, ['zoom', 'ine', 'curp', 'fotoDiploma']);
        if (!evidenciasCompletas) {
            app.innerHTML = `
                <div class="hero"><div class="hero-icon">📤</div><h1 class="hero-title">Entrega de Certificado</h1></div>
                <div class="blocked-box">
                    <p style="margin-bottom:12px;"><strong style="color:var(--accent);">Faltan evidencias por subir</strong></p>
                    <p style="font-size:0.9rem;color:var(--text);margin-bottom:16px;">Vuelve a Carga de Evidencias para completar lo que falta.</p>
                    <a href="evidencias.html" class="btn btn-primary">📤 Ir a mis Evidencias</a>
                </div>`;
            return;
        }

        const email = session.user.email;
        const autorizado = await Auth.isPhaseAuthorized(email, 'entrega');
```

- [ ] **Step 3: Verificar sintaxis**

Extraer y correr `node --check` sobre el `<script>`.

- [ ] **Step 4: Prueba en navegador con stub**

Cubrir: gate bloquea/pasa según `evidencias_data.documentosNextcloud`.

- [ ] **Step 5: Commit**

```bash
git add entrega.html
git commit -m "$(cat <<'EOF'
Agrega gate: Entrega exige evidencias de Evaluación subidas

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
git push origin main
```

---

### Task 9: Documentar en `Claude.md`

**Files:**
- Modify: `Claude.md` (agregar sección nueva, siguiendo el formato ya usado para "Fase 4", "Certificados de formación previa", etc.)

- [ ] **Step 1: Agregar la sección nueva**

Insertar, después de la sección `### ✅ \`ruta-alineacion.html\`...` y antes de `### 🔮 Backlog`, una nueva sección:

```markdown
### ✅ Almacenamiento automático en Nextcloud — reemplaza descarga/re-subida manual (12 de septiembre, 2026)

Humberto (evaluador, con su propio servidor) instaló Nextcloud en un TrueNAS SCALE, expuesto vía Cloudflare Tunnel (sin puertos abiertos), con una cuenta de servicio de solo-WebDAV. Se construyó `api/subir-portafolio.js`, endpoint serverless que sube archivos vía WebDAV a `Portafolios/{Nombre_CURP}/{01-Registro|02-Alineacion|03-Evaluacion|04-Entrega}/`, verificando el `access_token` real de la sesión de Supabase antes de aceptar la subida (evita que un candidato sobreescriba la carpeta de otro).

Los ~9 PDFs que el sitio genera (Autodiagnóstico, Acuse NDA, Acuse Tríptico en `autodiagnostico.html`; Plan de Evaluación y su Acuse en `plan-evaluacion.html`; los 4 de `documentos-sesion.html`; Encuesta en `encuesta-satisfaccion.html`) ya no se descargan directo — se generan y se suben automáticamente, con estado por documento (✅ Subido / ❌ No subido + reintento manual + descarga de respaldo). El Google Form de `evidencias.html` se retiró — se reemplazó por `<input type="file">` nativos para lo único que el sitio no genera: capturas de Zoom, INE, CURP, foto de diploma, certificados (opcional).

**"Filtro" entre fases (bloqueo duro):** cada página gateada agrega una verificación más a su cadena de gates existente — no se puede avanzar a la siguiente fase hasta que los documentos de la fase anterior estén confirmados en Nextcloud: `alineacion.html` (exige Registro), `documentos-sesion.html` (exige Alineación), `encuesta-satisfaccion.html` (exige Documentos de Sesión), `evidencias.html` (exige Encuesta), `entrega.html` (exige Evidencias). El estado vive en el mismo JSONB que cada página ya sincronizaba (`documentosNextcloud: {clave: ruta}`), sin necesitar ninguna migración de esquema ni función RPC nueva — RLS ya permite a cada candidato leer su propia fila.

**Variables de entorno en Vercel** (ya configuradas en Production y Preview): `NEXTCLOUD_URL`, `NEXTCLOUD_USERNAME`, `NEXTCLOUD_APP_PASSWORD`.

**⚠️ Pendiente que Diego/Humberto confirmen:** `NEXTCLOUD_URL` se guardó como `https://nextcloud.paideiatech.net/login` — probablemente la URL de la pantalla de login del navegador, no el endpoint WebDAV real. El código la normaliza defensivamente, pero hay que confirmar la URL base correcta antes de dar por probada la integración con el Nextcloud real.

**Fuera de alcance (documentado, no urgente):**
- `assemble_expediente.py` (Python, hoy lee de Google Forms/Drive) — sigue igual; migrarlo a leer de este Nextcloud es un proyecto aparte.
- El bucket de Supabase Storage `certificados-previos` (certificados de formación previa) — se queda como está, ya era automático.
- Panel de administración con override manual si Nextcloud cae por horas — si hace falta, Diego edita el JSONB directo desde el Table Editor de Supabase, mismo mecanismo que ya usa para pagos manuales.

Spec completo: `docs/superpowers/specs/2026-09-12-nextcloud-portafolio-storage-design.md`. Plan de implementación: `docs/superpowers/plans/2026-09-12-nextcloud-portafolio-storage.md`.
```

- [ ] **Step 2: Commit**

```bash
git add Claude.md
git commit -m "$(cat <<'EOF'
Documenta el almacenamiento automático en Nextcloud en Claude.md

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
git push origin main
```

---

### Task 10: Verificación final en producción

**Files:** ninguno (solo verificación)

- [ ] **Step 1: Confirmar que las 9 tareas anteriores están desplegadas**

Run: `git log --oneline -12`
Expected: ver los 9 commits de las Tareas 1-9, todos con push a `main`.

- [ ] **Step 2: Verificar que cada página modificada responde 200 en producción**

Run:
```bash
for f in autodiagnostico alineacion plan-evaluacion documentos-sesion encuesta-satisfaccion evidencias entrega; do
  echo "$f: $(curl -s -o /dev/null -w '%{http_code}' https://sepconocer.paideiatech.com/$f.html)"
done
```
Expected: `200` para las 7 páginas.

- [ ] **Step 3: Confirmar que el endpoint nuevo está desplegado**

Run: `curl -s -o /dev/null -w '%{http_code}' -X POST https://sepconocer.paideiatech.com/api/subir-portafolio`
Expected: `401` (falta el token — confirma que el endpoint existe y su validación corre, aunque el método sea POST vacío) o `400` si el body vacío se rechaza antes que el header — cualquiera de los dos confirma que el endpoint está vivo y no un 404.

- [ ] **Step 4: Reportar a Diego lo que sigue pendiente**

Recordarle explícitamente: (a) confirmar/corregir la URL real de Nextcloud antes de una prueba end-to-end con un candidato real, y (b) que puede correr una prueba real él mismo (o pedir a Humberto verificar en el propio Nextcloud que aparece la carpeta `Portafolios/...`) en cuanto la URL esté confirmada.
