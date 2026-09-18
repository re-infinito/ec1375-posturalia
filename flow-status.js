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
    { id: 'reforzamiento', label: 'Reforzamiento', href: 'estudio.html?modo=reforzamiento' },
    { id: 'alineacion', label: 'Alineación', href: 'alineacion.html' },
    { id: 'plan-evaluacion', label: 'Plan de Evaluación', href: 'plan-evaluacion.html' },
    { id: 'documentos-sesion', label: 'Documentos de Sesión', href: 'documentos-sesion.html' },
    { id: 'practica', label: 'Práctica', href: 'estudio.html?modo=practica' },
    { id: 'examen', label: 'Examen de Conocimientos', href: 'estudio.html?modo=examen' },
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

/* Para la cuenta bypass, Supabase NUNCA recibe el progreso (Auth._flushPendingSync
   lo suprime a propósito), así que su "fila" se arma desde localStorage con
   las mismas claves que cada página guarda — de otro modo ningún paso
   posterior al Autodiagnóstico se marcaría como hecho para esa cuenta. */
var _BYPASS_ROW_KEYS = {
    autodiagnostico_data: 'autodiagnosticoData',
    plan_evaluacion_data: 'planEvaluacionData',
    documentos_sesion_data: 'documentosSesionData',
    encuesta_data: 'encuestaSatisfaccionData',
    evidencias_data: 'evidenciasData',
    examen_conocimientos_data: 'examenConocimientosData',
    ruta_estudio_data: 'ec1375-state'
};

const FlowStatus = {
    FLOW_STEPS_META: FLOW_STEPS_META,

    /* Fila del candidato: la real de Supabase, o la compuesta desde
       localStorage para la cuenta bypass (ver _BYPASS_ROW_KEYS). */
    async getRow() {
        var session = await Auth.getSession();
        if (!session) return null;
        if (!(await Auth.isBypassSession())) return Auth.pullMyRow();
        var row = { user_id: session.user.id, nombre: null, curp: null, updated_at: new Date().toISOString() };
        Object.keys(_BYPASS_ROW_KEYS).forEach(function (col) {
            try { row[col] = JSON.parse(localStorage.getItem(_BYPASS_ROW_KEYS[col]) || 'null'); } catch (e) { row[col] = null; }
        });
        var pd = row.autodiagnostico_data && row.autodiagnostico_data.personalData;
        if (pd) { row.nombre = pd.nombre || null; row.curp = pd.curp || null; }
        return row;
    },

    /* Función PURA (sin Auth, sin red): calcula los 10 pasos a partir de
       una fila y sus autorizaciones. La usa getSteps() para la sesión actual
       y admin-data.js (CRM del equipo) por cada candidato con su fila del
       RPC admin_lista_candidatos — una sola lógica de "qué cuenta como
       completo", nunca una copia. Cada condición reutiliza el MISMO gate
       que la página siguiente ya usa para dejar pasar.
       ctx = { row, localAuto, alineacionAuth, entregaAuth, esBypass } */
    computeSteps(ctx) {
        ctx = ctx || {};
        var row = ctx.row || null;
        /* Autodiagnóstico: en el navegador del candidato manda localStorage
           (ctx.localAuto); para otro candidato (admin) se usa su columna
           autodiagnostico_data, que guarda lo mismo (answers + ndaAccepted). */
        var localAuto = ctx.localAuto || (row && row.autodiagnostico_data) || null;
        var rutaEstudio = (row && row.ruta_estudio_data) || null;
        var examen = (row && row.examen_conocimientos_data) || null;
        var alineacionAuth = !!ctx.alineacionAuth;
        /* Entrega nunca se marca "done" para la cuenta bypass, sin importar
           lo que diga la autorización real — es dinero real y una decisión
           real del evaluador. */
        var entregaAuth = !!ctx.entregaAuth && !ctx.esBypass;

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

        /* Entrega es un caso especial siempre: nunca es "current" (depende
           de que el equipo la autorice a mano tras revisar la evaluación),
           y su reason siempre es 'esperando_evaluador' cuando no está done. */
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

        /* Cuenta bypass (videos/demos): ningún paso queda bloqueado. */
        if (ctx.esBypass) {
            steps.forEach(function (s) { s.locked = false; if (s.id !== 'entrega') s.reason = null; });
        }
        return steps;
    },

    async getSteps() {
        var session = await Auth.getSession();
        var email = session && session.user && session.user.email;
        var esBypass = !!email && await Auth.isBypassSession();
        var row = email ? await FlowStatus.getRow() : null;

        var localAuto = null;
        try { localAuto = JSON.parse(localStorage.getItem('autodiagnosticoData') || 'null'); } catch (e) { /* ignore */ }

        var alineacionAuth = false;
        var entregaAuth = false;
        if (email) {
            alineacionAuth = await Auth.isPhaseAuthorized(email, 'alineacion');
            entregaAuth = await Auth.isPhaseAuthorized(email, 'entrega');
        }
        return FlowStatus.computeSteps({ row: row, localAuto: localAuto, alineacionAuth: alineacionAuth, entregaAuth: entregaAuth, esBypass: esBypass });
    },

    /* Botón "siguiente paso" — SIEMPRE calculado del estado real de
       `steps`, nunca un href escrito a mano por página. `container` es
       el elemento donde inyectar el bloque (la página decide dónde). */
    renderNextStepCTA(steps, currentPageId, container) {
        /* La página pudo volver a pintarse mientras se calculaban los pasos
           (p. ej. "Editar mis respuestas"): sin contenedor no hay nada que hacer. */
        if (!container) return;
        var idx = steps.findIndex(function (s) { return s.id === currentPageId; });
        var next = idx >= 0 && idx < steps.length - 1 ? steps[idx + 1] : null;
        if (!next) { container.innerHTML = ''; return; }

        if (next.locked && next.reason === 'esperando_evaluador') {
            container.innerHTML =
                '<div class="card" style="text-align:center;margin-top:20px;">' +
                '<p style="color:var(--text,#D0D0D0);margin-bottom:14px;">🔒 Esperando el resultado de tu evaluador — te contactaremos en cuanto esté listo.</p>' +
                '<a href="panel.html" class="btn btn-secondary btn-full" style="display:block;text-decoration:none;">Sigue tu proceso aquí →</a>' +
                '</div>';
            return;
        }

        container.innerHTML =
            '<div class="card" style="text-align:center;margin-top:20px;">' +
            '<a href="' + next.href + '" class="btn btn-primary btn-full" style="display:block;text-decoration:none;">Siguiente: ' + next.label + ' →</a>' +
            '</div>';
    }
};

if (typeof window !== 'undefined') window.FlowStatus = FlowStatus;
if (typeof module !== 'undefined' && module.exports) module.exports = FlowStatus;
