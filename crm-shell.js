/* =========================================================
   crm-shell.js — shell CRM del candidato (sidebar + encabezado + tema)
   y panel de control de panel.html.

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

    /* Set de iconos SVG monocromos (línea 1.8px, estilo Feather) — reemplaza
       los emojis del shell/panel/admin: se ven igual en todos los sistemas y
       heredan el color del texto. CrmShell.icon('home', 18) → <svg>. */
    var ICON_PATHS = {
        home: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 22V12h6v10',
        clipboard: 'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2 M9 2h6a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z',
        book: 'M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z',
        award: 'M12 15a7 7 0 1 0 0-14 7 7 0 0 0 0 14z M8.21 13.89L7 23l5-3 5 3-1.21-9.12',
        calendar: 'M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z M16 2v4 M8 2v4 M3 10h18',
        folder: 'M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z',
        activity: 'M22 12h-4l-3 9L9 3l-3 9H2',
        'check-square': 'M9 11l3 3L22 4 M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11',
        message: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
        upload: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M17 8l-5-5-5 5 M12 3v12',
        file: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8',
        layout: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z M3 9h18 M9 21V9',
        users: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0z M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75',
        dollar: 'M12 1v22 M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6',
        video: 'M23 7l-7 5 7 5V7z M3 5h11a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z',
        chart: 'M18 20V10 M12 20V4 M6 20v-6',
        card: 'M3 4h18a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z M1 10h22',
        pie: 'M21.21 15.89A10 10 0 1 1 8 2.83 M22 12A10 10 0 0 0 12 2v10z',
        map: 'M1 6v16l7-4 8 4 7-4V2l-7 4-8-4z M8 2v16 M16 6v16',
        bell: 'M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9 M13.73 21a2 2 0 0 1-3.46 0',
        sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z M12 1v2 M12 21v2 M4.22 4.22l1.42 1.42 M18.36 18.36l1.42 1.42 M1 12h2 M21 12h2 M4.22 19.78l1.42-1.42 M18.36 5.64l1.42-1.42',
        moon: 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z',
        menu: 'M3 12h18 M3 6h18 M3 18h18',
        x: 'M18 6L6 18 M6 6l12 12',
        logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4 M16 17l5-5-5-5 M21 12H9',
        refresh: 'M23 4v6h-6 M1 20v-6h6 M3.51 9a9 9 0 0 1 14.85-3.36L23 10 M1 14l4.64 4.36A9 9 0 0 0 20.49 15',
        check: 'M20 6L9 17l-5-5',
        lock: 'M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z M7 11V7a5 5 0 0 1 10 0v4',
        play: 'M5 3l14 9-14 9V3z',
        grid: 'M3 3h7v7H3z M14 3h7v7h-7z M14 14h7v7h-7z M3 14h7v7H3z',
        shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
        cloud: 'M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z',
        alert: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 8v4 M12 16h.01',
        external: 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6 M15 3h6v6 M10 14L21 3',
        search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z M21 21l-4.35-4.35',
        download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M7 10l5 5 5-5 M12 15V3',
        trash: 'M3 6h18 M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6 M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2',
        eye: 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
        clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 6v6l4 2',
        inbox: 'M22 12h-6l-2 3h-4l-2-3H2 M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z',
        arrow: 'M5 12h14 M12 5l7 7-7 7',
        sliders: 'M4 21v-7 M4 10V3 M12 21v-9 M12 8V3 M20 21v-5 M20 12V3 M1 14h6 M9 8h6 M17 16h6',
        building: 'M3 21h18 M5 21V7l8-4v18 M19 21V11l-6-4 M9 9v.01 M9 12v.01 M9 15v.01 M9 18v.01'
    };
    function icon(name, size) {
        var d = ICON_PATHS[name] || ICON_PATHS.grid;
        var sz = size || 18;
        return '<svg class="crm-svg" viewBox="0 0 24 24" width="' + sz + '" height="' + sz + '" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + d + '"/></svg>';
    }

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

    /* Navegación del CRM del equipo (mode: 'admin'). Sin estados de paso. */
    var ADMIN_NAV = [
        { id: 'admin-panel', label: 'Panel del equipo', href: 'admin-crm.html', ico: 'layout' },
        { id: 'admin-candidatos', label: 'Candidatos', href: 'admin-candidatos.html', ico: 'users' },
        { id: 'admin-precios', label: 'Precios y pagos', href: 'admin-precios.html', ico: 'dollar' },
        { id: 'admin-sesiones', label: 'Sesiones de Alineación', href: 'admin-sesiones.html', ico: 'video' },
        { id: 'admin-kpis', label: 'KPIs', href: 'admin-kpis.html', ico: 'chart' },
        { id: 'admin-utilidades', label: 'Utilidades', href: 'admin-utilidades.html', ico: 'card' }
    ];

    var ICONOS = {
        'panel': 'home', 'autodiagnostico': 'clipboard', 'reforzamiento': 'book', 'alineacion': 'award', 'plan-evaluacion': 'calendar',
        'documentos-sesion': 'folder', 'practica': 'activity', 'examen': 'check-square', 'encuesta': 'message', 'evidencias': 'upload', 'entrega': 'award'
    };

    /* ---------- tema ---------- */

    /* Los mismos 9 tokens que todas las páginas del flujo definen en :root
       (valores oscuros = los actuales, sin cambio) + --border/--surface-2.
       html[data-theme] (0,1,1) le gana al :root (0,1,0) de cada página. */
    var THEME_CSS =
        'html[data-theme="light"]{--dark:#f4f6fb;--dark-light:#ffffff;--primary:#0070e0;--primary-light:#0088FF;' +
        '--accent:#b8860b;--text:#2f3852;--text-bright:#0f1428;--danger:#c81e1e;--success:#0a8a50;' +
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
            var ic = icon(t === 'dark' ? 'sun' : 'moon', 18);
            b.innerHTML = b.dataset.crmThemeBtn === 'icon' ? ic : ic + '<span>' + (t === 'dark' ? 'Modo claro' : 'Modo oscuro') + '</span>';
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
    var SCRIPT_PAGE = '';
    if (typeof document !== 'undefined') {
        var cs = document.currentScript;
        if (cs && cs.dataset && cs.dataset.crmMode === 'rail') SCRIPT_MODE = 'rail';
        if (cs && cs.dataset && cs.dataset.crmMode === 'admin') SCRIPT_MODE = 'admin';
        /* Auto-montaje: <script src="crm-shell.js" data-crm-page="alineacion">.
           Al terminar de cargar la página, si hay sesión, monta el shell en
           CUALQUIER pantalla de esa página (gate de fase, wizard, resultado)
           — no depende de dónde la página llame a mount(). mount() es
           idempotente, así que las llamadas explícitas siguen siendo
           inofensivas. */
        if (cs && cs.dataset && cs.dataset.crmPage) SCRIPT_PAGE = cs.dataset.crmPage;
        if (SCRIPT_PAGE) window.addEventListener('load', function () { autoMount(SCRIPT_PAGE, SCRIPT_MODE); });
        if (SCRIPT_MODE !== 'rail') {
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
        /* PWA (proyecto 4): manifest + service worker (solo cachea la app,
           nunca el contenido protegido) + botón "Instalar aplicación". */
        var man = document.createElement('link'); man.rel = 'manifest'; man.href = '/manifest.json'; document.head.appendChild(man);
        var tc = document.createElement('meta'); tc.name = 'theme-color'; tc.content = '#0a2a6b'; document.head.appendChild(tc);
        if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
            window.addEventListener('load', function () { navigator.serviceWorker.register('/sw.js').catch(function (e) { console.warn('SW no registrado:', e); }); });
        }
        window.addEventListener('beforeinstallprompt', function (ev) {
            ev.preventDefault();
            window.__crmInstallPrompt = ev;
            Array.prototype.forEach.call(document.querySelectorAll('[data-crm-install]'), function (b) { b.hidden = false; });
        });
        window.addEventListener('appinstalled', function () {
            window.__crmInstallPrompt = null;
            Array.prototype.forEach.call(document.querySelectorAll('[data-crm-install]'), function (b) { b.hidden = true; });
        });
    }

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

    /* ---------- DOM: sidebar, encabezado, mount ---------- */

    function stepsSinEstado() {
        var meta = (typeof FLOW_STEPS_META !== 'undefined') ? FLOW_STEPS_META : [];
        return meta.map(function (m) { return { id: m.id, label: m.label, href: m.href, done: false, current: false, locked: false, reason: null }; });
    }

    function itemHtml(step, currentPageId, degraded) {
        var ico = icon(ICONOS[step.id] || 'grid');
        var cls = 'crm-item';
        var isHere = step.id === currentPageId;
        if (isHere) cls += ' is-here';
        var title = '';
        if (!degraded) {
            if (step.done) { cls += ' is-done'; ico = icon('check'); }
            else if (step.current) cls += ' is-current';
            else if (step.locked) {
                cls += ' is-locked'; ico = icon('lock');
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

    function adminSidebarHtml(currentPageId) {
        return '' +
            '<div class="crm-brand"><img src="' + LOGO_SRC + '" alt="Paideia Tech"><div>' +
                '<strong>Paideia Tech</strong><small>Panel del equipo</small><span class="crm-pill">EQUIPO · EC1375</span></div></div>' +
            '<nav class="crm-nav" aria-label="Módulos de administración">' +
                ADMIN_NAV.map(function (n) {
                    var cls = 'crm-item' + (n.id === currentPageId ? ' is-current is-here' : '');
                    return '<a class="' + cls + '" href="' + n.href + '" title="' + escapeHtml(n.label) + '"><span class="crm-ico">' + icon(n.ico) + '</span><span class="crm-label">' + escapeHtml(n.label) + '</span></a>';
                }).join('') +
                '<div class="crm-nav-label">Vistas</div>' +
                '<a class="crm-item" href="panel.html" title="Ver como candidato"><span class="crm-ico">' + icon('eye') + '</span><span class="crm-label">Ver como candidato</span></a>' +
            '</nav>' +
            '<div class="crm-user">' +
                '<div class="crm-user-row"><span class="crm-avatar" data-crm-avatar>?</span><div style="min-width:0;">' +
                    '<div class="crm-user-name" data-crm-name>Administrador</div><div class="crm-user-email" data-crm-email></div></div></div>' +
                '<button type="button" class="crm-sidebtn crm-sidebtn-install" data-crm-install' + (window.__crmInstallPrompt ? '' : ' hidden') + '>' + icon('download') + '<span>Instalar aplicación</span></button>' +
                '<button type="button" class="crm-sidebtn" data-crm-theme-btn="text">' + icon('moon') + '<span>Modo oscuro</span></button>' +
                '<button type="button" class="crm-sidebtn is-logout" data-crm-logout>' + icon('logout') + '<span>Cerrar sesión</span></button>' +
            '</div>' +
            '<div class="crm-foot"><span>' + icon('shield', 14) + ' Acceso solo administradores</span><span>' + icon('building', 14) + ' Certificación oficial SEP-CONOCER</span></div>';
    }

    function sidebarHtml(steps, currentPageId, mode, degraded) {
        if (mode === 'admin') return adminSidebarHtml(currentPageId);
        var panelCls = 'crm-item' + (currentPageId === 'panel' ? ' is-current is-here' : '');
        return '' +
            '<div class="crm-brand"><img src="' + LOGO_SRC + '" alt="Paideia Tech"><div>' +
                '<strong>Paideia Tech</strong><small>Certificación EC1375</small><span class="crm-pill">SEP · CONOCER</span></div></div>' +
            (mode === 'rail' ? '<button type="button" class="crm-iconbtn crm-expand" data-crm-expand aria-label="Expandir menú">' + icon('menu') + '</button>' : '') +
            (degraded ? '<div class="crm-degraded">No pudimos cargar tu progreso · <a href="#" data-crm-retry>reintentar</a></div>' : '') +
            '<nav class="crm-nav" aria-label="Pasos de tu certificación">' +
                '<a class="' + panelCls + '" href="panel.html" title="Panel"><span class="crm-ico">' + icon(ICONOS.panel) + '</span><span class="crm-label">Panel</span></a>' +
                steps.map(function (s) { return itemHtml(s, currentPageId, degraded); }).join('') +
                '<div class="crm-nav-label">Recursos</div>' +
                '<a class="crm-item' + (currentPageId === 'biblioteca' ? ' is-current is-here' : '') + '" href="estudio.html?modo=biblioteca" title="Biblioteca"><span class="crm-ico">' + icon('book') + '</span><span class="crm-label">Biblioteca</span></a>' +
                '<a class="crm-item" href="guion-maestro.html" title="Guion Maestro"><span class="crm-ico">' + icon('file') + '</span><span class="crm-label">Guion Maestro</span></a>' +
                '<a class="crm-item' + (currentPageId === 'recursos' ? ' is-current is-here' : '') + '" href="recursos.html" title="Tutoriales y toolkit"><span class="crm-ico">' + icon('download') + '</span><span class="crm-label">Tutoriales y toolkit</span></a>' +
            '</nav>' +
            '<div class="crm-user">' +
                '<div class="crm-user-row"><span class="crm-avatar" data-crm-avatar>?</span><div style="min-width:0;">' +
                    '<div class="crm-user-name" data-crm-name>Cargando…</div><div class="crm-user-email" data-crm-email></div></div></div>' +
                '<button type="button" class="crm-sidebtn crm-sidebtn-install" data-crm-install' + (window.__crmInstallPrompt ? '' : ' hidden') + '>' + icon('download') + '<span>Instalar aplicación</span></button>' +
                '<button type="button" class="crm-sidebtn" data-crm-theme-btn="text">' + icon('moon') + '<span>Modo oscuro</span></button>' +
                '<button type="button" class="crm-sidebtn is-logout" data-crm-logout>' + icon('logout') + '<span>Cerrar sesión</span></button>' +
            '</div>' +
            '<div class="crm-foot"><span>' + icon('folder', 14) + ' Expediente digital</span><span>' + icon('shield', 14) + ' Datos protegidos</span><span>' + icon('building', 14) + ' Certificación oficial SEP-CONOCER</span></div>';
    }

    function headerHtml(title) {
        return '' +
            '<button type="button" class="crm-iconbtn crm-hamburger" data-crm-open aria-label="Abrir menú">' + icon('menu') + '</button>' +
            '<div class="crm-topbar-titles"><div class="crm-topbar-title">' + escapeHtml(title) + '</div><div class="crm-topbar-sub" data-crm-sub hidden></div></div>' +
            '<button type="button" class="crm-iconbtn" data-crm-theme-btn="icon" title="Cambiar tema">' + icon('moon') + '</button>' +
            '<div class="crm-userchip"><span class="crm-avatar" data-crm-avatar>?</span><span class="crm-user-short" data-crm-name-short></span></div>';
    }

    /* Quita emojis y espacios sobrantes del título del top-bar de la página. */
    function limpiarTitulo(txt) {
        var lineas = String(txt || '').split('\n').map(function (l) { return l.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '').replace(/\s+/g, ' ').trim(); }).filter(Boolean);
        return lineas[0] || '';
    }

    /* Refleja en el encabezado del shell el paso y el avance del wizard. */
    function espejarTopBar(header) {
        var sub = header.querySelector('[data-crm-sub]');
        var bar = header.querySelector('[data-crm-progress]');
        var stepEl = document.getElementById('topBarStep') || document.getElementById('topBarProgress');
        var fillEl = document.getElementById('progressBarFill') || document.getElementById('progressFill');
        var pintar = function () {
            var txt = stepEl ? stepEl.textContent.replace(/\s+/g, ' ').trim() : '';
            if (sub) { sub.textContent = txt; sub.hidden = !txt; }
            var w = fillEl ? (fillEl.style.width || '') : '';
            if (!w && txt) {
                var m = txt.match(/(\d+)\s*(?:\/|de)\s*(\d+)/);
                if (m && Number(m[2]) > 0) w = Math.round((Number(m[1]) / Number(m[2])) * 100) + '%';
            }
            if (bar) { bar.style.width = w || '0%'; bar.parentNode.hidden = !w; }
        };
        pintar();
        var obs = new MutationObserver(pintar);
        if (stepEl) obs.observe(stepEl, { childList: true, characterData: true, subtree: true });
        if (fillEl) obs.observe(fillEl, { attributes: true, attributeFilter: ['style'] });
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
        var esAdminShell = shell.classList.contains('crm-mode-admin');
        Array.prototype.forEach.call(shell.querySelectorAll('[data-crm-name]'), function (el) { el.textContent = nombre || (email ? email.split('@')[0] : (esAdminShell ? 'Administrador' : 'Candidato/a')); });
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

    function autoMount(pageId, mode) {
        if (document.getElementById('crmShell')) return;
        if (typeof Auth === 'undefined') return;
        if (mode === 'admin') {
            /* Solo con sesión de un correo en la tabla admins. */
            Auth.getSession().then(function (session) {
                if (!session || !session.user) return null;
                return Auth.isAdmin(session.user.email).then(function (es) {
                    if (es) mount({ mode: 'admin', currentPageId: pageId });
                });
            }).catch(function () { /* sin sesión: la página muestra su gate */ });
            return;
        }
        if (typeof FlowStatus === 'undefined') return;
        Auth.getSession().then(function (session) {
            if (!session) return null;
            return FlowStatus.getSteps().then(function (steps) {
                mount({ currentPageId: pageId, steps: steps, mode: mode });
            }).catch(function (e) {
                console.warn('CRM shell: no se pudo calcular el progreso —', e);
                mount({ currentPageId: pageId, steps: [], degraded: true, mode: mode });
            });
        }).catch(function () { /* sin sesión: la página muestra su gate */ });
    }

    function mount(opts) {
        if (typeof document === 'undefined') return null;
        opts = opts || {};
        if (document.getElementById('crmShell')) return document.getElementById('crmShell');

        var mode = opts.mode === 'rail' ? 'rail' : opts.mode === 'admin' ? 'admin' : 'full';
        var degraded = mode !== 'admin' && (!!opts.degraded || !Array.isArray(opts.steps) || opts.steps.length === 0);
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

        if (mode !== 'rail') {
            var main = document.createElement('main');
            main.className = 'crm-main';
            var topBarInner = document.querySelector('.top-bar .top-bar-inner');
            var title = opts.title || (topBarInner ? limpiarTitulo(topBarInner.textContent) : document.title);
            var header = document.createElement('header');
            header.className = 'crm-topbar';
            header.innerHTML = headerHtml(title);
            main.appendChild(header);
            /* Encabezado único: el .top-bar propio de la página (y su barra de
               progreso hermana, en documentos-sesion) se ocultan; su paso
               actual (#topBarStep / #topBarProgress) y su avance
               (#progressBarFill / #progressFill) se reflejan en el encabezado
               del shell — una sola franja arriba. */
            var pageTopBar = document.querySelector('.top-bar');
            if (pageTopBar) {
                pageTopBar.setAttribute('data-crm-hidden', '');
                var hermana = pageTopBar.nextElementSibling;
                if (hermana && hermana.classList.contains('progress-bar')) hermana.setAttribute('data-crm-hidden', '');
                var prog = document.createElement('div');
                prog.className = 'crm-topbar-progress';
                prog.innerHTML = '<span data-crm-progress style="width:0%"></span>';
                header.appendChild(prog);
                espejarTopBar(header);
            }
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
            fab.innerHTML = icon('menu', 22);
            fab.setAttribute('data-crm-open', '');
            shell.appendChild(fab);
        }

        document.body.appendChild(shell);

        /* interacción */
        shell.addEventListener('click', function (ev) {
            var t = ev.target.closest ? ev.target.closest('[data-crm-open],[data-crm-expand],[data-crm-theme-btn],[data-crm-install],[data-crm-logout],[data-crm-retry],.crm-backdrop,.crm-nav a') : null;
            if (!t) return;
            if (t.hasAttribute('data-crm-open') || t.hasAttribute('data-crm-expand')) { setOpen(shell, !shell.classList.contains('is-open')); return; }
            if (t.classList.contains('crm-backdrop')) { setOpen(shell, false); return; }
            if (t.hasAttribute('data-crm-theme-btn')) { toggleTheme(); return; }
            if (t.hasAttribute('data-crm-install')) {
                var pr = window.__crmInstallPrompt;
                if (pr) { pr.prompt(); pr.userChoice.then(function () { window.__crmInstallPrompt = null; t.hidden = true; }); }
                return;
            }
            if (t.hasAttribute('data-crm-retry')) { ev.preventDefault(); location.reload(); return; }
            if (t.hasAttribute('data-crm-logout')) {
                ev.preventDefault();
                var p = (typeof Auth !== 'undefined' && Auth.signOut) ? Auth.signOut() : Promise.resolve();
                Promise.resolve(p).then(function () { location.href = 'panel.html'; });
                return;
            }
            if (t.matches('.crm-nav a')) setOpen(shell, false);
        });
        document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') setOpen(shell, false); });

        syncOffset();
        window.addEventListener('resize', syncOffset);
        /* En rail (ruta-estudio/ruta-alineacion) no se toca data-theme: esas
           páginas tienen sus propios tokens y siempre son oscuras. */
        if (mode !== 'rail') applyTheme();

        /* usuario y badges: la fila puede venir en opts.row; si no, se consulta */
        var rowPromise = (opts.row || mode === 'admin') ? Promise.resolve(opts.row || null)
            : ((typeof FlowStatus !== 'undefined' && FlowStatus.getRow) ? FlowStatus.getRow().catch(function () { return null; })
            : (typeof Auth !== 'undefined' && Auth.pullMyRow) ? Auth.pullMyRow().catch(function () { return null; }) : Promise.resolve(null));
        rellenarUsuario(shell, opts.row || null);
        if (mode !== 'admin') {
            rowPromise.then(function (row) {
                rellenarUsuario(shell, row);
                if (!degraded) rellenarBadges(shell, steps, row);
            });
        }

        /* Cuenta bypass: botón "Reset demo" (antes vivía en la barra fija de
           admin, retirada el 15 sep — este sidebar la sustituye). */
        if (mode !== 'admin' && typeof Auth !== 'undefined' && typeof Auth.isBypassSession === 'function') {
            Promise.resolve(Auth.isBypassSession()).then(function (es) {
                if (!es) return;
                var user = shell.querySelector('.crm-user');
                if (!user || shell.querySelector('[data-crm-reset]')) return;
                var btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'crm-sidebtn is-logout';
                btn.setAttribute('data-crm-reset', '');
                btn.style.borderColor = '#FF3333';
                btn.style.color = '#FF3333';
                btn.innerHTML = icon('refresh') + '<span>Reiniciar demo</span>';
                btn.title = 'Vuelve a sembrar todos los datos ficticios desde cero (solo cuenta de pruebas)';
                btn.addEventListener('click', function () { Auth.resetAdminDownstreamProgress(); });
                user.insertBefore(btn, user.querySelector('[data-crm-logout]'));
            }).catch(function () { /* ignore */ });
        }

        /* Admin viendo el sitio "como candidato" (link "Ver como candidato"
           del sidebar admin, que solo navega a panel.html reusando la MISMA
           sesión): sin esto no había forma de regresar al panel del equipo
           salvo cerrar sesión y volver a autenticarse como admin desde cero. */
        if (mode !== 'admin' && typeof Auth !== 'undefined' && typeof Auth.isAdmin === 'function') {
            var emailActual = (Auth._session && Auth._session.user && Auth._session.user.email) || '';
            (emailActual ? Auth.isAdmin(emailActual) : Promise.resolve(false)).then(function (esAdmin) {
                if (!esAdmin) return;
                var user = shell.querySelector('.crm-user');
                if (!user || shell.querySelector('[data-crm-admin-return]')) return;
                var btn = document.createElement('a');
                btn.href = 'admin-crm.html';
                btn.className = 'crm-sidebtn';
                btn.setAttribute('data-crm-admin-return', '');
                btn.innerHTML = icon('shield') + '<span>Volver al panel de administrador</span>';
                btn.title = 'Estás viendo el sitio como candidato con tu sesión de administrador — regresa al panel del equipo.';
                user.insertBefore(btn, user.querySelector('[data-crm-logout]'));
            }).catch(function () { /* ignore */ });
        }

        return shell;
    }

    /* ---------- panel del candidato (panel.html) ---------- */

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
        return estado === 'subido' ? '<span class="crm-st crm-ok" title="Subido a tu expediente">' + icon('check', 16) + '</span>'
             : estado === 'descargado' ? '<span class="crm-st" title="Descargado (pendiente de subir)">' + icon('download', 16) + '</span>'
             : estado === 'formulario' ? '<span class="crm-st" title="Enviado por formulario alterno">' + icon('inbox', 16) + '</span>'
             : '<span class="crm-st crm-muted" title="Pendiente">' + icon('clock', 16) + '</span>';
    }

    function card(icono, titulo, cuerpo, extraH) {
        return '<section class="crm-card"><div class="crm-card-h"><span class="crm-stat-ico">' + (ICON_PATHS[icono] ? icon(icono, 18) : icono) + '</span>' +
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
            ? '<a class="crm-btn crm-btn-cta" href="' + escapeHtml(current.href) + '">Continuar: ' + escapeHtml(current.label) + icon('arrow', 16) + '</a>'
            : '<span class="crm-btn crm-btn-cta" aria-disabled="true">' + (certificado ? icon('award', 16) + 'Certificación completada' : icon('clock', 16) + 'Esperando a tu evaluador') + '</span>';
        var hero =
            '<div class="crm-hero">' +
              '<span class="crm-hero-badge">' + icon(certificado ? 'award' : 'activity', 14) + (certificado ? 'Certificado entregado' : 'Certificación en curso') + '</span>' +
              '<h1>Hola, ' + escapeHtml(nombre) + '</h1>' +
              '<div class="crm-hero-sub">Tu panel de certificación EC1375</div>' +
              '<div class="crm-hero-meta"><span>' + icon('shield', 14) + 'Datos protegidos</span><span>' + icon('cloud', 14) + 'Expediente en la nube</span>' +
                '<span>' + icon('refresh', 14) + (row && row.updated_at ? 'Sincronizado ' + tiempoRelativo(row.updated_at) : 'Sin datos sincronizados aún') + '</span></div>' +
              '<div class="crm-hero-actions">' + ctaHtml + '<a class="crm-btn crm-btn-ghost" href="#crmDocs">' + icon('file', 16) + 'Ver mis documentos</a></div>' +
              '<div class="crm-stats">' +
                '<div class="crm-stat"><span class="crm-stat-ico">' + icon('check-square', 20) + '</span><div><div class="crm-stat-num">' + done + ' / ' + steps.length + '</div><div class="crm-stat-lbl">Pasos completados</div></div></div>' +
                '<div class="crm-stat"><span class="crm-stat-ico">' + icon('file', 20) + '</span><div><div class="crm-stat-num">' + docs.completos + ' / ' + docs.total + '</div><div class="crm-stat-lbl">Documentos</div></div></div>' +
                '<div class="crm-stat"><span class="crm-stat-ico">' + icon('card', 20) + '</span><div><div class="crm-stat-num" style="font-size:1.1rem;">' + escapeHtml(faseMasAlta(fases)) + '</div><div class="crm-stat-lbl">Fase pagada</div></div></div>' +
                '<div class="crm-stat"><span class="crm-stat-ico">' + icon('video', 20) + '</span><div><div class="crm-stat-num" style="font-size:1.1rem;">' +
                    (!inscripcionesOk ? '—' : proxima ? escapeHtml(new Date(fechaSesion(proxima.sesion)).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', timeZone: 'America/Mexico_City' })) : 'Sin reservar') +
                    '</div><div class="crm-stat-lbl">Próxima sesión</div></div></div>' +
              '</div>' +
            '</div>';

        /* 1. progreso */
        var progreso = card('pie', 'Tu progreso',
            '<div class="crm-donut">' + donutSvg(steps) +
            '<div class="crm-legend"><span style="--c:var(--success)">Completados · ' + done + '</span>' +
            '<span style="--c:var(--primary)">En curso · ' + (current ? 1 : 0) + '</span>' +
            '<span style="--c:var(--border)">Por desbloquear · ' + (steps.length - done - (current ? 1 : 0)) + '</span></div></div>');

        /* 2. ruta */
        var ruta = card('map', 'Ruta de certificación', '<ul class="crm-list">' + steps.map(function (s) {
            var ico = s.done ? icon('check', 16) : s.current ? icon('play', 16) : icon('lock', 16);
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
        var documentos = '<div id="crmDocs">' + card('file', 'Documentos del expediente', '<ul class="crm-list">' + docsHtml + '</ul>',
            '<span class="crm-count">' + docs.completos + ' / ' + docs.total + '</span>') + '</div>';

        /* 4. pagos */
        var primeraPendiente = null;
        FASES.forEach(function (f) { if (!primeraPendiente && !fases[f.id]) primeraPendiente = f; });
        var pagos = card('card', 'Pagos por fase', '<ul class="crm-list">' + FASES.map(function (f) {
            var pagada = !!fases[f.id];
            var accion = (!pagada && primeraPendiente && primeraPendiente.id === f.id && f.href) ? '<a href="' + f.href + '">Pagar</a>'
                       : pagada ? '<span class="crm-ok">Pagado</span>' : '<span class="crm-muted">Pendiente</span>';
            return '<li><span class="crm-st ' + (pagada ? 'crm-ok' : '') + '">' + (pagada ? icon('check', 16) : icon('clock', 16)) + '</span><span>' + escapeHtml(f.label) + ' <span class="crm-muted">· ' + f.pct + '</span></span><span class="crm-right">' + accion + '</span></li>';
        }).join('') + '</ul>');

        /* 5. sesión de alineación */
        var sesionBody;
        if (!inscripcionesOk) {
            sesionBody = '<p class="crm-empty">No pudimos cargar tu sesión. <a href="#" data-crm-retry-inscripciones style="color:var(--primary);font-weight:700;">Reintentar</a></p>';
        } else if (proxima) {
            var s = proxima.sesion;
            sesionBody = '<p class="crm-empty"><strong style="color:var(--text-bright);">' + escapeHtml(formatoSesion(s)) + '</strong>' +
                         (s.instructor_nombre ? '<div class="crm-muted">Con ' + escapeHtml(s.instructor_nombre) + '</div>' : '') + '</p>' +
                         (s.zoom_link ? '<a class="crm-btn crm-btn-cta" style="margin-top:8px;" href="' + escapeHtml(s.zoom_link) + '" target="_blank" rel="noopener">' + icon('video', 16) + 'Entrar a Zoom</a>' : '');
        } else if (fases.alineacion) {
            sesionBody = '<p class="crm-empty">Aún no has reservado tu sesión en vivo.</p><a class="crm-btn crm-btn-cta" style="margin-top:8px;" href="alineacion.html">' + icon('calendar', 16) + 'Reservar sesión</a>';
        } else {
            sesionBody = '<p class="crm-empty">La reserva de tu sesión en vivo se habilita al pagar la fase de Alineación.</p>';
        }
        var sesion = card('video', 'Sesión de Alineación', sesionBody);

        /* 6. atención */
        var items = itemsAtencion({ steps: steps, row: row, fases: fases, inscripcion: proxima, inscripcionesOk: inscripcionesOk });
        var atencion = card('bell', 'Requieren atención', items.length
            ? '<ul class="crm-list">' + items.map(function (it) {
                return '<li><span class="crm-st">' + icon(it.tipo === 'pago' ? 'card' : it.tipo === 'sesion' ? 'video' : 'file', 16) + '</span><a href="' + escapeHtml(it.href) + '">' + escapeHtml(it.texto) + '</a></li>';
              }).join('') + '</ul>'
            : '<p class="crm-empty crm-ok">Todo en orden</p>',
            '<span class="crm-count">' + items.length + '</span>');

        container.innerHTML = hero + '<div class="crm-grid">' + progreso + ruta + documentos + pagos + sesion + atencion + '</div>';

        var retry = container.querySelector('[data-crm-retry-inscripciones]');
        if (retry && typeof data.onRetryInscripciones === 'function') {
            retry.addEventListener('click', function (ev) { ev.preventDefault(); data.onRetryInscripciones(); });
        }
    }

    /* ---------- módulo ---------- */

    /* Esqueletos de carga (en vez de "Cargando…" en texto). tipo: 'panel' | 'table' | 'cards' */
    function skeleton(tipo) {
        var line = function (w, h) { return '<div class="crm-skel" style="width:' + (w || '100%') + ';height:' + (h || '14px') + ';"></div>'; };
        if (tipo === 'table') {
            return '<section class="crm-card">' + line('40%', '20px') + '<div style="height:12px"></div>' + [1,2,3,4,5,6].map(function () { return '<div style="display:flex;gap:12px;margin:10px 0;">' + line('30%') + line('10%') + line('15%') + line('20%') + line('15%') + '</div>'; }).join('') + '</section>';
        }
        var cardSk = '<section class="crm-card">' + line('50%', '20px') + '<div style="height:14px"></div>' + line('90%') + '<div style="height:8px"></div>' + line('70%') + '<div style="height:8px"></div>' + line('80%') + '</section>';
        if (tipo === 'cards') return '<div class="crm-grid">' + cardSk + cardSk + cardSk + cardSk + '</div>';
        return '<div class="crm-skel crm-skel-hero"></div><div class="crm-grid">' + cardSk + cardSk + cardSk + cardSk + '</div>';
    }

    /* Fecha y hora (17 sep, reporte de Fernando: "no despliega nada"). En
       Chrome de escritorio el calendario/reloj solo abría tocando el iconito
       de la orilla — que en tema claro ni se veía —, así que al tocar el campo
       parecía no pasar nada. Ahora cualquier clic en el campo lo abre, en
       todas las páginas que cargan el shell. */
    function abrirSelectorFechaHora(ev) {
        var el = ev.target;
        if (!el || el.tagName !== 'INPUT' || !/^(date|time|datetime-local|month|week)$/.test(el.type)) return;
        if (el.disabled || el.readOnly || typeof el.showPicker !== 'function') return;
        try { el.showPicker(); } catch (e) { /* sin soporte o bloqueado: queda el comportamiento nativo */ }
    }
    if (typeof document !== 'undefined') document.addEventListener('click', abrirSelectorFechaHora);

    var CrmShell = {
        icon: icon,
        skeleton: skeleton,
        _helpers: {
            escapeHtml: escapeHtml, estadoDocumento: estadoDocumento, contarDocumentos: contarDocumentos,
            pendientesDelPaso: pendientesDelPaso, faseMasAlta: faseMasAlta, tiempoRelativo: tiempoRelativo,
            iniciales: iniciales, proximaInscripcion: proximaInscripcion, formatoSesion: formatoSesion,
            itemsAtencion: itemsAtencion, fechaSesion: fechaSesion
        },
        DOC_GRUPOS: DOC_GRUPOS,
        FASES: FASES,
        ADMIN_NAV: ADMIN_NAV,
        applyTheme: applyTheme,
        toggleTheme: toggleTheme,
        mount: mount,
        renderDashboard: renderDashboard
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = CrmShell;
    if (typeof window !== 'undefined') window.CrmShell = CrmShell;
})();
