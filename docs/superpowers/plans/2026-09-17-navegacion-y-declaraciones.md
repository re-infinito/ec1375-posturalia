# Navegación entre secciones y declaraciones del candidato — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el candidato pueda regresar a cualquier sección ya llenada (Autodiagnóstico, Plan, Encuesta, Evidencias) y que acepte de forma explícita, con fecha, las declaraciones de requisitos, material, sin reembolsos y autenticidad de evidencias.

**Architecture:** HTML/JS vanilla sin build. La navegación replica el patrón ya en producción en `documentos-sesion.html` (`pasoMaximoPermitido`/`irAPaso`/selector + tarjeta de pasos). Las declaraciones se guardan dentro del JSONB que cada página ya sincroniza (`planData`), sin SQL nuevo; el equipo las ve con un helper puro nuevo `AdminData.declaraciones(row)` probado en Node.

**Tech Stack:** JS vanilla, jsPDF (ya cargado en las páginas), `node --test` para helpers puros, navegador integrado para verificar.

**Spec:** `docs/superpowers/specs/2026-09-17-recursos-navegacion-declaraciones-design.md` (partes A y D). Las partes C (toolkit) y B (tutoriales) tienen su propio plan.

**Convenciones del repo (leer antes de empezar):**
- `git fetch` y revisar `git log HEAD..origin/main` antes de cada push: hay otras sesiones empujando a `main`.
- Stage solo archivos específicos. Nunca `AGENTS.md`, `*.rtf`, `Videos EC1375 Diego Editados/`, `EC1375 _Fotografia DEGA.jpeg`.
- Commits en español, terminados en `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- Revisar sintaxis de los `<script>` inline así (cambiar el archivo):
  ```bash
  python3 -c "import re;s=open('ARCHIVO.html').read();open('/tmp/chk.js','w').write('\n;\n'.join(re.findall(r'<script>(.*?)</script>',s,re.S)))" && node --check /tmp/chk.js && echo SYNTAX OK
  ```
- Suite: `node --test tests/*.test.js` (hoy 77 pasando).

---

## Estructura de archivos

| Archivo | Cambio |
|---|---|
| `autodiagnostico.html` | CSS del selector/tarjeta; `SECCIONES_NAVEGABLES`, `seccionMaximaPermitida`, `irASeccion`, `selectorSeccionesHtml`, `listaSeccionesHtml`; inserción en `renderStep()` y en `renderResultado()` |
| `plan-evaluacion.html` | Botón "Editar mis respuestas"; 3 declaraciones (UI, `toggleDeclaracion`, validación, faltantes); huella sin `declaraciones` |
| `encuesta-satisfaccion.html` | Botón "Editar mis respuestas" |
| `evidencias.html` | Botón "Editar mis respuestas"; declaración de autenticidad (UI, validación, comprobante PDF) |
| `admin-data.js` | `DECLARACIONES` + `declaraciones(row)` |
| `tests/admin-data.test.js` | Pruebas de `declaraciones(row)` |
| `admin-candidatos.html` | Bloque "Declaraciones aceptadas" en el detalle |
| `Claude.md` | Documentar |

---

### Task 1: Autodiagnóstico — regresar a una sección

**Files:**
- Modify: `autodiagnostico.html` (CSS tras `.btn-full { width: 100%; }`, funciones nuevas antes de `function goNext()`, `renderStep()` y `renderResultado()`)

- [ ] **Step 1: Agregar el CSS** — después de la línea `        .btn-full { width: 100%; }`:

```css
        /* Regresar a secciones ya llenadas (17 sep) — mismo patrón que documentos-sesion.html */
        .saltar-paso { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 14px; }
        .saltar-paso label { font-size: 0.8rem; font-weight: 700; color: var(--text); }
        .saltar-paso select { flex: 1 1 240px; min-width: 0; min-height: 42px; padding: 8px 12px; border-radius: 8px; border: 1px solid var(--border); background: var(--dark-light); color: var(--text-bright); font: inherit; font-size: 0.88rem; cursor: pointer; }
        .pasos-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 8px; margin-top: 12px; }
        .paso-link { display: flex; align-items: center; gap: 10px; text-align: left; padding: 10px 12px; min-height: 44px; border-radius: 8px; border: 1px solid var(--border); background: var(--dark); color: var(--text-bright); font: inherit; font-size: 0.86rem; cursor: pointer; }
        .paso-link:hover { border-color: var(--primary); }
        .paso-link .n { flex-shrink: 0; width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center; font-size: 0.75rem; font-weight: 700; background: var(--surface-2); color: var(--primary); }
