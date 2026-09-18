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

    /* ---------- HTML (puro) ---------- */
    var REGLAS = [
        'La sala es individual: entra solo en tu horario.',
        '<strong>Si al entrar ves a otra persona, sal de inmediato y avísanos por WhatsApp.</strong>',
        'No compartas el enlace ni la clave.',
        '<strong>La grabación empieza en cuanto entras</strong>: llega con tu usuario, tu equipo listo y esta página abierta.',
        'Pon tu nombre completo en Zoom (así se identifica tu grabación).',
        'Cámara y micrófono encendidos todo el tiempo.',
        'Al terminar, sal completamente de Zoom ("Salir de la reunión" y cierra la app).'
    ];
    function reglasHtml(abiertas) {
        return '<details class="sala-reglas"' + (abiertas ? ' open' : '') + '><summary>Reglas de la sala</summary><ol>' +
            REGLAS.map(function (r) { return '<li>' + r + '</li>'; }).join('') + '</ol></details>';
    }
    function tarjetaHtml(d, est, opts) {
        opts = opts || {};
        var r = d && d.reserva;
        var cuando = r ? esc(fechaLarga(r.inicio)) + ' · ' + esc(horarioTexto(r.inicio, r.fin)) : '';
        var antes = Number(d && d.minutos_antes) || 0;
        var h = '<div class="sala-card sala-' + est.clave + '"><h2>🎥 Tu sala de evidencia</h2>';
        if (est.clave === 'sin_reserva') {
            h += '<p>Aún no tienes horario para grabar tu sesión. Cada horario es para una sola persona.</p>' +
                 '<a class="sala-btn" href="plan-evaluacion.html">Agendar mi horario</a>';
        } else if (est.clave === 'antes') {
            h += '<p class="sala-cuando">' + cuando + '</p>' +
                 (est.esperandoServidor ? '<p>Abriendo la sala…</p>'
                    : '<p>La sala se abre ' + (antes ? antes + ' min antes de tu horario' : 'a la hora de tu horario') + ' · faltan <strong>' + esc(cuentaRegresiva(est.abreEnMs)) + '</strong></p>') +
                 '<button type="button" class="sala-btn" disabled>Se habilita ' + (antes ? antes + ' min antes' : 'a tu hora') + '</button>';
        } else if (est.clave === 'abierta') {
            var s = d.sala;
            h += '<p class="sala-cuando">' + cuando + ' · <strong>la sala está abierta</strong></p>';
            if (s.url === null) h += '<button type="button" class="sala-btn sala-btn-ok" data-sala-demo>Entrar a la sala de Zoom</button>';
            else if (esUrlZoom(s.url)) h += '<a class="sala-btn sala-btn-ok" data-sala-entrar href="' + esc(s.url) + '" target="_blank" rel="noopener noreferrer">Entrar a la sala de Zoom</a>';
            else h += '<p class="sala-msg">El enlace de la sala no es válido. Escríbenos por WhatsApp.</p>';
            h += '<p class="sala-datos">ID de reunión: <strong>' + esc(s.id || '') + '</strong>' +
                 (s.clave ? ' · Clave: <strong>' + esc(s.clave) + '</strong> <button type="button" class="sala-copiar" data-sala-copiar="' + esc(s.clave) + '">Copiar</button>' : '') + '</p>' +
                 '<p class="sala-nota">Tu horario termina a las ' + esc(hora(r.fin)) + ' h. Al terminar, sal completamente de Zoom.</p>';
        } else if (est.clave === 'terminada') {
            h += '<p class="sala-cuando">' + cuando + '</p><p>¿Ya grabaste? Sigue con tus documentos. Si algo falló, agenda otro horario.</p>' +
                 '<a class="sala-btn sala-btn-sec" href="plan-evaluacion.html">Agendar otro horario</a>';
        } else if (est.clave === 'no_asistio') {
            h += '<p>No se registró tu sesión del ' + esc(fechaLarga(r.inicio)) + '.</p><a class="sala-btn" href="plan-evaluacion.html">Agendar otro horario</a>';
        }
        if (est.clave === 'antes' || est.clave === 'abierta') h += reglasHtml(opts.reglasAbiertas);
        return h + '<p class="sala-ayuda">¿Algún problema? <a href="' + WHATSAPP + '" target="_blank" rel="noopener">Escríbenos por WhatsApp</a></p></div>';
    }
    function avisoHtml(info) {
        if (!info) return '';
        if (info.clave === 'entregada') return '<div class="sala-aviso sala-aviso-ok">✅ Evidencia entregada</div>';
        var f = '<strong>' + esc(fechaLarga(info.limite)) + '</strong>';
        if (info.clave === 'vencido') {
            return '<div class="sala-aviso sala-aviso-bad" role="alert">⏰ Tu plazo para entregar tu evidencia venció el ' + f +
                '. <a href="' + WHATSAPP + '" target="_blank" rel="noopener">Escríbenos por WhatsApp</a></div>';
        }
        var faltan = info.dias === 0 ? 'hoy es el último día' : 'faltan ' + info.dias + (info.dias === 1 ? ' día' : ' días');
        return '<div class="sala-aviso ' + (info.clave === 'pronto' ? 'sala-aviso-warn' : 'sala-aviso-info') + '">📅 Tienes hasta el ' + f + ' para entregar tu evidencia · ' + faltan + '</div>';
    }
    function grabacionHtml(d) {
        var g = d && d.grabacion;
        if (g && g.en_expediente) return '<span class="sala-chip sala-chip-ok">✅ Guardada en tu expediente' + (g.fecha ? ' (' + esc(fechaCorta(g.fecha)) + ')' : '') + '</span>';
        return '<span class="sala-chip">⏳ Pendiente — el equipo la guardará en tu expediente</span>';
    }
    function selectorHtml(dias, diaSel) {
        if (!dias || !dias.length) return '<p class="sala-nota">No hay horarios disponibles por ahora.</p>';
        var sel = dias.filter(function (x) { return x.fecha === diaSel; })[0] || dias[0];
        return '<p class="sala-nota">1. Elige el día · 2. Elige la hora</p><div class="sala-dias" role="group" aria-label="Días disponibles">' +
            dias.map(function (x) { var on = x.fecha === sel.fecha; return '<button type="button" class="sala-dia' + (on ? ' on' : '') + '" data-sala-dia="' + x.fecha + '" aria-pressed="' + on + '">' + esc(x.etiqueta) + '</button>'; }).join('') +
            '</div><div class="sala-horas" role="group" aria-label="Horarios">' +
            sel.horarios.map(function (h) { return '<button type="button" class="sala-hora" data-sala-horario="' + esc(h.id) + '">' + esc(h.texto) + '</button>'; }).join('') + '</div>';
    }
    function reservaHtml(d, ahoraMs) {
        var r = d.reserva, cambia = puedeCambiar(r, d.horas_cambio, ahoraMs);
        return '<div class="sala-reservada"><p>✅ Tu horario: <strong>' + esc(fechaLarga(r.inicio)) + ' · ' + esc(horarioTexto(r.inicio, r.fin)) + '</strong></p>' +
            '<p class="sala-nota">Ese día entras a la sala desde Documentos de Sesión o el Guion Maestro; el botón se habilita ' + (Number(d.minutos_antes) || 0) + ' min antes.</p>' +
            '<div class="sala-acciones"><button type="button" class="sala-btn sala-btn-sec" data-sala-cambiar' + (cambia ? '' : ' disabled') + '>Cambiar horario</button>' +
            '<button type="button" class="sala-btn sala-btn-sec" data-sala-cancelar' + (cambia ? '' : ' disabled') + '>Cancelar</button></div>' +
            (cambia ? '' : '<p class="sala-nota">Faltan menos de ' + esc(d.horas_cambio) + ' h: para cambiarlo <a href="' + WHATSAPP + '" target="_blank" rel="noopener">escríbenos por WhatsApp</a>.</p>') + '</div>';
    }

    /* ---------- navegador ---------- */
    var ESTILOS = '.sala-card,.sala-reservada{background:var(--surface-2,rgba(127,127,127,.08));border:1px solid var(--border,rgba(127,127,127,.3));border-radius:12px;padding:16px;margin:0 0 18px}' +
        '.sala-card h2{font-size:1.05rem;margin:0 0 8px;color:var(--text-bright)}.sala-card p,.sala-reservada p{margin:0 0 10px;color:var(--text)}' +
        '.sala-cuando{color:var(--text-bright)!important;font-weight:600}.sala-nota,.sala-ayuda{font-size:.82rem}' +
        '.sala-btn{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:10px 18px;border-radius:10px;border:0;background:var(--primary,#0088FF);color:#fff;font-weight:700;text-decoration:none;cursor:pointer;margin:4px 8px 8px 0}' +
        '.sala-btn[disabled]{opacity:.55;cursor:not-allowed}.sala-btn-ok{background:var(--success,#00a86b)}.sala-btn-sec{background:transparent;color:var(--text-bright);border:1px solid var(--border,rgba(127,127,127,.4))}' +
        '.sala-copiar,.sala-link{background:none;border:1px solid var(--border,rgba(127,127,127,.4));border-radius:6px;padding:2px 8px;color:var(--text-bright);cursor:pointer;font-size:.8rem}' +
        '.sala-reglas{margin-top:8px}.sala-reglas summary{cursor:pointer;font-weight:600;color:var(--text-bright)}.sala-reglas ol{margin:8px 0 0 20px;color:var(--text);font-size:.86rem}.sala-reglas li{margin-bottom:4px}' +
        '.sala-aviso{border-radius:10px;padding:12px 14px;margin:0 0 16px;font-size:.9rem;border:1px solid}.sala-aviso-info{border-color:var(--primary,#0088FF);color:var(--text-bright)}' +
        '.sala-aviso-warn{border-color:#d4a017;background:rgba(212,160,23,.12);color:var(--text-bright)}.sala-aviso-bad{border-color:var(--danger,#FF3333);background:rgba(255,51,51,.1);color:var(--text-bright)}.sala-aviso-ok{border-color:var(--success,#00a86b);color:var(--text-bright)}' +
        '.sala-dias,.sala-horas{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 12px}.sala-dia,.sala-hora{min-height:44px;padding:8px 14px;border-radius:10px;border:1px solid var(--border,rgba(127,127,127,.4));background:transparent;color:var(--text-bright);cursor:pointer;font-weight:600}' +
        '.sala-dia.on{background:var(--primary,#0088FF);color:#fff;border-color:transparent}.sala-hora:hover,.sala-dia:hover{border-color:var(--primary,#0088FF)}' +
        '.sala-chip{display:inline-block;padding:4px 10px;border-radius:999px;background:var(--surface-2,rgba(127,127,127,.12));font-size:.82rem;color:var(--text)}.sala-chip-ok{color:var(--success,#00a86b)}' +
        '.sala-msg{font-weight:600;color:var(--text-bright)}';
    function inyectarEstilos() {
        if (typeof document === 'undefined' || document.getElementById('salaEvidenciasCss')) return;
        var st = document.createElement('style'); st.id = 'salaEvidenciasCss'; st.textContent = ESTILOS;
        document.head.appendChild(st);
    }
    function leerLS(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
    function escribirLS(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* sin storage */ } }

    /* Cuenta demo (paideia.tech@outlook.com): datos ficticios, nunca el
       enlace real ni llamadas a las RPC de reserva. */
    var demo = null, demoHorarios = null;
    function esDemo() { return !!(root.Auth && root.Auth._isBypassSession === true); }
    function datosDemo() {
        var ahora = Date.now();
        if (!demo) demo = {
            reserva: { id: 'demo', inicio: new Date(ahora - 5 * MIN_MS).toISOString(), fin: new Date(ahora + 85 * MIN_MS).toISOString(), estado: 'reservada' },
            limite: sumarDias(fechaISO(ahora), 12), limite_extendido: false, minutos_antes: 10, horas_cambio: 24,
            sala: { url: null, id: '000 0000 0000', clave: 'DEMO' }, grabacion: { en_expediente: false, fecha: null }
        };
        return demo;
    }
    function sb() { return root.supabaseClient || null; }
    function mensajeError(e) { return (e && (e.message || e.error_description)) || String(e || 'Error'); }

    async function cargar() {
        if (root.Auth && root.Auth.isBypassSession) { try { await root.Auth.isBypassSession(); } catch (e) { /* sin sesión */ } }
        if (esDemo()) return datosDemo();
        if (!sb()) return null;
        try {
            var r = await sb().rpc('mi_sala_evidencia');
            if (r.error) { console.warn('mi_sala_evidencia:', mensajeError(r.error)); return null; }
            return r.data || null;
        } catch (e) { console.warn('mi_sala_evidencia:', e); return null; }
    }
    async function disponibles() {
        if (esDemo()) {
            if (!demoHorarios) { var b = Date.now() + 2 * DIA_MS; demoHorarios = [0, 1, 2].map(function (i) { return { id: 'demo-' + i, inicio: new Date(b + i * 2 * 3600000).toISOString(), fin: new Date(b + i * 2 * 3600000 + 90 * MIN_MS).toISOString() }; }); }
            return demoHorarios;
        }
        var r = await sb().rpc('horarios_evidencia_disponibles');
        if (r.error) throw new Error(mensajeError(r.error));
        return r.data || [];
    }
    async function reservar(id) {
        if (esDemo()) { var h = (demoHorarios || []).filter(function (x) { return x.id === id; })[0]; datosDemo().reserva = { id: 'demo', inicio: h.inicio, fin: h.fin, estado: 'reservada' }; return datosDemo().reserva; }
        var r = await sb().rpc('reservar_horario_evidencia', { p_horario: id });
        if (r.error) throw new Error(mensajeError(r.error));
        return r.data;
    }
    async function cancelar() {
        if (esDemo()) { datosDemo().reserva = null; return true; }
        var r = await sb().rpc('cancelar_mi_horario_evidencia');
        if (r.error) throw new Error(mensajeError(r.error));
        return r.data;
    }

    /* Tarjeta de la sala: se repinta cada 30 s (la ventana se abre sola) y,
       si el reloj ya está en la ventana pero el servidor aún no mandó el
       enlace, lo vuelve a pedir (máximo cada 25 s). */
    async function tarjeta(el, opts) {
        if (!el) return;
        opts = opts || {};
        inyectarEstilos();
        var d = 'datos' in opts ? opts.datos : await cargar();
        if (!d) { el.innerHTML = ''; return; }
        var reglasVistas = leerLS('paideia-sala-reglas-vistas') === '1', ultima = Date.now(), timer = null;
        function pintar() {
            if (!document.body.contains(el)) { clearInterval(timer); return; }
            var ahora = Date.now(), est = estado(d, ahora);
            if (est.esperandoServidor && ahora - ultima > 25000) {
                ultima = ahora;
                cargar().then(function (n) { if (n) { d = n; pintar(); } });
            }
            var det = el.querySelector('details.sala-reglas');
            el.innerHTML = tarjetaHtml(d, est, { reglasAbiertas: det ? det.open : !reglasVistas });
            el.querySelectorAll('[data-sala-copiar]').forEach(function (b) {
                b.addEventListener('click', function () {
                    var t = b.getAttribute('data-sala-copiar');
                    (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { b.textContent = '¡Copiada!'; }, function () { b.textContent = t; });
                });
            });
            var dm = el.querySelector('[data-sala-demo]');
            if (dm) dm.addEventListener('click', function () { alert('Cuenta demo: aquí se abriría la sala de Zoom de Paideia.'); });
        }
        timer = setInterval(pintar, 30000);
        pintar();
        escribirLS('paideia-sala-reglas-vistas', '1');
    }

    async function avisoLimite(el, d) {
        if (!el) return;
        inyectarEstilos();
        if (d === undefined) d = await cargar();
        if (!d || !d.limite) { el.innerHTML = ''; return; }
        var entregada = false;
        try {
            var steps = root.FlowStatus ? await root.FlowStatus.getSteps() : [];
            var ev = steps.filter(function (s) { return s.id === 'evidencias'; })[0];
            entregada = !!(ev && ev.done);
        } catch (e) { /* sin pasos: se muestra el plazo */ }
        el.innerHTML = avisoHtml(limiteInfo(d.limite, fechaISO(Date.now()), entregada));
    }

    /* Monta todo lo que encuentre: [data-sala-tarjeta], [data-sala-aviso],
       [data-sala-grabacion]. Una sola llamada a mi_sala_evidencia(). */
    async function montar(contenedor) {
        contenedor = contenedor || document;
        inyectarEstilos();
        var t = contenedor.querySelectorAll('[data-sala-tarjeta]'), a = contenedor.querySelectorAll('[data-sala-aviso]'), g = contenedor.querySelectorAll('[data-sala-grabacion]');
        if (!t.length && !a.length && !g.length) return null;
        var d = await cargar();
        t.forEach(function (el) { tarjeta(el, { datos: d }); });
        a.forEach(function (el) { avisoLimite(el, d); });
        g.forEach(function (el) { el.innerHTML = d ? grabacionHtml(d) : ''; });
        return d;
    }
    function montarDespuesDelHero(app, opts) {
        opts = opts || {};
        var html = '<div data-sala-aviso></div>' + (opts.tarjeta === false ? '' : '<div data-sala-tarjeta></div>');
        var hero = app.querySelector('.hero');
        if (hero) hero.insertAdjacentHTML('afterend', html); else app.insertAdjacentHTML('afterbegin', html);
        return montar(app);
    }

    /* Agenda del Plan de Evaluación. Resuelve { activa, reserva } donde
       reserva = { fecha: 'YYYY-MM-DD', horario: '10:00 a 11:30 h', inicio, fin } o null.
       activa = false → la página conserva el modo de hoy (WhatsApp + fecha
       manual): sin SQL, o sin horarios y sin reserva. opts.onCambio(reserva|null). */
    async function agenda(el, opts) {
        opts = opts || {};
        inyectarEstilos();
        var d = await cargar();
        if (!d) { el.innerHTML = ''; return { activa: false, reserva: null }; }
        var lista = [], diaSel = null, mensaje = '', modoCambio = false;
        function vigente() { var r = d.reserva; return !!(r && r.estado === 'reservada' && Date.parse(r.fin) > Date.now()); }
        function resumen() { var r = d.reserva; return r && r.estado !== 'cancelada' ? { fecha: fechaISO(Date.parse(r.inicio)), horario: horarioTexto(r.inicio, r.fin), inicio: r.inicio, fin: r.fin } : null; }
        async function refrescar() { try { lista = agruparPorDia(await disponibles()); } catch (e) { lista = []; mensaje = 'No pudimos cargar los horarios: ' + mensajeError(e); } }
        function pintar() {
            var html = mensaje ? '<p class="sala-msg" role="status">' + esc(mensaje) + '</p>' : '';
            if (vigente() && !modoCambio) html += reservaHtml(d, Date.now());
            else {
                var r = d.reserva;
                if (r && !vigente() && r.estado !== 'cancelada') html += '<p class="sala-nota">Tu sesión anterior fue el ' + esc(fechaLarga(r.inicio)) + '. Si necesitas grabar de nuevo, elige otro horario.</p>';
                if (modoCambio) html += '<p class="sala-nota">Elige tu nuevo horario; el anterior se libera al confirmar. <button type="button" class="sala-link" data-sala-volver>Conservar mi horario</button></p>';
                html += selectorHtml(lista, diaSel);
            }
            el.innerHTML = html;
            el.querySelectorAll('[data-sala-dia]').forEach(function (b) { b.addEventListener('click', function () { diaSel = b.getAttribute('data-sala-dia'); mensaje = ''; pintar(); }); });
            el.querySelectorAll('[data-sala-horario]').forEach(function (b) { b.addEventListener('click', function () { elegir(b.getAttribute('data-sala-horario')); }); });
            var c = el.querySelector('[data-sala-cambiar]'); if (c) c.addEventListener('click', async function () { modoCambio = true; mensaje = ''; await refrescar(); pintar(); });
            var v = el.querySelector('[data-sala-volver]'); if (v) v.addEventListener('click', function () { modoCambio = false; pintar(); });
            var x = el.querySelector('[data-sala-cancelar]'); if (x) x.addEventListener('click', cancelarHorario);
        }
        async function elegir(id) {
            var h = null;
            lista.forEach(function (dia) { dia.horarios.forEach(function (x) { if (x.id === id) h = x; }); });
            if (!h || !confirm('¿Reservar el ' + fechaLarga(h.inicio) + ' de ' + horarioTexto(h.inicio, h.fin) + '?\n\nEse horario queda solo para ti.')) return;
            try {
                d.reserva = await reservar(id);
                modoCambio = false; mensaje = '✅ Horario reservado.';
                if (opts.onCambio) opts.onCambio(resumen());
            } catch (e) { mensaje = mensajeError(e); await refrescar(); }
            pintar();
        }
        async function cancelarHorario() {
            if (!confirm('¿Cancelar tu horario? Lo podrá tomar otra persona.')) return;
            try { await cancelar(); d.reserva = null; mensaje = 'Tu horario se canceló.'; await refrescar(); if (opts.onCambio) opts.onCambio(null); }
            catch (e) { mensaje = mensajeError(e); }
            pintar();
        }
        if (!vigente()) await refrescar();
        if (!vigente() && !lista.length && !(d.reserva && d.reserva.estado !== 'cancelada')) {
            el.innerHTML = mensaje ? '<p class="sala-msg">' + esc(mensaje) + '</p>' : '';
            return { activa: false, reserva: null };
        }
        pintar();
        return { activa: true, reserva: resumen() };
    }

    var api = {
        TZ: TZ, LUGAR_SALA: LUGAR_SALA, WHATSAPP: WHATSAPP, _esc: esc,
        fechaISO: fechaISO, fechaLarga: fechaLarga, fechaCorta: fechaCorta, hora: hora, horarioTexto: horarioTexto,
        mxAIso: mxAIso, sumarDias: sumarDias, limiteDesde: limiteDesde, limiteInfo: limiteInfo, esUrlZoom: esUrlZoom,
        cuentaRegresiva: cuentaRegresiva, estado: estado, puedeCambiar: puedeCambiar,
        generarHorarios: generarHorarios, agruparPorDia: agruparPorDia,
        tarjetaHtml: tarjetaHtml, avisoHtml: avisoHtml, grabacionHtml: grabacionHtml, selectorHtml: selectorHtml, reservaHtml: reservaHtml,
        cargar: cargar, disponibles: disponibles, reservar: reservar, cancelar: cancelar,
        tarjeta: tarjeta, avisoLimite: avisoLimite, montar: montar, montarDespuesDelHero: montarDespuesDelHero, agenda: agenda
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.SalaEvidencias = api;
})(typeof window !== 'undefined' ? window : this);
