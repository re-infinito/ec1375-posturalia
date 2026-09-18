/* =========================================================
   grabacion-zoom.js — Copia de la grabación de la sala de Zoom al NAS
   (18 sep 2026). Las funciones puras las usan también lib/zoom.js y
   api/subir-portafolio.js (mismo nombre de archivo, mismo tamaño de trozo).
   La tarjeta "Grabación de la sesión" de admin-evaluacion.html vive aquí.
   Spec: docs/superpowers/specs/2026-09-18-sala-evidencias-zoom-design.md
   Pruebas: tests/grabacion-zoom.test.js
========================================================= */
(function (root) {
    'use strict';

    var TZ = 'America/Mexico_City';
    /* 32 MB por trozo: Cloudflare (delante del NAS) corta en 100 MB, y cada
       llamada a la función queda muy por debajo de su tiempo máximo. */
    var TROZO = 32 * 1024 * 1024;
    var PREFERENCIA = ['shared_screen_with_speaker_view', 'shared_screen_with_gallery_view', 'active_speaker', 'gallery_view', 'shared_screen'];

    function planTrozos(bytes, tam) {
        tam = tam || TROZO;
        var out = [];
        for (var d = 0, n = 1; d < bytes; d += tam, n++) out.push({ n: n, desde: d, hasta: Math.min(d + tam, bytes) - 1 });
        return out;
    }
    function rango(tipo) { var i = PREFERENCIA.indexOf(tipo); return i < 0 ? PREFERENCIA.length : i; }
    function archivoPrincipal(archivos) {
        if (!archivos || !archivos.length) return null;
        return archivos.slice().sort(function (a, b) { return rango(a.tipo) - rango(b.tipo) || (b.bytes - a.bytes); })[0];
    }
    function nombreGrabacion(inicioISO, parte, partes) {
        var t = new Date(inicioISO);
        var f = t.toLocaleDateString('en-CA', { timeZone: TZ });
        var h = t.toLocaleTimeString('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).replace(':', '');
        return 'Grabacion_Sesion_' + f + '_' + h + (partes > 1 ? '_parte' + parte : '') + '.mp4';
    }
    function ventanaBusqueda(reserva) {
        if (!reserva || !reserva.inicio || !reserva.fin) return null;
        return { desde: new Date(Date.parse(reserva.inicio) - 15 * 60000).toISOString(), hasta: new Date(Date.parse(reserva.fin) + 60 * 60000).toISOString() };
    }
    function esIdSubida(s) { return typeof s === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(s); }
    function nuevoIdSubida() { return 'sala-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10); }
    function partesDe(ev) { return ev && ev.video && Array.isArray(ev.video.partes) ? ev.video.partes : []; }
    function puedeBorrarDeZoom(ev) {
        var p = partesDe(ev);
        return !!(ev && ev.etapas && ev.etapas.entregado) && p.length > 0 && p.every(function (x) { return !!(x && x.nas && x.nas.ruta); });
    }

    var api = {
        TROZO: TROZO, planTrozos: planTrozos, archivoPrincipal: archivoPrincipal, nombreGrabacion: nombreGrabacion,
        ventanaBusqueda: ventanaBusqueda, esIdSubida: esIdSubida, nuevoIdSubida: nuevoIdSubida,
        partesDe: partesDe, puedeBorrarDeZoom: puedeBorrarDeZoom
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.GrabacionZoom = api;
})(typeof window !== 'undefined' ? window : this);