```

- [ ] **Step 2: Agregar las funciones** — inmediatamente antes de `    function goNext() {`:

```js
    /* =========================================================
       REGRESAR A SECCIONES YA LLENADAS (17 sep, pedido de Diego)
       Mismo patrón que documentos-sesion.html: selector arriba de cada
       sección y tarjeta en el Resultado. Solo hasta la primera sección
       incompleta. Sin los 142 reactivos cargados no se sabe si un Elemento
       está completo (isStepValid tronaba así antes de e4898e1), así que en
       ese caso el límite se queda en el primer Elemento.
    ========================================================= */
    const SECCIONES_NAVEGABLES = ['personal', 'nda', 'e1', 'e2', 'e3', 'e4', 'firma', 'resultado'];
    const TITULO_SECCION = {
        personal: 'Datos personales', nda: 'Acuerdo de Confidencialidad', e1: 'Elemento 1', e2: 'Elemento 2',
        e3: 'Elemento 3', e4: 'Elemento 4', firma: 'Firma', resultado: 'Tu resultado'
    };
    function seccionMaximaPermitida() {
        for (let i = STEPS.indexOf('personal'); i < STEPS.length - 1; i++) {
            const st = STEPS[i];
            if (st.startsWith('e') && !AUTODIAGNOSTICO_DATA.length) return i;
            if (!isStepValid(st)) return i;
        }
        return STEPS.length - 1;
    }
    function irASeccion(i) {
        const n = parseInt(i, 10);
        if (!(n >= STEPS.indexOf('personal') && n <= seccionMaximaPermitida())) return;
        currentStepIndex = n;
        renderStep().catch(mostrarErrorPaso);
    }
    function selectorSeccionesHtml() {
        const max = seccionMaximaPermitida();
        const opciones = SECCIONES_NAVEGABLES.map(st => {
            const i = STEPS.indexOf(st), bloqueada = i > max;
            return `<option value="${i}"${i === currentStepIndex ? ' selected' : ''}${bloqueada ? ' disabled' : ''}>${escapeHtml(TITULO_SECCION[st])}${bloqueada ? ' (completa lo anterior)' : ''}</option>`;
        }).join('');
        return `<div class="saltar-paso"><label for="saltarSeccion">Ir a otra sección</label><select id="saltarSeccion" onchange="irASeccion(this.value)">${opciones}</select></div>`;
    }
    function listaSeccionesHtml() {
        return SECCIONES_NAVEGABLES.filter(st => st !== 'resultado').map((st, k) =>
            `<button type="button" class="paso-link" onclick="irASeccion(${STEPS.indexOf(st)})"><span class="n">${k + 1}</span><span>${escapeHtml(TITULO_SECCION[st])}</span></button>`
        ).join('');
    }

```

- [ ] **Step 3: Insertar el selector en `renderStep()`** — reemplazar:

```js
        updateProgressBar();
        updateNavButtons();
    }
```

por:

```js
        if (['personal', 'nda', 'e1', 'e2', 'e3', 'e4', 'firma'].includes(step)) app.insertAdjacentHTML('afterbegin', selectorSeccionesHtml());

        updateProgressBar();
        updateNavButtons();
    }
```

(`insertAdjacentHTML('afterbegin')` no vuelve a parsear lo existente: el lienzo de firma y el recuadro de "Usar la misma firma" siguen funcionando.)

- [ ] **Step 4: Insertar la tarjeta en `renderResultado()`** — reemplazar:

```js
            <div class="card">
                <h2>🎯 Siguiente Paso: Reforzamiento</h2>
```

por:

```js
            <div class="card">
                <h2>↩️ Regresar a una sección</h2>
                <p style="margin-bottom: 4px; color: var(--text); font-size: 0.9rem;">Toca una sección para revisarla o corregirla. Si cambias algo, tus documentos de Registro se vuelven a subir solos con la versión actualizada.</p>
                <div class="pasos-grid">${listaSeccionesHtml()}</div>
            </div>

            <div class="card">
                <h2>🎯 Siguiente Paso: Reforzamiento</h2>
