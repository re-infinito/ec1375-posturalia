/* =========================================================
   protect.js — disuasión de copia/captura del contenido del candidato.

   Honestidad técnica (acordado con Diego, 15 sep 2026): en la web NO es
   posible impedir screenshots (sistema operativo, cámara, extensiones) ni
   ocultar el código que el navegador descarga. Este módulo DISUADE y
   RASTREA: marca de agua con el correo del candidato y la fecha (si alguien
   filtra una captura, se sabe de quién salió), bloqueo de selección/copiar/
   arrastrar/clic derecho, atajos de DevTools/guardar/imprimir, y bloqueo de
   la vista de impresión. La protección real del contenido valioso es el
   proyecto 4 (contenido servido desde Supabase con RLS por fase pagada).

   Uso: <script src="protect.js"> DESPUÉS de auth.js. Atributos opcionales:
     data-protect-print="allow"  → permite imprimir (solo guion-maestro.html).
   Se activa solo con sesión iniciada y NO exenta. Exentos: la cuenta bypass
   (videos/demos) y cualquier correo en `admins` ("Ver como candidato").
   Forzar para probar: ?protect=1 en la URL (solo activa, nunca desactiva).
   Cargable en Node para probar los helpers puros (tests/protect.test.js).
========================================================= */
(function () {
    'use strict';

    var CANDIDATE_FLOW_BYPASS = 'paideia.tech@outlook.com';

    /* ---------- helpers puros ---------- */

    function escapeXml(s) {
        return String(s === null || s === undefined ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    /* Decide si se activa la protección. `force` (?protect=1) solo puede
       activar, nunca desactivar una protección que ya aplicaría. */
    function shouldActivate(ctx) {
        ctx = ctx || {};
        if (!ctx.session) return false;
        if (ctx.force) return true;
        if (ctx.isBypass) return false;
        if (ctx.isAdmin) return false;
        return true;
    }

    /* Mosaico SVG (data URI) con "correo · fecha hora", rotado, para usarlo
       como background repetido de la capa de marca de agua. */
    function watermarkSvg(email, fechaTexto, color) {
        var texto = escapeXml(email) + ' · ' + escapeXml(fechaTexto);
        var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="420" height="260">' +
            '<text x="10" y="150" font-family="Helvetica,Arial,sans-serif" font-size="15" font-weight="700" fill="' + (color || '#0f1428') + '" ' +
            'transform="rotate(-28 210 130)">' + texto + '</text></svg>';
        return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
    }

    function fechaTexto(d) {
        d = d || new Date();
        var p = function (n) { return (n < 10 ? '0' : '') + n; };
        return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
    }

    /* Combinaciones bloqueadas: DevTools, ver código, guardar, imprimir. */
    function isBlockedKey(ev, allowPrint) {
        var k = (ev.key || '').toLowerCase();
        var mod = ev.ctrlKey || ev.metaKey;
        if (k === 'f12') return true;
        if (k === 'printscreen') return true;
        if (mod && ev.shiftKey && (k === 'i' || k === 'j' || k === 'c' || k === 'k')) return true;
        if (mod && (k === 'u' || k === 's')) return true;
        if (mod && k === 'p' && !allowPrint) return true;
        return false;
    }

    /* ---------- DOM ---------- */

    var CSS_BASE =
        'body.pt-active, body.pt-active * { -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; }' +
        'body.pt-active input, body.pt-active textarea, body.pt-active select, body.pt-active [contenteditable="true"] { -webkit-user-select: text; user-select: text; }' +
        'body.pt-active img, body.pt-active canvas, body.pt-active video { -webkit-user-drag: none; user-drag: none; pointer-events: auto; }' +
        '#ptWatermark { position: fixed; inset: 0; z-index: 2147483000; pointer-events: none; opacity: 0.10; background-repeat: repeat; background-size: 420px 260px; }' +
        'html[data-theme="dark"] #ptWatermark { opacity: 0.13; }' +
        '#ptToast { position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); z-index: 2147483001; background: #050a1a; color: #FFD700; border: 1px solid #FFD700; padding: 10px 16px; border-radius: 10px; font: 700 0.82rem -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; opacity: 0; transition: opacity 0.2s; pointer-events: none; }' +
        '#ptToast.is-on { opacity: 1; }';
    var CSS_PRINT =
        '@media print { body.pt-active > * { display: none !important; } body.pt-active::after { content: "Contenido protegido · Paideia Tech · No disponible para impresión"; display: block; padding: 40px; font: 700 18px sans-serif; } }';

    var toastTimer = null;
    function toast(msg) {
        var t = document.getElementById('ptToast');
        if (!t) { t = document.createElement('div'); t.id = 'ptToast'; document.body.appendChild(t); }
        t.textContent = msg;
        t.classList.add('is-on');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () { t.classList.remove('is-on'); }, 1800);
    }

    function activate(email, allowPrint) {
        if (document.body.classList.contains('pt-active')) return;
        document.body.classList.add('pt-active');
        var style = document.createElement('style');
        style.id = 'ptStyle';
        style.textContent = CSS_BASE + (allowPrint ? '' : CSS_PRINT);
        document.head.appendChild(style);

        var wm = document.createElement('div');
        wm.id = 'ptWatermark';
        wm.setAttribute('aria-hidden', 'true');
        var pintar = function () {
            var oscuro = document.documentElement.getAttribute('data-theme') === 'dark';
            wm.style.backgroundImage = 'url("' + watermarkSvg(email, fechaTexto(), oscuro ? '#ffffff' : '#0f1428') + '")';
        };
        pintar();
        document.body.appendChild(wm);
        setInterval(pintar, 60000);
        new MutationObserver(pintar).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

        var esCampo = function (el) { return !!(el && el.closest && el.closest('input, textarea, select, [contenteditable="true"]')); };
        ['copy', 'cut', 'dragstart'].forEach(function (tipo) {
            document.addEventListener(tipo, function (ev) {
                if (esCampo(ev.target)) return;
                ev.preventDefault();
                toast('🔒 Contenido protegido · Paideia Tech');
            }, true);
        });
        document.addEventListener('contextmenu', function (ev) {
            if (esCampo(ev.target)) return;
            ev.preventDefault();
            toast('🔒 Contenido protegido · Paideia Tech');
        }, true);
        document.addEventListener('keydown', function (ev) {
            if (!isBlockedKey(ev, allowPrint)) return;
            ev.preventDefault();
            ev.stopPropagation();
            if ((ev.key || '').toLowerCase() === 'printscreen' && navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText('Contenido protegido · Paideia Tech · ' + email).catch(function () { /* ignore */ });
            }
            toast('🔒 Contenido protegido · Paideia Tech');
        }, true);
        if (!allowPrint) {
            window.addEventListener('beforeprint', function () { toast('🔒 Este contenido no se puede imprimir'); });
        }
    }

    async function boot(allowPrint, force) {
        if (typeof Auth === 'undefined') return;
        var session = null;
        try { session = await Auth.getSession(); } catch (e) { session = null; }
        var email = session && session.user && session.user.email ? session.user.email : '';
        var isBypass = false, isAdmin = false;
        if (email) {
            try { isBypass = await Auth.isBypassSession(); } catch (e) { isBypass = email.toLowerCase() === CANDIDATE_FLOW_BYPASS; }
            try { isAdmin = await Auth.isAdmin(email); } catch (e) { isAdmin = false; }
        }
        if (shouldActivate({ session: session, isBypass: isBypass, isAdmin: isAdmin, force: force })) activate(email || 'sesión', allowPrint);
    }

    var Protect = { _helpers: { shouldActivate: shouldActivate, watermarkSvg: watermarkSvg, isBlockedKey: isBlockedKey, escapeXml: escapeXml, fechaTexto: fechaTexto }, activate: activate };

    if (typeof module !== 'undefined' && module.exports) module.exports = Protect;
    if (typeof window !== 'undefined') {
        window.Protect = Protect;
        var cs = document.currentScript;
        var allowPrint = !!(cs && cs.dataset && cs.dataset.protectPrint === 'allow');
        var force = /[?&]protect=1(&|$)/.test(location.search);
        var arrancar = function () { boot(allowPrint, force); };
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arrancar); else arrancar();
    }
})();
