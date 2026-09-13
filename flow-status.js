/* =========================================================
   flow-status.js — fuente única de los 10 pasos reales del flujo de
   candidato, y de qué cuenta como "completo" en cada uno.

   Excepción deliberada a "páginas estáticas sin módulos compartidas"
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