```

- [ ] **Step 5: Revisar sintaxis** — comando de "Convenciones" con `autodiagnostico.html`. Esperado: `SYNTAX OK`.

- [ ] **Step 6: Commit**

```bash
git add autodiagnostico.html
git commit -m "Autodiagnóstico: regresar a cualquier sección ya llenada (selector y tarjeta en el resultado)

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: "Editar mis respuestas" en Plan, Encuesta y Evidencias

**Files:**
- Modify: `plan-evaluacion.html` (`renderGeneratedState`)
- Modify: `encuesta-satisfaccion.html` (`renderGeneratedState`)
- Modify: `evidencias.html` (`renderGeneratedState`)

- [ ] **Step 1: Plan de Evaluación** — en `renderGeneratedState`, reemplazar:

```js
                <p style="font-size:0.8rem;color:var(--text);margin-top:10px;">Si después corriges algo, se vuelven a subir solos con la versión actualizada.</p>
            </div>
```

por:

```js
                <p style="font-size:0.8rem;color:var(--text);margin-top:10px;">Si después corriges algo, se vuelven a subir solos con la versión actualizada.</p>
                <button class="btn btn-secondary btn-full" style="margin-top:14px;" onclick="editarRespuestas()">✏️ Editar mis respuestas</button>
            </div>
```

y agregar justo antes de `    async function renderGeneratedState(app, result) {`:

```js
    /* Regresa al formulario con todo lo llenado (17 sep). */
    function editarRespuestas() { generated = false; render(); window.scrollTo(0, 0); }

```

- [ ] **Step 2: Encuesta** — en `renderGeneratedState`, reemplazar:

```js
                <div id="estadoDocEncuesta"></div>
```

por:

```js
                <div id="estadoDocEncuesta"></div>
                <button class="btn btn-secondary btn-full" onclick="editarRespuestas()">✏️ Editar mis respuestas</button>
```

y agregar la misma función `editarRespuestas` (Step 1) justo antes de `    async function renderGeneratedState(app, result) {`.

- [ ] **Step 3: Evidencias** — en `renderGeneratedState`, reemplazar:

```js
                <button class="btn btn-primary btn-full" onclick="generatePDF()">📄 Descargar comprobante (PDF)</button>
```

por:

```js
                <button class="btn btn-primary btn-full" onclick="generatePDF()">📄 Descargar comprobante (PDF)</button>
                <button class="btn btn-secondary btn-full" onclick="editarRespuestas()">✏️ Editar mis evidencias</button>
```

y agregar la misma función `editarRespuestas` (Step 1) justo antes de `    async function renderGeneratedState(app, result) {`.

- [ ] **Step 4: Revisar sintaxis** de los 3 archivos. Esperado: `SYNTAX OK` ×3.

- [ ] **Step 5: Commit**

