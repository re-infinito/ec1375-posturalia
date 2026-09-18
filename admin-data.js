/* =========================================================
   admin-data.js — carga y cálculos compartidos del CRM del equipo
   (admin-crm.html, admin-candidatos.html, sección de pagos de
   admin-utilidades.html).

   Excepción deliberada a "páginas sin módulos compartidos" (ver Claude.md),
   acotada a páginas admin: los KPIs y el reparto ya estaban duplicados entre
   admin-kpis.html y admin-utilidades.html; el panel y la lista de candidatos
   los necesitan igual, y una tercera/cuarta copia se desincroniza. Las
   fórmulas de kpis() y reparto() son un port EXACTO de calcularKPIs() y
   calcularReparto() de esas páginas (que siguen con su copia local; backlog).

   El paso de cada candidato sale de FlowStatus.computeSteps() (misma lógica
   que ve el candidato) y sus documentos de CrmShell._helpers — nunca una
   copia. Cargable en Node para pruebas (tests/admin-data.test.js).
========================================================= */
(function () {
    'use strict';

    var FS = (typeof FlowStatus !== 'undefined') ? FlowStatus : require('./flow-status.js');
    var CS = (typeof CrmShell !== 'undefined') ? CrmShell : require('./crm-shell.js');
    var H = CS._helpers;

    var FASES = ['registro', 'alineacion', 'evaluacion', 'entrega'];
    var FASE_LABEL = { registro: 'Registro', alineacion: 'Alineación', evaluacion: 'Evaluación', entrega: 'Entrega' };
    var SOCIOS = [
        { id: 'chris', label: 'Christherapy' },
        { id: 'fernando', label: 'Fernando' },
        { id: 'lot', label: 'Lot' },
        { id: 'diego', label: 'Diego' }
    ];
    var BYPASS_EMAIL = 'paideia.tech@outlook.com';
    var CONFIG_DEFAULT = { incluir_chris: true, porcentaje_chris: 50, porcentaje_fernando: 16.67, porcentaje_lot: 16.67, porcentaje_diego: 16.67, notas: '' };
    var PASOS_EXTRA = { sin_iniciar: 'Sin iniciar', esperando_evaluador: 'Esperando evaluador', certificado: 'Certificado entregado' };

    /* ---------- índices ---------- */

    function indexar(datos) {
        if (datos._idx) return datos._idx;
        var pagosPorEmail = {}, pagosOrigen = {};
        (datos.pagos || []).forEach(function (r) {
            if (!pagosPorEmail[r.email]) { pagosPorEmail[r.email] = {}; pagosOrigen[r.email] = {}; }
            pagosPorEmail[r.email][r.fase] = true;
            pagosOrigen[r.email][r.fase] = r.origen || 'manual';
        });
        var rowsByEmail = {};
        (datos.candidatosRows || []).forEach(function (r) { if (r && r.email) rowsByEmail[r.email.toLowerCase()] = r; });
        var nombres = {};
        (datos.nombres || []).forEach(function (r) { if (r && r.email) nombres[r.email.toLowerCase()] = r.nombre; });
        var evaluaciones = {};
        (datos.evaluaciones || []).forEach(function (r) { if (r && r.email) evaluaciones[r.email.toLowerCase()] = r; });
        var configLotes = {};
        (datos.reparto || []).forEach(function (r) { configLotes[r.lote] = r; });
        datos._idx = { pagosPorEmail: pagosPorEmail, pagosOrigen: pagosOrigen, rowsByEmail: rowsByEmail, nombres: nombres, configLotes: configLotes, evaluaciones: evaluaciones };
        return datos._idx;
    }

    function tienePago(datos, email, fase) {
        var idx = indexar(datos);
        return !!(idx.pagosPorEmail[email] && idx.pagosPorEmail[email][fase]);
    }

    function visibles(datos) {
        return (datos.precio || []).filter(function (c) { return c.estado !== 'administrador'; });
    }

    /* ---------- KPIs (port de admin-kpis.html · calcularKPIs) ---------- */

    function kpis(datos, lote) {
        var vis = visibles(datos);
        if (lote) vis = vis.filter(function (c) { return (c.lote || 1) === lote; });
        var activos = vis.filter(function (c) { return (c.estado || 'activo') === 'activo'; });
        var desistieron = vis.filter(function (c) { return c.estado === 'desistió'; });
        var cambioLote = vis.filter(function (c) { return c.estado === 'cambio_lote'; });

        var porFase = {};
        FASES.forEach(function (f) { porFase[f] = activos.filter(function (c) { return tienePago(datos, c.email, f); }).length; });

        /* Ingresos: dinero YA cobrado — incluye a quien desistió o cambió de lote. */
        var ingresosPorFase = {};
        FASES.forEach(function (f) {
            ingresosPorFase[f] = vis.reduce(function (sum, c) { return tienePago(datos, c.email, f) ? sum + (c['monto_' + f] || 0) : sum; }, 0);
        });
        var ingresosTotales = FASES.reduce(function (a, f) { return a + ingresosPorFase[f]; }, 0);
        /* Proyectado: solo lo que se espera cobrar de candidatos activos. */
        var proyectado = activos.reduce(function (sum, c) { return sum + (c.total_acordado || 0); }, 0);
        var totalInscritos = activos.length;
        var conv = {
            registro: totalInscritos > 0 ? Math.round((porFase.registro / totalInscritos) * 100) : 0,
            alineacion: porFase.registro > 0 ? Math.round((porFase.alineacion / porFase.registro) * 100) : 0,
            evaluacion: porFase.alineacion > 0 ? Math.round((porFase.evaluacion / porFase.alineacion) * 100) : 0,
            entrega: porFase.evaluacion > 0 ? Math.round((porFase.entrega / porFase.evaluacion) * 100) : 0
        };
        return {
            totalInscritos: totalInscritos, completados: porFase.entrega, porFase: porFase, ingresosPorFase: ingresosPorFase,
            ingresosTotales: ingresosTotales, proyectado: proyectado, conv: conv,
            desistieron: desistieron.length, cambioLote: cambioLote.length, totalRegistrados: vis.length
        };
    }

    /* ---------- Utilidades (port de admin-utilidades.html + pagos) ---------- */

    function configLote(datos, lote) {
        var c = indexar(datos).configLotes[lote];
        if (!c) return Object.assign({}, CONFIG_DEFAULT);
        return {
            incluir_chris: c.incluir_chris !== false,
            porcentaje_chris: Number(c.porcentaje_chris) || 0, porcentaje_fernando: Number(c.porcentaje_fernando) || 0,
            porcentaje_lot: Number(c.porcentaje_lot) || 0, porcentaje_diego: Number(c.porcentaje_diego) || 0, notas: c.notas || ''
        };
    }

    function ingresosLote(datos, lote) {
        return visibles(datos).filter(function (c) { return (c.lote || 1) === lote; }).reduce(function (sum, c) {
            var t = 0;
            FASES.forEach(function (f) { if (tienePago(datos, c.email, f)) t += c['monto_' + f] || 0; });
            return sum + t;
        }, 0);
    }

    /* Gastos que se descuentan antes de repartir (gastos_utilidades, 18 sep).
       'por_certificado' = monto × candidatos ACTIVOS del lote (quien desistió o
       cambió de lote no recibe certificado, así que no genera el cobro);
       'fijo' = monto único. lote null = aplica a todos los lotes. */
    function gastosLote(datos, lote) {
        var certificados = visibles(datos).filter(function (c) {
            return (c.lote || 1) === lote && (c.estado || 'activo') === 'activo';
        }).length;
        var items = (datos.gastos || []).filter(function (g) {
            return g.lote === null || g.lote === undefined || Number(g.lote) === Number(lote);
        }).map(function (g) {
            var monto = Number(g.monto) || 0;
            var porCert = g.tipo === 'por_certificado';
            var cantidad = porCert ? certificados : 1;
            return { id: g.id, lote: (g.lote === null || g.lote === undefined) ? null : Number(g.lote), concepto: g.concepto || '', tipo: g.tipo, monto: monto, cantidad: cantidad, total: monto * cantidad };
        });
        return { items: items, certificados: certificados, total: items.reduce(function (a, g) { return a + g.total; }, 0) };
    }

    function utilidades(datos, lote) {
        var config = configLote(datos, lote);
        var ingresos = ingresosLote(datos, lote);
        var gastos = gastosLote(datos, lote);
        /* Utilidad neta = ingresos − gastos. Si los gastos superan lo cobrado no
           hay nada que repartir (nunca reparto negativo); `neto` conserva el faltante. */
        var neto = ingresos - gastos.total;
        var base = Math.max(0, neto);
        var pagos = (datos.utilidadesPagos || []).filter(function (p) { return Number(p.lote) === Number(lote); });
        var socios = SOCIOS.filter(function (s) { return s.id !== 'chris' || config.incluir_chris; }).map(function (s) {
            var pct = Number(config['porcentaje_' + s.id]) || 0;
            var aRepartir = Math.round((base * pct) / 100);
            var pagado = pagos.filter(function (p) { return p.socio === s.id; }).reduce(function (a, p) { return a + (Number(p.monto) || 0); }, 0);
            return { id: s.id, label: s.label, pct: pct, aRepartir: aRepartir, pagado: pagado, pendiente: Math.max(0, aRepartir - pagado) };
        });
        return {
            lote: lote, ingresos: ingresos, gastos: gastos, neto: neto, config: config, socios: socios,
            aRepartir: socios.reduce(function (a, s) { return a + s.aRepartir; }, 0),
            pagado: socios.reduce(function (a, s) { return a + s.pagado; }, 0),
            pendiente: socios.reduce(function (a, s) { return a + s.pendiente; }, 0)
        };
    }

    function lotes(datos) {
        var set = {};
        visibles(datos).forEach(function (c) { set[c.lote || 1] = true; });
        (datos.reparto || []).forEach(function (r) { set[r.lote] = true; });
        return Object.keys(set).map(Number).sort(function (a, b) { return a - b; });
    }

    function utilidadesGlobal(datos) {
        var porLote = lotes(datos).map(function (l) { return utilidades(datos, l); });
        return {
            porLote: porLote,
            aRepartir: porLote.reduce(function (a, u) { return a + u.aRepartir; }, 0),
            pagado: porLote.reduce(function (a, u) { return a + u.pagado; }, 0),
            pendiente: porLote.reduce(function (a, u) { return a + u.pendiente; }, 0)
        };
    }

    /* ---------- Candidatos con su paso real ---------- */

    function candidatos(datos) {
        var idx = indexar(datos);
        /* Un evaluador (18 sep) no lee candidatos_precio ni los pagos: su
           lista sale de las filas del RPC, con las fases que el RPC regresa
           en fases_pagadas (2026-09-18-centro-evaluador.sql). */
        var base = (datos.precio && datos.precio.length) ? datos.precio
            : (datos.candidatosRows || []).filter(function (r) { return r && r.email; })
                .map(function (r) { return { email: r.email.toLowerCase(), lote: 1, estado: 'activo', total_acordado: 0 }; });
        return base.map(function (c) {
            var email = (c.email || '').toLowerCase();
            var row = idx.rowsByEmail[email] || null;
            var fases = {};
            FASES.forEach(function (f) {
                fases[f] = tienePago(datos, c.email, f) || !!(row && Array.isArray(row.fases_pagadas) && row.fases_pagadas.indexOf(f) >= 0);
            });
            var steps = FS.computeSteps({ row: row, alineacionAuth: fases.alineacion, entregaAuth: fases.entrega, esBypass: email === BYPASS_EMAIL });
            var current = null; steps.forEach(function (s) { if (s.current) current = s; });
            var paso;
            if (!row) paso = { id: 'sin_iniciar', label: PASOS_EXTRA.sin_iniciar };
            else if (current) paso = { id: current.id, label: current.label };
            else if (steps[9].done) paso = { id: 'certificado', label: PASOS_EXTRA.certificado };
            else paso = { id: 'esperando_evaluador', label: PASOS_EXTRA.esperando_evaluador };
            var docs = H.contarDocumentos(row);
            return {
                email: c.email, nombre: (row && row.nombre) || idx.nombres[email] || c.nombre || '',
                curp: (row && row.curp) || null,
                lote: c.lote || 1, estado: c.estado || 'activo', totalAcordado: c.total_acordado || 0,
                fases: fases, fasePagada: H.faseMasAlta(fases), origenPagos: idx.pagosOrigen[c.email] || {},
                steps: steps, paso: paso, hechos: steps.filter(function (s) { return s.done; }).length,
                docs: docs, ultimaActividad: (row && row.updated_at) || null, tieneFila: !!row, row: row,
                evaluacion: idx.evaluaciones[email] || null
            };
        });
    }

    function porPaso(lista) {
        var ids = FS.FLOW_STEPS_META.map(function (m) { return m.id; }).concat(['esperando_evaluador', 'certificado', 'sin_iniciar']);
        var labels = {};
        FS.FLOW_STEPS_META.forEach(function (m) { labels[m.id] = m.label; });
        Object.assign(labels, PASOS_EXTRA);
        var counts = {};
        ids.forEach(function (id) { counts[id] = 0; });
        lista.filter(function (c) { return c.estado === 'activo'; }).forEach(function (c) { counts[c.paso.id] = (counts[c.paso.id] || 0) + 1; });
        return ids.map(function (id) { return { id: id, label: labels[id], n: counts[id] }; });
    }

    function ultimosPagos(datos, n) {
        var idx = indexar(datos);
        var precioPorEmail = {};
        (datos.precio || []).forEach(function (c) { precioPorEmail[(c.email || '').toLowerCase()] = c; });
        return (datos.pagos || []).slice().sort(function (a, b) {
            return String(b.autorizado_en || '').localeCompare(String(a.autorizado_en || ''));
        }).slice(0, n || 10).map(function (p) {
            var email = (p.email || '').toLowerCase();
            var c = precioPorEmail[email] || {};
            var row = idx.rowsByEmail[email];
            return {
                email: p.email, nombre: (row && row.nombre) || idx.nombres[email] || c.nombre || '',
                fase: p.fase, faseLabel: FASE_LABEL[p.fase] || p.fase,
                monto: Number(p.monto) || c['monto_' + p.fase] || 0, origen: p.origen || 'manual', fecha: p.autorizado_en || null
            };
        });
    }

    function proximasSesiones(datos) {
        return (datos.sesiones || []).slice().sort(function (a, b) { return String(a.fecha).localeCompare(String(b.fecha)); });
    }

    function atencion(datos, lista, now) {
        var ahora = (now || new Date()).getTime();
        var items = [];
        lista.filter(function (c) { return c.estado === 'activo'; }).forEach(function (c) {
            if (c.paso.id === 'certificado') return;
            if (!c.tieneFila && c.fases.registro) {
                items.push({ tipo: 'sin_iniciar', texto: (c.nombre || c.email) + ' pagó Registro y no ha iniciado su Autodiagnóstico', email: c.email, href: 'admin-candidatos.html?q=' + encodeURIComponent(c.email) });
                return;
            }
            if (c.ultimaActividad) {
                var dias = Math.floor((ahora - new Date(c.ultimaActividad).getTime()) / 86400000);
                if (dias >= 30 && c.paso.id !== 'esperando_evaluador') {
                    items.push({ tipo: 'inactivo', texto: (c.nombre || c.email) + ' lleva ' + dias + ' días sin avanzar (en ' + c.paso.label + ')', email: c.email, href: 'admin-candidatos.html?q=' + encodeURIComponent(c.email) });
                }
            }
            if (c.paso.id === 'esperando_evaluador') {
                items.push({ tipo: 'evaluador', texto: (c.nombre || c.email) + ' terminó todo: falta revisar su evaluación y autorizar Entrega', email: c.email, href: 'admin-precios.html' });
            }
        });
        (datos.sesiones || []).forEach(function (s) {
            if (!s.zoom_link) items.push({ tipo: 'sesion', texto: 'Sesión del ' + s.fecha + ' sin liga de Zoom', href: 'admin-sesiones.html' });
        });
        return items;
    }

    /* ---------- carga (solo navegador) ---------- */

    async function cargar() {
        var sb = (typeof supabaseClient !== 'undefined') ? supabaseClient : null;
        if (!sb) throw new Error('supabaseClient no disponible');
        var q = function (p) { return p.then(function (r) { return r; }, function (e) { return { data: null, error: e }; }); };
        var res = await Promise.all([
            q(sb.from('candidatos_precio').select('*').order('email')),
            q(sb.from('candidatos_fase_pagos').select('*')),
            q(sb.from('reparto_utilidades').select('*')),
            q(sb.from('utilidades_pagos').select('*').order('fecha', { ascending: false })),
            q(sb.from('gastos_utilidades').select('*').order('id')),
            q(sb.rpc('admin_lista_nombres')),
            q(sb.rpc('admin_lista_candidatos')),
            q(sb.from('evaluaciones').select('email,etapas,cedula,firma_candidato,portafolio')),
            fetch('/api/sesiones-alineacion').then(function (r) { return r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)); })
                .then(function (d) { return { data: d.sesiones || [], error: null }; }, function (e) { return { data: null, error: e }; })
        ]);
        var errores = {};
        var nombresClave = ['precio', 'pagos', 'reparto', 'utilidadesPagos', 'gastos', 'nombres', 'candidatosRows', 'evaluaciones', 'sesiones'];
        var datos = {};
        nombresClave.forEach(function (k, i) {
            datos[k] = res[i].data || (k === 'sesiones' ? null : []);
            if (res[i].error) errores[k] = (res[i].error.message || String(res[i].error));
        });
        datos.errores = errores;
        return datos;
    }

    /* Declaraciones del candidato (17 sep): qué aceptó y cuándo. Viven en el
       JSONB de Plan de Evaluación y de Evidencias (admin_lista_candidatos()
       ya los regresa, sin firmas). fecha = ISO de cuando la marcó, o null. */
    var DECLARACIONES = [
        { id: 'requisitos', label: 'Cumple los requisitos del EC1375', col: 'plan_evaluacion_data', ruta: ['planData', 'declaraciones', 'requisitos'] },
        { id: 'material', label: 'Dispone del material y equipo para su evaluación', col: 'plan_evaluacion_data', ruta: ['planData', 'declaraciones', 'material'] },
        { id: 'sinReembolsos', label: 'Acepta que no aplican reembolsos', col: 'plan_evaluacion_data', ruta: ['planData', 'declaraciones', 'sinReembolsos'] },
        { id: 'autenticidad', label: 'Declara auténticas sus evidencias', col: 'evidencias_data', ruta: ['planData', 'declaracionAutenticidad', 'fecha'] }
    ];
    function declaraciones(row) {
        return DECLARACIONES.map(function (d) {
            var v = row ? row[d.col] : null;
            d.ruta.forEach(function (k) { v = v && typeof v === 'object' ? v[k] : null; });
            return { id: d.id, label: d.label, fecha: typeof v === 'string' && v && !isNaN(Date.parse(v)) ? v : null };
        });
    }

    var AdminData = {
        FASES: FASES, FASE_LABEL: FASE_LABEL, SOCIOS: SOCIOS, PASOS_EXTRA: PASOS_EXTRA,
        cargar: cargar, kpis: kpis, utilidades: utilidades, gastosLote: gastosLote, utilidadesGlobal: utilidadesGlobal, lotes: lotes,
        candidatos: candidatos, porPaso: porPaso, ultimosPagos: ultimosPagos, proximasSesiones: proximasSesiones, atencion: atencion,
        declaraciones: declaraciones,
        fmtMX: function (n) { return '$' + Math.round(n || 0).toLocaleString('es-MX'); }
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = AdminData;
    if (typeof window !== 'undefined') window.AdminData = AdminData;
})();
