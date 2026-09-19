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

    /* ---------- navegador (equipo) ---------- */
    function esperar(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
    async function llamar(token, body) {
        var r = await fetch('/api/subir-portafolio', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify(body) });
        var j = await r.json().catch(function () { return { success: false, error: 'Respuesta inválida (' + r.status + ')' }; });
        if (!j.success && !j.pendiente) throw new Error(j.error || ('Error ' + r.status));
        return j;
    }

    /* Copia UNA parte Zoom → NAS. Reanuda desde migracion.trozos_ok (se
       guarda después de cada trozo). o = { token(), parte, indice, total,
       nombre, curp, onProgreso(txt), guardarMigracion(mig) } */
    async function copiarParte(o) {
        var z = o.parte.zoom, trozos = planTrozos(z.bytes), et = 'Parte ' + (o.indice + 1) + ': ';
        var m0 = o.parte.migracion;
        var mig = m0 && esIdSubida(m0.upload_id) && m0.total === trozos.length ? m0 : { upload_id: nuevoIdSubida(), trozos_ok: 0, total: trozos.length };
        for (var i = mig.trozos_ok; i < trozos.length; i++) {
            var t = trozos[i], ok = false, ultimo = null;
            for (var intento = 1; intento <= 3 && !ok; intento++) {
                try { await llamar(await o.token(), { accion: 'zoom-trozo', uuid: z.uuid, fileId: z.file_id, uploadId: mig.upload_id, n: t.n, desde: t.desde, hasta: t.hasta }); ok = true; }
                catch (e) { ultimo = e; await esperar(2000 * intento); }
            }
            if (!ok) throw new Error(et + 'se detuvo en el trozo ' + t.n + ' de ' + trozos.length + ' (' + (ultimo && ultimo.message) + '). Vuelve a oprimir el botón: continúa donde se quedó.');
            mig = { upload_id: mig.upload_id, trozos_ok: t.n, total: trozos.length };
            await o.guardarMigracion(mig);
            o.onProgreso(et + Math.round(100 * (t.hasta + 1) / z.bytes) + ' % (trozo ' + t.n + ' de ' + trozos.length + ')');
        }
        o.onProgreso(et + 'armando el archivo en el NAS…');
        var cuerpo = { accion: 'zoom-cerrar', uploadId: mig.upload_id, nombre: o.nombre, curp: o.curp, inicio: z.inicio, parte: o.indice + 1, partes: o.total, bytes: z.bytes };
        var r = await llamar(await o.token(), cuerpo);
        for (var k = 0; r.pendiente && k < 40; k++) {
            o.onProgreso(et + 'el NAS sigue armando el archivo (puede tardar unos minutos)…');
            await esperar(15000);
            r = await llamar(await o.token(), Object.assign({}, cuerpo, { soloVerificar: true }));
        }
        if (r.pendiente) throw new Error(et + 'el NAS no terminó de armar el archivo. Vuelve a oprimir el botón en unos minutos.');
        return { ruta: r.ruta, bytes: r.bytes };
    }

    var ESTADO_RESERVA = { reservada: 'Reservada', asistio: 'Asistió', no_asistio: 'No asistió', cancelada: 'Cancelada' };
    function mb(b) { return (b / 1048576).toFixed(0) + ' MB'; }
    function aLocalMx(iso) { var S = root.SalaEvidencias; return S.fechaISO(Date.parse(iso)) + 'T' + S.hora(iso); }
    function deLocalMx(v) { var p = String(v || '').split('T'); return p.length === 2 ? root.SalaEvidencias.mxAIso(p[0], p[1].slice(0, 5)) : null; }

    /* ctx = { email, row, ev: () => evaluacion actual, guardar(cambios) → Promise<bool>,
               token: async () => access_token, yo, faltaSql } */
    async function montarTarjeta(el, ctx) {
        if (!el) return;
        var S = root.SalaEvidencias, esc = S._esc, sb = root.supabaseClient;
        var st = { reserva: null, limite: null, error: '', resultados: null, prog: '', ocupado: false };
        var pd = (ctx.row && ctx.row.autodiagnostico_data && ctx.row.autodiagnostico_data.personalData) || {};
        var nombre = pd.nombre || (ctx.row && ctx.row.nombre) || '', curp = pd.curp || (ctx.row && ctx.row.curp) || '';
        try {
            var r = await Promise.all([
                sb.from('reservas_evidencia').select('id,estado,created_at,horarios_evidencia(inicio,fin)').eq('email', ctx.email).neq('estado', 'cancelada').order('created_at', { ascending: false }).limit(1),
                sb.rpc('limite_evidencia_para', { p_email: ctx.email })
            ]);
            if (r[0].error) st.error = 'Para la sala de evidencias hay que correr 2026-09-18-sala-evidencias.sql (' + (r[0].error.message || r[0].error) + ')';
            var x = (r[0].data || [])[0];
            st.reserva = x && x.horarios_evidencia ? { estado: x.estado, inicio: x.horarios_evidencia.inicio, fin: x.horarios_evidencia.fin } : null;
            st.limite = r[1].error ? null : r[1].data;
        } catch (e) { st.error = String(e.message || e); }

        function partes() { return partesDe(ctx.ev()); }
        async function guardarPartes(lista, extra) {
            var v = Object.assign({}, (ctx.ev() && ctx.ev().video) || {}, { partes: lista }, extra || {});
            return ctx.guardar({ video: v });
        }
        function html() {
            var ev = ctx.ev() || {}, ps = partes(), v = ventanaBusqueda(st.reserva);
            var h = st.error ? '<div class="crm-note">' + esc(st.error) + '</div>' : '';
            h += '<p><strong>Horario en la sala:</strong> ' + (st.reserva ? esc(S.fechaLarga(st.reserva.inicio)) + ' · ' + esc(S.horarioTexto(st.reserva.inicio, st.reserva.fin)) + ' <span class="crm-chip">' + esc(ESTADO_RESERVA[st.reserva.estado] || st.reserva.estado) + '</span>' : '<span class="crm-muted">sin horario</span>') + '</p>';
            h += '<p><strong>Fecha límite de evidencia:</strong> ' + (st.limite ? esc(S.fechaLarga(st.limite)) + (ev.limite_evidencia ? ' <span class="crm-chip info">extendida</span>' : '') : '<span class="crm-muted">— (Alineación sin pagar)</span>') + '</p>';
            h += '<div class="ev-acciones"><input type="date" id="gzLimite" value="' + esc(ev.limite_evidencia || '') + '" aria-label="Nueva fecha límite">' +
                 '<button type="button" class="crm-btn crm-btn-sm crm-btn-primary" id="gzGuardarLimite"' + (ctx.faltaSql ? ' disabled' : '') + '>Extender fecha límite</button>' +
                 (ev.limite_evidencia ? '<button type="button" class="crm-btn crm-btn-sm crm-btn-ghost" style="border-color:var(--border);color:var(--text-bright);background:var(--surface-2);" id="gzQuitarLimite">Quitar extensión</button>' : '') + '</div>';
            h += '<h3 style="margin:14px 0 6px;font-size:.95rem;">Grabación ligada</h3>';
            if (!ps.length) h += '<p class="crm-muted">Todavía no se liga ninguna grabación. Búscala abajo.</p>';
            ps.forEach(function (p, i) {
                var z = p.zoom || {};
                var estado = p.nas && p.nas.ruta ? '<span class="crm-chip ok">En el NAS</span> <span class="crm-muted" style="word-break:break-all;">' + esc(p.nas.ruta) + '</span>'
                    : p.migracion ? '<span class="crm-chip">Copiado ' + p.migracion.trozos_ok + ' de ' + p.migracion.total + '</span>' : '<span class="crm-chip">Solo en Zoom</span>';
                h += '<div class="ev-etapa"><div class="nombre"><strong>Parte ' + (i + 1) + '</strong> · ' + esc(S.fechaCorta(z.inicio)) + ' ' + esc(S.hora(z.inicio)) + ' h · ' + mb(z.bytes || 0) +
                     (z.share_url ? ' · <a href="' + esc(z.share_url) + '" target="_blank" rel="noopener">ver en Zoom</a>' : '') + '<div>' + estado + '</div></div>' +
                     '<div class="acciones">' + (p.nas && p.nas.ruta ? '' : '<button type="button" class="crm-btn crm-btn-sm crm-btn-primary" data-gz-copiar="' + i + '"' + (st.ocupado ? ' disabled' : '') + '>' + (p.migracion ? 'Continuar copia' : 'Copiar al expediente (NAS)') + '</button>') + '</div></div>';
            });
            if (ps.length) {
                var puede = puedeBorrarDeZoom(ev);
                h += '<div class="ev-acciones"><button type="button" class="crm-btn crm-btn-sm crm-btn-danger" id="gzBorrar"' + (puede && !st.ocupado ? '' : ' disabled') + ' title="' + (puede ? '' : 'Se habilita con todas las partes en el NAS y el certificado entregado') + '">Borrar de Zoom</button>' +
                     (ev.video && ev.video.borrada_zoom ? '<span class="crm-chip">Borrada de Zoom ' + esc(S.fechaCorta(ev.video.borrada_zoom.fecha)) + '</span>' : '') + '</div>';
            }
            h += '<div class="ev-progreso" id="gzProg" role="status">' + esc(st.prog) + '</div>';
            h += '<h3 style="margin:14px 0 6px;font-size:.95rem;">Buscar en Zoom</h3><div class="ev-acciones">' +
                 '<label>Desde <input type="datetime-local" id="gzDesde" value="' + esc(v ? aLocalMx(v.desde) : '') + '"></label>' +
                 '<label>Hasta <input type="datetime-local" id="gzHasta" value="' + esc(v ? aLocalMx(v.hasta) : '') + '"></label>' +
                 '<button type="button" class="crm-btn crm-btn-sm crm-btn-primary" id="gzBuscar"' + (st.ocupado ? ' disabled' : '') + '>Buscar grabación en Zoom</button></div>';
            if (st.resultados) {
                h += st.resultados.length ? '<ul class="ev-items">' + st.resultados.map(function (g, i) {
                    var a = archivoPrincipal(g.archivos);
                    return '<li><label><input type="checkbox" data-gz-sel="' + i + '"> ' + esc(S.fechaCorta(g.inicio)) + ' ' + esc(S.hora(g.inicio)) + ' h · ' + g.duracion + ' min · ' + mb(a.bytes) + ' · ' + esc(a.tipo) + '</label></li>';
                }).join('') + '</ul><button type="button" class="crm-btn crm-btn-sm crm-btn-primary" id="gzLigar">Ligar seleccionadas</button>'
                    : '<p class="crm-muted">No hay grabaciones de la sala en ese rango (Zoom tarda unos minutos en procesarlas).</p>';
            }
            return h;
        }
        function prog(t) { st.prog = t; var p = el.querySelector('#gzProg'); if (p) p.textContent = t; }
        function pintar() { el.innerHTML = html(); conectar(); }
        async function conToken() { return ctx.token(); }
        function conectar() {
            var q = function (s) { return el.querySelector(s); };
            if (q('#gzGuardarLimite')) q('#gzGuardarLimite').addEventListener('click', async function () {
                var f = q('#gzLimite').value; if (!f) { prog('Elige la nueva fecha límite.'); return; }
                if (await ctx.guardar({ limite_evidencia: f })) { st.limite = f; pintar(); prog('Fecha límite extendida al ' + S.fechaLarga(f) + '.'); }
            });
            if (q('#gzQuitarLimite')) q('#gzQuitarLimite').addEventListener('click', async function () {
                if (!confirm('¿Quitar la extensión? Vuelve la fecha calculada desde el pago de Alineación.')) return;
                if (await ctx.guardar({ limite_evidencia: null })) { var r = await sb.rpc('limite_evidencia_para', { p_email: ctx.email }); st.limite = r.error ? null : r.data; pintar(); }
            });
            if (q('#gzBuscar')) q('#gzBuscar').addEventListener('click', async function () {
                var d = deLocalMx(q('#gzDesde').value), h = deLocalMx(q('#gzHasta').value);
                if (!d || !h) { prog('Indica desde y hasta.'); return; }
                st.ocupado = true; pintar(); prog('Buscando en Zoom…');
                try { var r = await llamar(await conToken(), { accion: 'zoom-buscar', desde: d, hasta: h }); st.resultados = r.grabaciones || []; prog(''); }
                catch (e) { prog('No se pudo buscar: ' + e.message); }
                st.ocupado = false; pintar();
            });
            if (q('#gzLigar')) q('#gzLigar').addEventListener('click', async function () {
                var sel = [].slice.call(el.querySelectorAll('[data-gz-sel]:checked')).map(function (c) { return st.resultados[Number(c.getAttribute('data-gz-sel'))]; });
                if (!sel.length) { prog('Marca al menos una grabación.'); return; }
                if (partes().some(function (p) { return p.nas && p.nas.ruta; }) && !confirm('Ya hay partes copiadas al NAS. ¿Reemplazar la grabación ligada? (los archivos del NAS no se borran)')) return;
                var lista = sel.map(function (g) { var a = archivoPrincipal(g.archivos); return { zoom: { uuid: g.uuid, file_id: a.id, inicio: a.inicio || g.inicio, bytes: a.bytes, share_url: g.share_url, clave: g.clave } }; });
                if (await guardarPartes(lista)) { st.resultados = null; pintar(); prog(lista.length + (lista.length === 1 ? ' grabación ligada. ' : ' grabaciones ligadas. ') + 'Ahora cópiala al NAS.'); }
            });
            el.querySelectorAll('[data-gz-copiar]').forEach(function (b) {
                b.addEventListener('click', async function () {
                    var i = Number(b.getAttribute('data-gz-copiar'));
                    if (!nombre && !curp) { prog('El candidato no tiene nombre ni CURP en su Autodiagnóstico.'); return; }
                    st.ocupado = true; pintar();
                    try {
                        var res = await copiarParte({
                            token: conToken, parte: partes()[i], indice: i, total: partes().length, nombre: nombre, curp: curp, onProgreso: prog,
                            guardarMigracion: function (mig) { var l = partes().slice(); l[i] = Object.assign({}, l[i], { migracion: mig }); return guardarPartes(l); }
                        });
                        var l = partes().slice(); l[i] = Object.assign({}, l[i], { nas: { ruta: res.ruta, bytes: res.bytes, fecha: new Date().toISOString(), por: ctx.yo } });
                        delete l[i].migracion;
                        await guardarPartes(l);
                        st.ocupado = false; pintar(); prog('Parte ' + (i + 1) + ' guardada en el NAS (' + mb(res.bytes) + ', mismo tamaño que en Zoom).');
                    } catch (e) { st.ocupado = false; pintar(); prog(e.message); }
                });
            });
            if (q('#gzBorrar')) q('#gzBorrar').addEventListener('click', async function () {
                if (!confirm('¿Mandar la grabación a la papelera de Zoom? Se puede recuperar en Zoom durante 30 días. La copia del NAS se queda.')) return;
                st.ocupado = true; pintar();
                try {
                    for (var i = 0; i < partes().length; i++) { prog('Borrando parte ' + (i + 1) + ' de Zoom…'); await llamar(await conToken(), { accion: 'zoom-borrar', uuid: partes()[i].zoom.uuid, email: ctx.email }); }
                    await guardarPartes(partes(), { borrada_zoom: { fecha: new Date().toISOString(), por: ctx.yo } });
                    st.ocupado = false; pintar(); prog('Grabación enviada a la papelera de Zoom.');
                } catch (e) { st.ocupado = false; pintar(); prog('No se pudo borrar: ' + e.message); }
            });
        }
        pintar();
    }

    var api = {
        TROZO: TROZO, planTrozos: planTrozos, archivoPrincipal: archivoPrincipal, nombreGrabacion: nombreGrabacion,
        ventanaBusqueda: ventanaBusqueda, esIdSubida: esIdSubida, nuevoIdSubida: nuevoIdSubida,
        partesDe: partesDe, puedeBorrarDeZoom: puedeBorrarDeZoom, copiarParte: copiarParte, montarTarjeta: montarTarjeta
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.GrabacionZoom = api;
})(typeof window !== 'undefined' ? window : this);