```bash
git add plan-evaluacion.html encuesta-satisfaccion.html evidencias.html
git commit -m "Plan, Encuesta y Evidencias: botón para volver a editar lo ya llenado

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: `AdminData.declaraciones(row)` (TDD)

**Files:**
- Modify: `admin-data.js` (antes de `    var AdminData = {` y en el objeto exportado)
- Test: `tests/admin-data.test.js` (al final)

- [ ] **Step 1: Escribir la prueba** — agregar al final de `tests/admin-data.test.js`:

```js
test('declaraciones: fecha de cada una o null, desde Plan y Evidencias', () => {
    const row = {
        plan_evaluacion_data: { planData: { declaraciones: { version: '2026-09-17', requisitos: '2026-09-17T15:00:00Z', material: '2026-09-17T15:01:00Z' } } },
        evidencias_data: { planData: { declaracionAutenticidad: { version: '2026-09-17', fecha: '2026-09-18T10:00:00Z' } } }
    };
    const d = AdminData.declaraciones(row);
    assert.deepEqual(d.map(x => x.id), ['requisitos', 'material', 'sinReembolsos', 'autenticidad']);
    assert.deepEqual(d.map(x => x.fecha), ['2026-09-17T15:00:00Z', '2026-09-17T15:01:00Z', null, '2026-09-18T10:00:00Z']);
    assert.ok(d.every(x => typeof x.label === 'string' && x.label.length > 5));
});

test('declaraciones: sin fila, sin datos o con valores raros → todas pendientes', () => {
    for (const row of [null, {}, { plan_evaluacion_data: null }, { plan_evaluacion_data: { planData: { declaraciones: { requisitos: true } } } }]) {
        assert.deepEqual(AdminData.declaraciones(row).map(x => x.fecha), [null, null, null, null]);
    }
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `node --test tests/admin-data.test.js 2>&1 | grep -E "^✖|^ℹ (pass|fail)"`
Expected: 2 fallas con `AdminData.declaraciones is not a function`.

- [ ] **Step 3: Implementar** — en `admin-data.js`, justo antes de `    var AdminData = {`:

```js
    /* Declaraciones del candidato (17 sep): qué aceptó y cuándo. Viven en el
       JSONB de Plan de Evaluación y de Evidencias (admin_lista_candidatos()
       ya los regresa, sin firmas). fecha = ISO de cuando la marcó, o null. */
    var DECLARACIONES = [
        { id: 'requisitos', label: 'Cumple los requisitos del EC1375', col: 'plan_evaluacion_data', ruta: ['planData', 'declaraciones', 'requisitos'] },
        { id: 'material', label: 'Dispone del material y equipo para su evaluación', col: 'plan_evaluacion_data', ruta: ['planData', 'declaraciones', 'material'] },
        { id: 'sinReembolsos', label: 'Acepta que no aplican reembolsos', col: 'plan_evaluacion_data', ruta: ['planData', 'declaraciones', 'sinReembolsos'] },
        { id: 'autenticidad', label: 'Declara auténticas sus evidencias', col: 'evidencias_data', ruta: ['planData', 'declaracionAutenticidad', 'fecha'] }
    ];
    function declaraciones(row) {
        return DECLARACIONES.map(function (d) {
            var v = row ? row[d.col] : null;
            d.ruta.forEach(function (k) { v = v && typeof v === 'object' ? v[k] : null; });
            return { id: d.id, label: d.label, fecha: typeof v === 'string' && v ? v : null };
        });
    }

```

y en el objeto `AdminData`, cambiar la línea

```js
        candidatos: candidatos, porPaso: porPaso, ultimosPagos: ultimosPagos, proximasSesiones: proximasSesiones, atencion: atencion,
```

por

```js
        candidatos: candidatos, porPaso: porPaso, ultimosPagos: ultimosPagos, proximasSesiones: proximasSesiones, atencion: atencion,
        declaraciones: declaraciones,
```

- [ ] **Step 4: Correr la suite**

Run: `node --test tests/*.test.js 2>&1 | grep -E "^✖|^ℹ (tests|pass|fail)"`
Expected: `pass 79`, `fail 0`.

- [ ] **Step 5: Commit**

```bash
git add admin-data.js tests/admin-data.test.js
git commit -m "AdminData.declaraciones(row): qué declaraciones aceptó cada candidato y cuándo

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Plan de Evaluación — tres declaraciones obligatorias

**Files:**
- Modify: `plan-evaluacion.html` (bloque "Acuerdo y Firma", `toggleAcuerdo`, `getValidationStatus`, `getMissingFields`, `huellaDocsAlineacion`)

- [ ] **Step 1: Textos y funciones** — justo antes de `    function toggleAcuerdo(el) {`:

```js
    /* Declaraciones del candidato (17 sep, pedido de Diego). Textos modelo:
       validar con el evaluador. Se guarda la fecha de aceptación (evidencia);
       desmarcar la borra. No van al PDF del Plan (formato validado). */
    const VERSION_DECLARACIONES = '2026-09-17';
    const DECLARACIONES_PLAN = [
        { id: 'requisitos', texto: 'Confirmo que cumplo con todos los requisitos del Estándar de Competencia EC1375 y del proceso de evaluación, y que la información y documentos que proporciono son verídicos.' },
        { id: 'material', texto: 'Confirmo que dispongo del material, equipo y espacio descritos en «Requerimientos para la Evaluación» para realizar mi evaluación práctica.' },
        { id: 'sinReembolsos', texto: 'Entiendo que, una vez realizado cualquier pago o anticipo, no aplican reembolsos, salvo que la causa sea responsabilidad del Centro Evaluador.' }
    ];
    function declaracionesPlanCompletas() {
        const d = planData.declaraciones || {};
        return DECLARACIONES_PLAN.every(x => typeof d[x.id] === 'string' && d[x.id]);
    }
    function toggleDeclaracion(id, el) {
        const d = Object.assign({}, planData.declaraciones || {});
        if (el.checked) d[id] = new Date().toISOString(); else delete d[id];
        d.version = VERSION_DECLARACIONES;
        planData.declaraciones = d;
        savePlanProgress();
        /* Se actualiza solo el renglón (como toggleAcuerdo): volver a pintar
           la página movería el scroll y reiniciaría el lienzo de firma. */
        const renglon = el.closest('.checkbox-row'), label = renglon && renglon.querySelector('label');
        const x = DECLARACIONES_PLAN.find(y => y.id === id);
        if (renglon) {
            renglon.style.background = el.checked ? 'rgba(0,255,136,0.08)' : 'rgba(255,51,51,0.08)';
            renglon.style.borderColor = el.checked ? 'var(--success)' : 'var(--danger)';
        }
        if (label && x) {
            label.style.color = el.checked ? 'var(--success)' : 'var(--text)';
            label.textContent = (el.checked ? '✓ ' : '○ ') + x.texto;
        }
        updateGenerateButton();
    }

```

- [ ] **Step 2: Casillas en la UI** — en el bloque "Acuerdo y Firma", reemplazar:

```js
                        ${planData.acuerdoAceptado ? '✓ ' : '○ '}Acepto el Plan de Evaluación descrito arriba
                    </label>
                </div>
```

por:

```js
                        ${planData.acuerdoAceptado ? '✓ ' : '○ '}Acepto el Plan de Evaluación descrito arriba
                    </label>
                </div>
                ${DECLARACIONES_PLAN.map(x => {
                    const ok = !!(planData.declaraciones && planData.declaraciones[x.id]);
                    return `<div class="checkbox-row" style="background:${ok ? 'rgba(0,255,136,0.08)' : 'rgba(255,51,51,0.08)'};border:1px solid ${ok ? 'var(--success)' : 'var(--danger)'};">
                        <input type="checkbox" id="decl_${x.id}" ${ok ? 'checked' : ''} onchange="toggleDeclaracion('${x.id}', this)">
                        <label for="decl_${x.id}" style="color:${ok ? 'var(--success)' : 'var(--text)'};">${ok ? '✓ ' : '○ '}${escapeHtml(x.texto)}</label>
                    </div>`;
                }).join('')}
```

- [ ] **Step 3: Validación** — en `getValidationStatus()`, reemplazar:

```js
            completo: planData.acuerdoAceptado && hasSig && fechaCompleta
```

por:

```js
            declaraciones: declaracionesPlanCompletas(),
            completo: planData.acuerdoAceptado && hasSig && fechaCompleta && declaracionesPlanCompletas()
```

y en `getMissingFields()`, después de `        if (!status.acuerdo) missing.push('✓ Marcar el checkbox de acuerdo');` agregar:

```js
        if (!status.declaraciones) missing.push('✓ Marcar las 3 confirmaciones (requisitos, material y sin reembolsos)');
```

- [ ] **Step 4: Excluir las declaraciones de la huella** — en `huellaDocsAlineacion()`, reemplazar:

```js
        return DocumentosNas.huella({ v: VERSION_DOCS_ALINEACION, planData, signatureDataUrl, signatureTypedName, signatureMode, auto });
```

por:

```js
        /* Las declaraciones no entran al PDF: marcarlas no debe resubir el Plan. */
        const { declaraciones, ...planDoc } = planData;
        return DocumentosNas.huella({ v: VERSION_DOCS_ALINEACION, planData: planDoc, signatureDataUrl, signatureTypedName, signatureMode, auto });
```

**Ojo:** esto cambia la huella de todos los Planes ya subidos (la clave `planData` ahora es `planDoc` sin `declaraciones`; el JSON resultante es el mismo si no hay declaraciones, así que **no** provoca resubida). Verificarlo en el Task 7.

- [ ] **Step 5: La resubida automática no exige las declaraciones** — en `sincronizarDocsAlineacion()`, reemplazar:

```js
        if (!getValidationStatus().completo) return;
```

por:

```js
        /* Solo lo que entra al PDF: un Plan ya subido sin declaraciones (de
           antes del 17 sep) debe poder resubirse si cambian sus datos. */
        const estado = getValidationStatus();
        if (!(estado.acuerdo && estado.firma && estado.fecha)) return;
```

- [ ] **Step 6: Revisar sintaxis** (`plan-evaluacion.html`). Esperado: `SYNTAX OK`.

- [ ] **Step 7: Commit**

```bash
git add plan-evaluacion.html
git commit -m "Plan de Evaluación: confirmaciones obligatorias de requisitos, material y sin reembolsos, con fecha

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Evidencias — declaración de autenticidad

**Files:**
- Modify: `evidencias.html` (tarjeta "Confirmación", `updateGenerateButton`, `generatePDF`)

- [ ] **Step 1: Texto y función** — justo antes de `    function toggleConfirm(el) {`:

```js
    /* Declaración de autenticidad (17 sep, pedido de Diego): deslinda al
       Centro Evaluador de evidencias falsificadas. Texto modelo: validar con
       el evaluador. Se guarda la fecha; desmarcar la borra. */
    const VERSION_DECLARACION_AUTENTICIDAD = '2026-09-17';
    const TEXTO_DECLARACION_AUTENTICIDAD = 'Declaro bajo protesta de decir verdad que las evidencias que entrego —video, capturas, documentos e identificaciones— son auténticas, corresponden a una atención real realizada por mí y no fueron alteradas. Cualquier falsificación o alteración es mi exclusiva responsabilidad, y libero al Centro Evaluador y a Paideia Tech de toda responsabilidad derivada de ella.';
    function toggleAutenticidad(el) {
        planData.declaracionAutenticidad = el.checked ? { version: VERSION_DECLARACION_AUTENTICIDAD, fecha: new Date().toISOString() } : null;
        saveProgress(); updateGenerateButton();
    }

```

- [ ] **Step 2: Casilla en la UI** — en la tarjeta "Confirmación", reemplazar:

```js
                    <label for="confirmCheck">Confirmo que subí todas mis evidencias obligatorias</label>
                </div>
```

por:

```js
                    <label for="confirmCheck">Confirmo que subí todas mis evidencias obligatorias</label>
                </div>
                <div class="checkbox-row">
                    <input type="checkbox" id="autenticidadCheck" ${planData.declaracionAutenticidad ? 'checked' : ''} onchange="toggleAutenticidad(this)">
                    <label for="autenticidadCheck"><strong>Declaración de autenticidad.</strong> ${escapeHtml(TEXTO_DECLARACION_AUTENTICIDAD)}</label>
                </div>
```

- [ ] **Step 3: Validación** — en `updateGenerateButton()`, después de `        if (!planData.evidenciasConfirmadas) missing.push('marcar la casilla de confirmación');` agregar:

```js
        if (!planData.declaracionAutenticidad) missing.push('aceptar la declaración de autenticidad de tus evidencias');
```

- [ ] **Step 4: En el comprobante PDF** — en `generatePDF()`, reemplazar:

```js
        doc.text(acuerdoText, 14, y);
        y += acuerdoText.length * 4 + 10;
```

por:

```js
        doc.text(acuerdoText, 14, y);
        y += acuerdoText.length * 4 + 4;
        if (planData.declaracionAutenticidad) {
            const decl = doc.splitTextToSize('Declaración de autenticidad (aceptada el ' + new Date(planData.declaracionAutenticidad.fecha).toLocaleDateString('es-MX') + '): ' + TEXTO_DECLARACION_AUTENTICIDAD, 180);
            doc.text(decl, 14, y);
            y += decl.length * 4 + 10;
        } else {
            y += 6;
        }
```

- [ ] **Step 5: Revisar sintaxis** (`evidencias.html`). Esperado: `SYNTAX OK`.

- [ ] **Step 6: Commit**

```bash
git add evidencias.html
git commit -m "Evidencias: declaración de autenticidad obligatoria que deslinda al Centro Evaluador

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Admin — "Declaraciones aceptadas" en el detalle del candidato

**Files:**
- Modify: `admin-candidatos.html` (`abrirDetalle`)

- [ ] **Step 1: Construir el bloque** — en `abrirDetalle(email)`, justo antes de `        const pr = datosGlobal.precio.find(x => x.email === c.email) || {};` agregar:

```js
        const declHtml = '<ul class="crm-list">' + AdminData.declaraciones(c.row).map(d =>
            `<li><span class="crm-st ${d.fecha ? 'crm-ok' : ''}">${ic(d.fecha ? 'check' : 'clock', 16)}</span><span>${esc(d.label)}<div class="crm-muted">${d.fecha ? 'Aceptada el ' + fechaCorta(d.fecha) : 'Pendiente'}</div></span></li>`
        ).join('') + '</ul>';
```

- [ ] **Step 2: Pintarlo** — en la plantilla del drawer, reemplazar:

```js
            <div class="crm-card-h"><span class="crm-stat-ico">${ic('card', 18)}</span>Fases de pago</div><ul class="crm-list">${fasesHtml}</ul>
```

por:

```js
            <div class="crm-card-h"><span class="crm-stat-ico">${ic('check', 18)}</span>Declaraciones aceptadas</div>${declHtml}
            <div class="crm-card-h"><span class="crm-stat-ico">${ic('card', 18)}</span>Fases de pago</div><ul class="crm-list">${fasesHtml}</ul>
```

- [ ] **Step 3: Revisar sintaxis** (`admin-candidatos.html`). Esperado: `SYNTAX OK`. Confirmar que `admin-candidatos.html` carga `admin-data.js` (`grep -n "admin-data.js" admin-candidatos.html`) y que `fechaCorta` e `ic` existen (`grep -n "function fechaCorta\|function ic\|const ic" admin-candidatos.html`).

- [ ] **Step 4: Commit**

```bash
git add admin-candidatos.html
git commit -m "Admin: declaraciones aceptadas por el candidato en su detalle

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Verificación en navegador, documentación y publicación

**Files:**
- Modify: `Claude.md`
- Temporal (gitignored, borrar al final): `_internal_no_publicar/pruebas-locales/`

- [ ] **Step 1: Copias locales con sesión simulada** — levantar el servidor `ec1375-static` (puerto 8420) con `preview_start`. `_internal_no_publicar/` está en `.gitignore`, así que las copias nunca se suben. Generarlas con:

```bash
cd "/Users/diegogarzamx/Desktop/Paideia Tech" && mkdir -p _internal_no_publicar/pruebas-locales && python3 - <<'PY'
stub = r'''<script>
/* === STUB DE PRUEBA LOCAL (no se publica) === */
(function(){
  const fake = { access_token: 'tok-local', user: { id: 'u-local', email: 'prueba.local@example.com' } };
  Auth.getSession = async () => { Auth._session = fake; return fake; };
  Auth.hasSession = () => true;
  Auth.isBypassSession = async () => { Auth._isBypassSession = false; return false; };
  Auth.pullMyRow = async () => JSON.parse(localStorage.getItem('__row') || 'null');
  Auth.isPhaseAuthorized = async () => true;
  Auth.syncToSupabase = () => {}; Auth.flushSync = async () => {};
  window.__subidas = [];
  const f = window.fetch.bind(window);
  window.fetch = async (url, opts) => {
    const u = String(url);
    if (u.includes('/api/subir-portafolio')) {
      const b = JSON.parse(opts.body); window.__subidas.push(b.filename);
      return new Response(JSON.stringify({ success: true, path: 'Portafolios/Prueba/' + b.fase + '/' + b.filename }), { status: 200 });
    }
    if (u.includes('/api/')) return new Response('{}', { status: 200 });
    return f(url, opts);
  };
  if (window.Contenido) Contenido.cargar = async (clave) => (await (await f('/_internal_no_publicar/contenido/bloques/' + clave.replace(':', '__') + '.json')).json()).contenido;
})();
</script>
'''
for page in ['autodiagnostico.html', 'plan-evaluacion.html', 'encuesta-satisfaccion.html', 'evidencias.html']:
    s = open(page).read().replace('<head>', '<head>\n<base href="/">', 1)
    anchor = '<script src="flow-status.js"></script>'
    assert s.count(anchor) == 1
    open('_internal_no_publicar/pruebas-locales/' + page, 'w').write(s.replace(anchor, anchor + '\n' + stub, 1))
print('ok')
PY
```

Sembrar datos ficticios desde la consola de una de esas páginas (sin la marca `_demo`, que `auth.js` aparta para cuentas no demo):

```js
const strip = o => JSON.parse(JSON.stringify(o, (k, v) => k === '_demo' ? undefined : v));
localStorage.clear();
localStorage.setItem('autodiagnosticoData', JSON.stringify(strip(Auth.ADMIN_PLACEHOLDER_AUTODIAGNOSTICO())));
const down = strip(Auth.ADMIN_PLACEHOLDER_DOWNSTREAM());
down.planEvaluacionData.documentosNextcloud = { planEvaluacion: 'p', acusePlanEvaluacion: 'q' };
for (const k of Object.keys(down)) localStorage.setItem(k, JSON.stringify(down[k]));
localStorage.setItem('__row', JSON.stringify({ plan_evaluacion_data: down.planEvaluacionData, documentos_sesion_data: down.documentosSesionData, encuesta_data: { documentosNextcloud: { encuesta: 'e.pdf' } } }));
```

Antes de probar, forzar que el navegador no use copias viejas: `await fetch('/auth.js', { cache: 'reload' })` (y lo mismo con `crm-shell.js`, `documentos-nas.js`), y abrir cada página con `?cb=<aleatorio>`.

- [ ] **Step 2: Autodiagnóstico** — en Resultado: tarjeta con 7 botones; clic en "Elemento 3" abre `e3` con el selector arriba; el selector salta a "Datos personales"; vaciar el teléfono → opciones posteriores a Datos personales deshabilitadas y `irASeccion(8)` no hace nada.

- [ ] **Step 3: Plan de Evaluación** — sin declaraciones el botón Generar está deshabilitado y el aviso lista "Marcar las 3 confirmaciones"; marcar las 3 guarda 3 fechas ISO en `planEvaluacionData.planData.declaraciones`; desmarcar una la borra; **la huella no cambia al marcarlas** (comparar `huellaDocsAlineacion()` antes y después) y no hay subidas nuevas; Generar → "Editar mis respuestas" regresa al formulario con todo lleno.

- [ ] **Step 4: Encuesta y Evidencias** — "Editar" regresa al formulario; en Evidencias el botón Confirmar exige la declaración; el comprobante PDF contiene "Declaración de autenticidad (aceptada el …)" (render con `pdftoppm` o extraer texto con `pypdf`).

- [ ] **Step 5: Móvil** — 375 px sin desborde en las 4 páginas (`document.documentElement.scrollWidth - clientWidth === 0`).

- [ ] **Step 6: Documentar en `Claude.md`** — en "Cambios recientes (17 de septiembre, 2026)" agregar un punto con: navegación en Autodiagnóstico (selector + tarjeta, límite con reactivos), "Editar mis respuestas" en Plan/Encuesta/Evidencias, las 4 declaraciones (dónde, datos `planData.declaraciones` / `planData.declaracionAutenticidad`, versión `2026-09-17`, textos modelo a validar con el evaluador, no van al PDF del Plan, sí al comprobante de Evidencias, visibles en el detalle de admin) y `AdminData.declaraciones(row)`.

- [ ] **Step 7: Suite y publicación**

```bash
node --test tests/*.test.js 2>&1 | grep -E "^ℹ (pass|fail)"
rm -rf _internal_no_publicar/pruebas-locales
git fetch -q && git log --oneline HEAD..origin/main
git add Claude.md && git commit -m "Claude.md: navegación entre secciones y declaraciones del candidato

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
git push origin main
```

Expected: `pass 79`, `fail 0`; si `git log HEAD..origin/main` muestra commits, `git pull --rebase` antes del push y volver a correr la suite.

- [ ] **Step 8: Confirmar producción** — esperar el deploy y comparar bytes:

```bash
for f in autodiagnostico.html plan-evaluacion.html encuesta-satisfaccion.html evidencias.html admin-candidatos.html admin-data.js; do curl -s "https://sepconocer.paideiatech.com/$f?cb=$RANDOM" -o /tmp/pf && cmp -s /tmp/pf $f && echo "idéntico: $f" || echo "DIFERENTE: $f"; done
```

Expected: `idéntico` en los 6 (reintentar tras 15–60 s si aún no llega).
