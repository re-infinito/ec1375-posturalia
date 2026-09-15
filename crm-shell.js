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
