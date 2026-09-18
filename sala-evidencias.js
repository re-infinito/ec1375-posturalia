/* =========================================================
   sala-evidencias.js — Sala de Zoom para grabar la evidencia (18 sep 2026).

   La sala es UNA reunión recurrente de Zoom con enlace y clave fijos para
   todos. La plataforma evita que se conecten 2 a la vez con horarios
   exclusivos (la base de datos no deja reservar un horario dos veces) y
   entregando el enlace SOLO al dueño del horario y SOLO dentro de su
   ventana (RPC mi_sala_evidencia(); el enlace nunca está en el HTML).

   Módulo compartido (como firma-candidato.js): la regla de qué se muestra
   y cuándo vive en un solo lugar. Lo usan plan-evaluacion.html (agenda),
   documentos-sesion.html y guion-maestro.html (tarjeta de la sala),
   panel.html y evidencias.html (aviso de fecha límite), y el equipo
   (admin-sala-evidencias.js, admin-data.js, grabacion-zoom.js).
   Spec: docs/superpowers/specs/2026-09-18-sala-evidencias-zoom-design.md
   Pruebas: tests/sala-evidencias.test.js
========================================================= */
(function (root) {
    'use strict';

    var TZ = 'America/Mexico_City';
    /* México no tiene horario de verano desde octubre de 2022: siempre UTC−6. */
    var OFFSET_MX = '-06:00';
    var MIN_MS = 60000, DIA_MS = 86400000;
    var LUGAR_SALA = 'En línea — Sala Zoom PAIDEIA · Grabación de evidencias';
    var WHATSAPP = 'https://wa.me/528115026729';

    /* ---------- fechas (puras) ---------- */
    function esc(s) {
        return String(s === null || s === undefined ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function esFechaISO(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s); }
    function aMs(v) { return esFechaISO(v) ? Date.parse(v + 'T12:00:00' + OFFSET_MX) : Date.parse(v); }
    function fechaISO(ms) { return new Date(ms).toLocaleDateString('en-CA', { timeZone: TZ }); }
    function fechaLarga(v) { return new Date(aMs(v)).toLocaleDateString('es-MX', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); }
    function fechaCorta(v) { return new Date(aMs(v)).toLocaleDateString('es-MX', { timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric' }); }
    function hora(v) { return new Date(v).toLocaleTimeString('es-MX', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }); }
    function horarioTexto(inicio, fin) { return hora(inicio) + ' a ' + hora(fin) + ' h'; }
    function mxAIso(fecha, hhmm) { return new Date(fecha + 'T' + hhmm + ':00' + OFFSET_MX).toISOString(); }
    function sumarDias(fecha, n) { var d = new Date(fecha + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
    function diasEntre(a, b) { return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / DIA_MS); }

    /* Misma regla que limite_evidencia_para() del SQL. */
    function limiteDesde(autorizadoEn, dias) {
        var t = Date.parse(autorizadoEn || '');
        return isNaN(t) ? null : sumarDias(fechaISO(t), Number(dias) || 30);
    }
    function limiteInfo(limite, hoy, entregada) {
        if (!esFechaISO(limite)) return null;
        if (entregada) return { clave: 'entregada', dias: null, limite: limite };
        var dias = diasEntre(hoy, limite);
        return { clave: dias < 0 ? 'vencido' : dias <= 7 ? 'pronto' : 'ok', dias: dias, limite: limite };
    }
    function esUrlZoom(u) { return typeof u === 'string' && /^https:\/\/([a-z0-9-]+\.)*zoom\.us\/[^\s"'<>]*$/i.test(u); }

    function cuentaRegresiva(ms) {
        if (!(ms > 0)) return 'ya';
        var min = Math.ceil(ms / MIN_MS);
        if (min < 60) return min + ' min';
        var h = Math.floor(min / 60), m = min % 60;
        if (h < 24) return h + ' h' + (m ? ' ' + m + ' min' : '');
        var d = Math.floor(h / 24), hr = h % 24;
        return d + (d === 1 ? ' día' : ' días') + (hr ? ' ' + hr + ' h' : '');
    }

    /* ---------- estado de la tarjeta (puro) ----------
       d = respuesta de mi_sala_evidencia(). El enlace (d.sala) solo llega del
       servidor dentro de la ventana; si el reloj local ya está en la ventana
       pero aún no hay enlace, se sigue esperando (y se vuelve a pedir). */
    function estado(d, ahoraMs) {
        var r = d && d.reserva;
        if (!r || r.estado === 'cancelada') return { clave: 'sin_reserva' };
        if (r.estado === 'no_asistio') return { clave: 'no_asistio' };
        var ini = Date.parse(r.inicio), fin = Date.parse(r.fin);
        var abre = ini - (Number(d.minutos_antes) || 0) * MIN_MS;
        if (ahoraMs > fin) return { clave: 'terminada' };
        if (ahoraMs < abre) return { clave: 'antes', abreEnMs: abre - ahoraMs };
        if (d.sala) return { clave: 'abierta', terminaEnMs: fin - ahoraMs };
        return { clave: 'antes', abreEnMs: 0, esperandoServidor: true };
    }
    function puedeCambiar(r, horasCambio, ahoraMs) {
        if (!r || !r.inicio) return false;
        return Date.parse(r.inicio) - ahoraMs >= (Number(horasCambio) || 0) * 60 * MIN_MS;
    }

    /* ---------- plantilla semanal (pura) ----------
       p = { dias: [0..6 como getUTCDay: 0 = domingo], horas: ['09:00'], duracion, colchon, desde, hasta } */
    function intervalo(h) { var ini = Date.parse(h.inicio); return { ini: ini, finC: Date.parse(h.fin) + (Number(h.colchon_min) || 0) * MIN_MS }; }
    function traslapa(a, b) { return a.ini < b.finC && b.ini < a.finC; }
    function generarHorarios(p, existentes, ahoraMs) {
        p = p || {};
        var dur = Number(p.duracion), col = Number(p.colchon) || 0;
        if (!(dur > 0) || col < 0 || !esFechaISO(p.desde) || !esFechaISO(p.hasta) || p.hasta < p.desde) {
            return { nuevos: [], omitidos: [], error: 'Revisa la duración y el rango de fechas.' };
        }
        var horas = (p.horas || []).filter(function (h) { return /^\d{2}:\d{2}$/.test(h); }).sort();
        var ocupados = (existentes || []).map(intervalo);
        var nuevos = [], omitidos = [];
        for (var f = p.desde, n = 0; f <= p.hasta && n < 400; f = sumarDias(f, 1), n++) {
            if ((p.dias || []).indexOf(new Date(f + 'T00:00:00Z').getUTCDay()) < 0) continue;
            horas.forEach(function (hh) {
                var inicio = mxAIso(f, hh);
                var cand = { inicio: inicio, fin: new Date(Date.parse(inicio) + dur * MIN_MS).toISOString(), colchon_min: col };
                var iv = intervalo(cand);
                if (iv.ini <= ahoraMs) { omitidos.push({ inicio: inicio, motivo: 'ya pasó' }); return; }
                if (ocupados.some(function (o) { return traslapa(iv, o); })) { omitidos.push({ inicio: inicio, motivo: 'se traslapa con otro horario' }); return; }
                ocupados.push(iv);
                nuevos.push(cand);
            });
        }
        return { nuevos: nuevos, omitidos: omitidos };
    }

    function agruparPorDia(horarios) {
        var dias = {}, orden = [];
        (horarios || []).slice().sort(function (a, b) { return Date.parse(a.inicio) - Date.parse(b.inicio); }).forEach(function (h) {
            var f = fechaISO(Date.parse(h.inicio));
            if (!dias[f]) {
                dias[f] = { fecha: f, etiqueta: new Date(aMs(f)).toLocaleDateString('es-MX', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' }), horarios: [] };
                orden.push(f);
            }
            dias[f].horarios.push({ id: h.id, inicio: h.inicio, fin: h.fin, texto: horarioTexto(h.inicio, h.fin) });
        });
        return orden.map(function (f) { return dias[f]; });
    }

    var api = {
        TZ: TZ, LUGAR_SALA: LUGAR_SALA, WHATSAPP: WHATSAPP, _esc: esc,
        fechaISO: fechaISO, fechaLarga: fechaLarga, fechaCorta: fechaCorta, hora: hora, horarioTexto: horarioTexto,
        mxAIso: mxAIso, sumarDias: sumarDias, limiteDesde: limiteDesde, limiteInfo: limiteInfo, esUrlZoom: esUrlZoom,
        cuentaRegresiva: cuentaRegresiva, estado: estado, puedeCambiar: puedeCambiar,
        generarHorarios: generarHorarios, agruparPorDia: agruparPorDia
    };
    /* (La capa de navegador se agrega en la Tarea 5, antes de este bloque.) */
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.SalaEvidencias = api;
})(typeof window !== 'undefined' ? window : this);
