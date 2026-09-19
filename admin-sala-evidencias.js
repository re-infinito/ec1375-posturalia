/* =========================================================
   admin-sala-evidencias.js — Pestaña "Sala de evidencias" de
   admin-sesiones.html (18 sep 2026): configuración de la sala de Zoom,
   plantilla semanal de horarios y lista de horarios con quién reservó.
   La lógica de la plantilla es SalaEvidencias.generarHorarios (probada).
========================================================= */
(function (root) {
    'use strict';
    var S = root.SalaEvidencias, esc = S._esc;
    var ESTADOS = { reservada: 'Reservada', asistio: 'Asistió', no_asistio: 'No asistió' };
    var DIAS = [[1, 'Lun'], [2, 'Mar'], [3, 'Mié'], [4, 'Jue'], [5, 'Vie'], [6, 'Sáb'], [0, 'Dom']];
    var st = { el: null, yo: '', cfg: {}, horarios: [], reservas: [], nombres: {}, error: '', vista: null, msg: '' };
    function sb() { return root.supabaseClient; }

    async function cargar() {
        var desde = new Date(Date.now() - 14 * 86400000).toISOString();
        var r = await Promise.all([
            sb().from('sala_evidencias_config').select('*').eq('id', 1).maybeSingle(),
            sb().from('horarios_evidencia').select('id,inicio,fin,colchon_min').gte('inicio', desde).order('inicio'),
            sb().from('reservas_evidencia').select('id,horario_id,email,estado').in('estado', ['reservada', 'asistio', 'no_asistio']),
            sb().rpc('admin_lista_nombres')
        ]);
        var err = r[0].error || r[1].error || r[2].error;
        st.error = err ? 'Hay que correr 2026-09-18-sala-evidencias.sql en Supabase (' + (err.message || err) + ')' : '';
        st.cfg = r[0].data || {}; st.horarios = r[1].data || []; st.reservas = r[2].data || [];
        st.nombres = {}; (r[3].data || []).forEach(function (x) { if (x && x.email) st.nombres[x.email.toLowerCase()] = x.nombre; });
    }
    function reservaDe(hid) { return st.reservas.filter(function (x) { return x.horario_id === hid; })[0] || null; }
    function manana() { return S.sumarDias(S.fechaISO(Date.now()), 1); }

    function html() {
        var c = st.cfg, v = st.vista;
        var h = st.error ? '<div class="alert alert-error" style="margin-bottom:14px;">' + esc(st.error) + '</div>' : '';
        h += st.msg ? '<p role="status" style="font-weight:600;margin-bottom:12px;">' + esc(st.msg) + '</p>' : '';
        h += '<h2 style="margin-bottom:12px;">Configuración de la sala</h2><p style="font-size:.84rem;margin-bottom:12px;">El enlace y la clave nunca se muestran al candidato fuera de su horario. Si cambias la sala en Zoom, actualízala aquí.</p>' +
            '<div class="grid-2"><div class="form-group"><label>Enlace de invitación de Zoom *</label><input type="url" id="saUrl" value="' + esc(c.zoom_url || '') + '" placeholder="https://us06web.zoom.us/j/…"></div>' +
            '<div class="form-group"><label>ID de reunión</label><input type="text" id="saId" value="' + esc(c.zoom_id || '') + '" placeholder="827 5726 3451"></div></div>' +
            '<div class="grid-2"><div class="form-group"><label>Clave de acceso</label><input type="text" id="saClave" value="' + esc(c.zoom_clave || '') + '"></div>' +
            '<div class="form-group"><label>Días para entregar la evidencia (desde el pago de Alineación)</label><input type="number" id="saDias" min="1" max="365" value="' + esc(c.dias_limite || 30) + '"></div></div>' +
            '<div class="grid-2"><div class="form-group"><label>Minutos antes en que se abre la sala</label><input type="number" id="saAntes" min="0" max="60" value="' + esc(c.minutos_antes === undefined ? 10 : c.minutos_antes) + '"></div>' +
            '<div class="form-group"><label>Horas mínimas para cambiar o cancelar</label><input type="number" id="saCambio" min="0" max="168" value="' + esc(c.horas_cambio === undefined ? 24 : c.horas_cambio) + '"></div></div>' +
            '<button type="button" class="btn btn-primary" id="saGuardar">Guardar configuración</button>';
        h += '<h2 style="margin:28px 0 12px;">Crear horarios con plantilla semanal</h2>' +
            '<div class="form-group"><label>Días</label><div style="display:flex;flex-wrap:wrap;gap:10px;">' + DIAS.map(function (d) { return '<label style="display:flex;gap:4px;align-items:center;"><input type="checkbox" data-sa-dia="' + d[0] + '"> ' + d[1] + '</label>'; }).join('') + '</div></div>' +
            '<div class="form-group"><label>Horas de inicio (hora de México, separadas por coma)</label><input type="text" id="saHoras" placeholder="09:00, 11:00, 16:00"></div>' +
            '<div class="grid-2"><div class="form-group"><label>Duración (min)</label><input type="number" id="saDur" value="90" min="15" max="300"></div>' +
            '<div class="form-group"><label>Colchón entre sesiones (min)</label><input type="number" id="saCol" value="15" min="0" max="120"></div></div>' +
            '<div class="grid-2"><div class="form-group"><label>Desde</label><input type="date" id="saDesde" value="' + manana() + '"></div>' +
            '<div class="form-group"><label>Hasta</label><input type="date" id="saHasta" value="' + S.sumarDias(manana(), 27) + '"></div></div>' +
            '<button type="button" class="btn btn-primary" id="saVista">Vista previa</button>';
        if (v) {
            h += v.error ? '<p style="margin-top:12px;color:var(--danger);">' + esc(v.error) + '</p>'
                : '<p style="margin-top:12px;">Se crearán <strong>' + v.nuevos.length + '</strong> horarios' + (v.omitidos.length ? ' · se omiten ' + v.omitidos.length + ' (ya pasaron o se traslapan)' : '') + '.</p>' +
                  '<ul style="max-height:220px;overflow:auto;font-size:.84rem;margin:8px 0 12px 18px;">' + v.nuevos.slice(0, 60).map(function (x) { return '<li>' + esc(S.fechaLarga(x.inicio)) + ' · ' + esc(S.horarioTexto(x.inicio, x.fin)) + '</li>'; }).join('') + (v.nuevos.length > 60 ? '<li>…</li>' : '') + '</ul>' +
                  (v.nuevos.length ? '<button type="button" class="btn btn-primary" id="saCrear">Crear ' + v.nuevos.length + ' horarios</button>' : '');
        }
        var ahora = Date.now();
        var futuros = st.horarios.filter(function (x) { return Date.parse(x.fin) >= ahora; }), pasados = st.horarios.filter(function (x) { return Date.parse(x.fin) < ahora; }).reverse();
        function fila(x, pasado) {
            var r = reservaDe(x.id), quien = r ? esc(st.nombres[r.email.toLowerCase()] || r.email) + ' <span style="opacity:.7">(' + esc(ESTADOS[r.estado] || r.estado) + ')</span>' : '<span style="opacity:.7">Libre</span>';
            var acc = !r && !pasado ? '<button type="button" class="btn" style="padding:6px 10px;" data-sa-borrar="' + esc(x.id) + '">Borrar</button>'
                : r && pasado ? '<button type="button" class="btn" style="padding:6px 10px;" data-sa-marcar="' + esc(r.id) + '" data-estado="asistio">Asistió</button> <button type="button" class="btn" style="padding:6px 10px;" data-sa-marcar="' + esc(r.id) + '" data-estado="no_asistio">No asistió</button>' : '';
            return '<tr><td>' + esc(S.fechaCorta(x.inicio)) + '</td><td>' + esc(S.horarioTexto(x.inicio, x.fin)) + '</td><td>' + quien + '</td><td>' + acc + '</td></tr>';
        }
        var tabla = function (l, pasado) { return l.length ? '<div class="table-wrap" style="overflow-x:auto;"><table style="width:100%;"><thead><tr><th>Fecha</th><th>Horario</th><th>Candidato</th><th></th></tr></thead><tbody>' + l.map(function (x) { return fila(x, pasado); }).join('') + '</tbody></table></div>' : '<p style="opacity:.7">Ninguno.</p>'; };
        h += '<h2 style="margin:28px 0 12px;">Próximos horarios</h2>' + tabla(futuros, false) + '<h2 style="margin:28px 0 12px;">Últimos 14 días</h2>' + tabla(pasados, true);
        return h;
    }
    function pintar() { st.el.innerHTML = html(); conectar(); }
    function aviso(m) { st.msg = m; pintar(); }
    function conectar() {
        var q = function (s) { return st.el.querySelector(s); };
        q('#saGuardar').addEventListener('click', async function () {
            var url = q('#saUrl').value.trim();
            if (!S.esUrlZoom(url)) { aviso('El enlace debe ser de zoom.us (https://…zoom.us/j/…).'); return; }
            var cambios = { zoom_url: url, zoom_id: q('#saId').value.trim(), zoom_clave: q('#saClave').value.trim(), dias_limite: Number(q('#saDias').value) || 30,
                minutos_antes: Math.max(0, Number(q('#saAntes').value) || 0), horas_cambio: Math.max(0, Number(q('#saCambio').value) || 0), updated_at: new Date().toISOString(), updated_by: st.yo };
            var r = await sb().from('sala_evidencias_config').update(cambios).eq('id', 1).select().maybeSingle();
            if (r.error) { aviso('No se pudo guardar: ' + (r.error.message || r.error)); return; }
            st.cfg = r.data || Object.assign(st.cfg, cambios); aviso('Configuración guardada.');
        });
        q('#saVista').addEventListener('click', function () {
            var dias = [].slice.call(st.el.querySelectorAll('[data-sa-dia]:checked')).map(function (c) { return Number(c.getAttribute('data-sa-dia')); });
            var horas = q('#saHoras').value.split(',').map(function (s) { var m = /^\s*(\d{1,2}):(\d{2})\s*$/.exec(s); return m ? ('0' + m[1]).slice(-2) + ':' + m[2] : null; }).filter(Boolean);
            if (!dias.length || !horas.length) { st.vista = { error: 'Elige al menos un día y una hora (formato 09:00).', nuevos: [], omitidos: [] }; pintar(); return; }
            st.vista = S.generarHorarios({ dias: dias, horas: horas, duracion: Number(q('#saDur').value), colchon: Number(q('#saCol').value), desde: q('#saDesde').value, hasta: q('#saHasta').value }, st.horarios, Date.now());
            st.msg = ''; pintar();
        });
        if (q('#saCrear')) q('#saCrear').addEventListener('click', async function () {
            var filas = st.vista.nuevos.map(function (x) { return { inicio: x.inicio, fin: x.fin, colchon_min: x.colchon_min, creado_por: st.yo }; });
            var r = await sb().from('horarios_evidencia').insert(filas);
            if (r.error) { aviso(r.error.code === '23P01' ? 'Algún horario se traslapa con otro creado mientras tanto. Vuelve a generar la vista previa.' : 'No se pudo crear: ' + (r.error.message || r.error)); return; }
            st.vista = null; await cargar(); aviso(filas.length + ' horarios creados.');
        });
        st.el.querySelectorAll('[data-sa-borrar]').forEach(function (b) {
            b.addEventListener('click', async function () {
                if (!confirm('¿Borrar este horario libre?')) return;
                var r = await sb().from('horarios_evidencia').delete().eq('id', b.getAttribute('data-sa-borrar'));
                if (r.error) { aviso('No se pudo borrar: ' + (r.error.message || r.error)); return; }
                await cargar(); aviso('Horario borrado.');
            });
        });
        st.el.querySelectorAll('[data-sa-marcar]').forEach(function (b) {
            b.addEventListener('click', async function () {
                var r = await sb().from('reservas_evidencia').update({ estado: b.getAttribute('data-estado'), updated_at: new Date().toISOString(), por: st.yo }).eq('id', b.getAttribute('data-sa-marcar'));
                if (r.error) { aviso('No se pudo marcar: ' + (r.error.message || r.error)); return; }
                await cargar(); aviso('Asistencia registrada.');
            });
        });
    }
    async function montar(el) {
        if (!el) return;
        st.el = el;
        var s = root.Auth ? await root.Auth.getSession() : null;
        st.yo = s && s.user ? s.user.email.toLowerCase() : '';
        el.innerHTML = '<p>Cargando…</p>';
        await cargar();
        pintar();
    }
    root.AdminSala = { montar: montar };
})(window);
