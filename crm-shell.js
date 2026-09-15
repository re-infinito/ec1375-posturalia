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
        { id: 'admin-panel', label: 'Panel del equipo', href: 'admin-crm.html', ico: '🏠' },
        { id: 'admin-candidatos', label: 'Candidatos', href: 'admin-candidatos.html', ico: '👥' },
        { id: 'admin-precios', label: 'Precios y pagos', href: 'admin-precios.html', ico: '💰' },
        { id: 'admin-sesiones', label: 'Sesiones de Alineación', href: 'admin-sesiones.html', ico: '🎓' },
        { id: 'admin-kpis', label: 'KPIs', href: 'admin-kpis.html', ico: '📊' },
        { id: 'admin-utilidades', label: 'Utilidades', href: 'admin-utilidades.html', ico: '💵' }
    ];

    var ICONOS = {
        'panel': '🏠', 'autodiagnostico': '📋', 'reforzamiento': '📚', 'alineacion': '🎓', 'plan-evaluacion': '📅',
        'documentos-sesion': '🗂️', 'practica': '🧪', 'examen': '🧠', 'encuesta': '📝', 'evidencias': '📤', 'entrega': '🏆'
    };

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

    function adminSidebarHtml(currentPageId) {
        return '' +
            '<div class="crm-brand"><img src="' + LOGO_SRC + '" alt="Paideia Tech"><div>' +
                '<strong>Paideia Tech</strong><small>Panel del equipo</small><span class="crm-pill">EQUIPO · EC1375</span></div></div>' +
            '<nav class="crm-nav" aria-label="Módulos de administración">' +
                ADMIN_NAV.map(function (n) {
                    var cls = 'crm-item' + (n.id === currentPageId ? ' is-current is-here' : '');
                    return '<a class="' + cls + '" href="' + n.href + '" title="' + escapeHtml(n.label) + '"><span class="crm-ico">' + n.ico + '</span><span class="crm-label">' + escapeHtml(n.label) + '</span></a>';
                }).join('') +
                '<div class="crm-nav-label">Vistas</div>' +
                '<a class="crm-item" href="panel.html" title="Ver como candidato"><span class="crm-ico">🎓</span><span class="crm-label">Ver como candidato</span></a>' +
            '</nav>' +
            '<div class="crm-user">' +
                '<div class="crm-user-row"><span class="crm-avatar" data-crm-avatar>?</span><div style="min-width:0;">' +
                    '<div class="crm-user-name" data-crm-name>Administrador</div><div class="crm-user-email" data-crm-email></div></div></div>' +
                '<button type="button" class="crm-sidebtn" data-crm-theme-btn="text">🌙 Modo oscuro</button>' +
                '<button type="button" class="crm-sidebtn is-logout" data-crm-logout>⎋ Cerrar sesión</button>' +
            '</div>' +
            '<div class="crm-foot"><span>🔐 Acceso solo administradores</span><span>🏛️ Certificación oficial SEP-CONOCER</span></div>';
    }

    function sidebarHtml(steps, currentPageId, mode, degraded) {
        if (mode === 'admin') return adminSidebarHtml(currentPageId);
        var panelCls = 'crm-item' + (currentPageId === 'panel' ? ' is-current is-here' : '');
        return '' +
            '<div class="crm-brand"><img src="' + LOGO_SRC + '" alt="Paideia Tech"><div>' +
                '<strong>Paideia Tech</strong><small>Certificación EC1375</small><span class="crm-pill">SEP · CONOCER</span></div></div>' +
            (mode === 'rail' ? '<button type="button" class="crm-iconbtn crm-expand" data-crm-expand aria-label="Expandir menú">☰</button>' : '') +
            (degraded ? '<div class="crm-degraded">No pudimos cargar tu progreso · <a href="#" data-crm-retry>reintentar</a></div>' : '') +
            '<nav class="crm-nav" aria-label="Pasos de tu certificación">' +
                '<a class="' + panelCls + '" href="panel.html" title="Panel"><span class="crm-ico">' + ICONOS.panel + '</span><span class="crm-label">Panel</span></a>' +
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
            var title = opts.title || (topBarInner ? topBarInner.textContent.trim().split('\n')[0].trim() : document.title);
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
                btn.textContent = '🔄 Reiniciar demo';
                btn.title = 'Vuelve a sembrar todos los datos ficticios desde cero (solo cuenta de pruebas)';
                btn.addEventListener('click', function () { Auth.resetAdminDownstreamProgress(); });
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

    /* ---------- módulo ---------- */

    var CrmShell = {
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
