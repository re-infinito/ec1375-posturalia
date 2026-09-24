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
    /* Sala de evidencias (18 sep): en el navegador solo si la página cargó
       sala-evidencias.js (admin-crm.html); en Node se toma con require. */
    var SE = (typeof SalaEvidencias !== 'undefined') ? SalaEvidencias
        : (typeof module !== 'undefined' && module.exports ? require('./sala-evidencias.js') : null);

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
    /* Se registró por registro.html y nadie le ha capturado lote ni montos:
       existe en candidatos_ec1375 pero todavía no en candidatos_precio. */
    var ESTADO_PROSPECTO = 'prospecto';
    /* origen de candidatos_fase_pagos que pone autorizar_registro_inicial():
       la fase se abrió por la liga de registro, con un anticipo cuyo monto
       todavía nadie capturó. */
    var ORIGEN_ANTICIPO = 'registro-50';

    /* ---------- índices ---------- */

    function indexar(datos) {
        if (datos._idx) return datos._idx;
        var pagosPorEmail = {}, pagosOrigen = {}, pagosMonto = {};
        (datos.pagos || []).forEach(function (r) {
            if (!pagosPorEmail[r.email]) { pagosPorEmail[r.email] = {}; pagosOrigen[r.email] = {}; pagosMonto[r.email] = {}; }
            pagosPorEmail[r.email][r.fase] = true;
            pagosOrigen[r.email][r.fase] = r.origen || 'manual';
            /* null/vacío = nadie capturó cuánto entró (p. ej. liberación a mano
               con el badge, que no pide monto). Ojo: Number(null) es 0, así que
               el vacío se distingue ANTES de convertir. */
            pagosMonto[r.email][r.fase] = (r.monto === null || r.monto === undefined || r.monto === '') ? null : Number(r.monto);
        });
        var rowsByEmail = {};
        (datos.candidatosRows || []).forEach(function (r) { if (r && r.email) rowsByEmail[r.email.toLowerCase()] = r; });
        var nombres = {};
        (datos.nombres || []).forEach(function (r) { if (r && r.email) nombres[r.email.toLowerCase()] = r.nombre; });
        var evaluaciones = {};
        (datos.evaluaciones || []).forEach(function (r) { if (r && r.email) evaluaciones[r.email.toLowerCase()] = r; });
        var configLotes = {};
        (datos.reparto || []).forEach(function (r) { configLotes[r.lote] = r; });
        datos._idx = { pagosPorEmail: pagosPorEmail, pagosOrigen: pagosOrigen, pagosMonto: pagosMonto, rowsByEmail: rowsByEmail, nombres: nombres, configLotes: configLotes, evaluaciones: evaluaciones };
        return datos._idx;
    }

    function tienePago(datos, email, fase) {
        var idx = indexar(datos);
        return !!(idx.pagosPorEmail[email] && idx.pagosPorEmail[email][fase]);
    }

    /* Lo que DE VERDAD entró por esa fase de ese candidato.

       `candidatos_fase_pagos.monto` guarda el pago real: lo escribe el webhook
       de Mercado Pago y lo puede capturar el equipo al liberar a mano.
       `candidatos_precio.monto_<fase>` es solo el PRECIO DE LISTA.

       Hasta el 20 sep todos los ingresos se calculaban con el precio de lista,
       así que un anticipo se contaba como pago completo: con el 50% del
       registro, los KPIs reportaban $2,000 de $1,000 que habían entrado, y el
       reparto entre socios se hacía sobre dinero que no estaba en la cuenta.
       Ahora manda el monto real y el precio de lista queda solo de respaldo
       para cuando nadie lo capturó (liberaciones a mano viejas, que es como
       venía funcionando). `ultimosPagos()` ya usaba esta misma regla. */
    function montoCobrado(datos, filaPrecio, fase) {
        if (!tienePago(datos, filaPrecio.email, fase)) return 0;
        var idx = indexar(datos);
        var porFase = idx.pagosMonto[filaPrecio.email];
        var real = porFase ? porFase[fase] : null;
        if (typeof real === 'number' && isFinite(real) && real >= 0) return real;
        /* Fase abierta sola por la liga de registro (origen ORIGEN_ANTICIPO):
           sabemos que dejaron un anticipo pero NO cuánto, así que se cuenta 0
           hasta que el equipo capture la cifra real al darlo de alta. Aquí el
           precio de lista sería justo el error que se acaba de corregir: daría
           por cobrado el 100% de una fase que se pagó a medias. */
        var origen = (idx.pagosOrigen[filaPrecio.email] || {})[fase];
        if (origen === ORIGEN_ANTICIPO) return 0;
        return Number(filaPrecio['monto_' + fase]) || 0;
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
            ingresosPorFase[f] = vis.reduce(function (sum, c) { return sum + montoCobrado(datos, c, f); }, 0);
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
            FASES.forEach(function (f) { t += montoCobrado(datos, c, f); });
            return sum + t;
        }, 0);
    }

    /* Gastos que se descuentan antes de repartir (gastos_utilidades, 18 sep).
       'por_certificado' = monto × candidatos ACTIVOS del lote (quien desistió o
       cambió de lote no recibe certificado, así que no genera el cobro);
       'fijo' = monto único. lote null = aplica a todos los lotes.
       Dos tablas de costos (para): 'real' = lo que de verdad cobra el Centro
       Evaluador (reduce el total a repartir) y 'chris' = los costos con los que
       se calcula la base de Chris (solo aplican en lotes con Chris).
       `total`/`items` son los REALES; `chris` trae los de Chris. */
    function gastosLote(datos, lote) {
        var enLote = visibles(datos).filter(function (c) { return (c.lote || 1) === lote; });
        var certificados = enLote.filter(function (c) { return (c.estado || 'activo') === 'activo'; }).length;
        /* Candidatos que YA pagaron cada fase (activos, desistidos o cambio de
           lote: igual que los ingresos, porque ese costo ya se generó). */
        var pagaron = {};
        FASES.forEach(function (f) { pagaron[f] = enLote.filter(function (c) { return tienePago(datos, c.email, f); }).length; });
        var items = (datos.gastos || []).filter(function (g) {
            return g.lote === null || g.lote === undefined || Number(g.lote) === Number(lote);
        }).map(function (g) {
            var monto = Number(g.monto) || 0;
            var porCand = g.tipo === 'por_certificado';
            var fase = FASES.indexOf(g.fase) >= 0 ? g.fase : null;
            var cantidad = !porCand ? 1 : (fase ? pagaron[fase] : certificados);
            return {
                id: g.id, lote: (g.lote === null || g.lote === undefined) ? null : Number(g.lote), concepto: g.concepto || '',
                tipo: g.tipo, fase: porCand ? fase : null, para: g.para === 'chris' ? 'chris' : 'real', monto: monto, cantidad: cantidad, total: monto * cantidad
            };
        });
        var suma = function (l) { return l.reduce(function (a, g) { return a + g.total; }, 0); };
        var reales = items.filter(function (g) { return g.para === 'real'; });
        var deChris = items.filter(function (g) { return g.para === 'chris'; });
        return { items: reales, certificados: certificados, pagaron: pagaron, total: suma(reales), chris: { items: deChris, total: suma(deChris) } };
    }

    /* Lote por fase: cuántos pagaron cada fase, cuánto entró y qué costos generó.
       Los costos sin fase (monto fijo o "por candidato activo") van en `otros`. */
    function porFaseLote(datos, lote) {
        var g = gastosLote(datos, lote);
        var enLote = visibles(datos).filter(function (c) { return (c.lote || 1) === lote; });
        var sumaFase = function (l, f) { return l.filter(function (i) { return i.fase === f; }).reduce(function (a, i) { return a + i.total; }, 0); };
        var sinFase = function (l) { return l.filter(function (i) { return !i.fase; }).reduce(function (a, i) { return a + i.total; }, 0); };
        var fases = FASES.map(function (f) {
            var ingresos = enLote.reduce(function (a, c) { return a + montoCobrado(datos, c, f); }, 0);
            return { id: f, label: FASE_LABEL[f], pagaron: g.pagaron[f], ingresos: ingresos, costoReal: sumaFase(g.items, f), costoChris: sumaFase(g.chris.items, f) };
        });
        return { fases: fases, otrosReal: sinFase(g.items), otrosChris: sinFase(g.chris.items), gastos: g };
    }

    /* Reparto de un lote (función pura, la usa también la vista previa de
       admin-utilidades.html con los porcentajes aún sin guardar).
       · Total a repartir (base) = ingresos − costos REALES (nunca negativo).
       · Chris = su % de (ingresos − costos de Chris), tope: el total a repartir.
         Sin costos propios de Chris se le descuentan los reales.
       · Socios = el resto del total, repartido en proporción a sus porcentajes:
         la diferencia entre los costos de Chris y los reales se queda con ellos. */
    function repartir(ingresos, gastos, config) {
        var neto = ingresos - gastos.total;
        var base = Math.max(0, neto);
        var conChris = config.incluir_chris !== false;
        var costoChris = gastos.chris.items.length ? gastos.chris.total : gastos.total;
        var netoChris = ingresos - costoChris;
        var chris = conChris ? Math.min(base, Math.round(Math.max(0, netoChris) * (Number(config.porcentaje_chris) || 0) / 100)) : 0;
        var pool = base - chris;
        var ids = ['fernando', 'lot', 'diego'];
        var pesos = ids.map(function (id) { return Number(config['porcentaje_' + id]) || 0; });
        var sumaPesos = pesos.reduce(function (a, b) { return a + b; }, 0);
        var montos = { chris: chris };
        var partes = {};
        ids.forEach(function (id, i) {
            partes[id] = sumaPesos > 0 ? (pesos[i] / sumaPesos) * 100 : 0;
            montos[id] = sumaPesos > 0 ? Math.round((pool * pesos[i]) / sumaPesos) : 0;
        });
        return {
            neto: neto, base: base, chris: chris, pool: pool, montos: montos, partes: partes,
            costoChris: costoChris, netoChris: netoChris, propiosChris: gastos.chris.items.length > 0,
            diferencial: conChris ? costoChris - gastos.total : 0
        };
    }

    function utilidades(datos, lote) {
        var config = configLote(datos, lote);
        var ingresos = ingresosLote(datos, lote);
        var gastos = gastosLote(datos, lote);
        var r = repartir(ingresos, gastos, config);
        var pagos = (datos.utilidadesPagos || []).filter(function (p) { return Number(p.lote) === Number(lote); });
        var socios = SOCIOS.filter(function (s) { return s.id !== 'chris' || config.incluir_chris; }).map(function (s) {
            var pct = Number(config['porcentaje_' + s.id]) || 0;
            var aRepartir = r.montos[s.id];
            var pagado = pagos.filter(function (p) { return p.socio === s.id; }).reduce(function (a, p) { return a + (Number(p.monto) || 0); }, 0);
            return { id: s.id, label: s.label, pct: pct, aRepartir: aRepartir, pagado: pagado, pendiente: Math.max(0, aRepartir - pagado) };
        });
        return {
            lote: lote, ingresos: ingresos, gastos: gastos, neto: r.neto, reparto: r, config: config, socios: socios,
            aRepartir: socios.reduce(function (a, s) { return a + s.aRepartir; }, 0),
            pagado: socios.reduce(function (a, s) { return a + s.pagado; }, 0),
            pendiente: socios.reduce(function (a, s) { return a + s.pendiente; }, 0)
        };
    }

    /* Corte a hoy, candidato por candidato (18 sep): con el precio de CADA uno
       (no promedio). Por cada fase pagada: lo recibido y los costos por
       candidato que esa fase generó; Chris = su % de (recibido − costos de
       Chris) y socios = (recibido − costo real) − Chris. Mismas reglas que
       gastosLote/repartir, así que la suma cuadra con el reparto del lote; los
       costos de monto fijo no son de un candidato y van aparte (`fijos`).
       Valores sin redondear: la pantalla redondea al mostrar. */
    function cortePorCandidato(datos, lote) {
        var idx = indexar(datos);
        var config = configLote(datos, lote);
        var g = gastosLote(datos, lote);
        var conChris = config.incluir_chris !== false;
        var pct = Number(config.porcentaje_chris) || 0;
        var porCand = function (l) { return l.filter(function (i) { return i.tipo === 'por_certificado'; }); };
        var real = porCand(g.items), propios = porCand(g.chris.items);
        var usaReales = g.chris.items.length === 0;
        var aplica = function (it, c, pagadas) { return it.fase ? pagadas[it.fase] : (c.estado || 'activo') === 'activo'; };
        var filas = visibles(datos).filter(function (c) { return (c.lote || 1) === lote; }).map(function (c) {
            var pagadas = {}, recibido = {};
            FASES.forEach(function (f) { pagadas[f] = tienePago(datos, c.email, f); recibido[f] = montoCobrado(datos, c, f); });
            var totalRecibido = FASES.reduce(function (a, f) { return a + recibido[f]; }, 0);
            var costoReal = real.filter(function (i) { return aplica(i, c, pagadas); }).reduce(function (a, i) { return a + i.monto; }, 0);
            var costoChris = usaReales ? costoReal : propios.filter(function (i) { return aplica(i, c, pagadas); }).reduce(function (a, i) { return a + i.monto; }, 0);
            var chris = conChris ? (totalRecibido - costoChris) * pct / 100 : 0;
            var neto = totalRecibido - costoReal;
            var email = (c.email || '').toLowerCase();
            return {
                email: c.email, nombre: idx.nombres[email] || c.nombre || '', estado: c.estado || 'activo',
                precio: Number(c.total_acordado) || 0, pagadas: pagadas, recibido: recibido, totalRecibido: totalRecibido,
                pendientePorCobrar: Math.max(0, (Number(c.total_acordado) || 0) - totalRecibido),
                costoReal: costoReal, costoChris: costoChris, baseChris: totalRecibido - costoChris, chris: chris, neto: neto, socios: neto - chris
            };
        }).sort(function (a, b) { return b.totalRecibido - a.totalRecibido || String(a.nombre || a.email).localeCompare(String(b.nombre || b.email)); });
        var sum = function (k) { return filas.reduce(function (a, f) { return a + f[k]; }, 0); };
        var fijosReal = g.items.filter(function (i) { return i.tipo !== 'por_certificado'; }).reduce(function (a, i) { return a + i.total; }, 0);
        var fijosChris = usaReales ? fijosReal : g.chris.items.filter(function (i) { return i.tipo !== 'por_certificado'; }).reduce(function (a, i) { return a + i.total; }, 0);
        return {
            config: config, filas: filas,
            subtotal: { recibido: sum('totalRecibido'), costoReal: sum('costoReal'), costoChris: sum('costoChris'), chris: sum('chris'), neto: sum('neto'), socios: sum('socios') },
            fijos: { real: fijosReal, chris: fijosChris }
        };
    }

    /* Las dos tablas de precios de UN candidato típico del lote (como la hoja de
       Diego): precio promedio de los activos por fase, costos por candidato y
       cómo se reparte, fase por fase. Reusa repartir(), así que el total coincide
       con el reparto real. Los costos de monto fijo son del lote, no entran aquí;
       los "por candidato" sin fase se muestran en Dictamen (al final). */
    function fichaCandidato(datos, lote) {
        var config = configLote(datos, lote);
        var g = gastosLote(datos, lote);
        var activos = visibles(datos).filter(function (c) { return (c.lote || 1) === lote && (c.estado || 'activo') === 'activo'; });
        var prom = function (f) { return activos.length ? Math.round(activos.reduce(function (a, c) { return a + (Number(c[f]) || 0); }, 0) / activos.length) : 0; };
        var fases = {};
        FASES.forEach(function (f) { fases[f] = prom('monto_' + f); });
        var precio = activos.length ? Math.round(activos.reduce(function (a, c) { return a + (Number(c.total_acordado) || 0); }, 0) / activos.length) : 0;
        var porCand = function (l) { return l.filter(function (i) { return i.tipo === 'por_certificado'; }); };
        var suma = function (l) { return l.reduce(function (a, i) { return a + i.monto; }, 0); };
        var real = porCand(g.items), propios = porCand(g.chris.items);
        var itemsChris = propios.length ? propios : real;
        var uno = { total: suma(real), chris: { items: propios, total: suma(propios) } };
        var r = repartir(precio, uno, config);
        var conChris = config.incluir_chris !== false;
        var pct = Number(config.porcentaje_chris) || 0;
        var faseDe = function (i) { return i.fase || 'entrega'; };
        var costoEn = function (l, f) { return l.filter(function (i) { return faseDe(i) === f; }); };
        var porFase = FASES.map(function (f) {
            var cr = costoEn(real, f), cc = costoEn(itemsChris, f);
            var neto = fases[f] - suma(cr), baseChris = fases[f] - suma(cc);
            var chris = conChris ? Math.round(baseChris * pct / 100) : 0;
            return { id: f, label: FASE_LABEL[f], precio: fases[f], costosReal: cr, costoReal: suma(cr), costosChris: cc, costoChris: suma(cc), neto: neto, baseChris: baseChris, chris: chris, socios: neto - chris };
        });
        var netoReal = precio - suma(real);
        var parte = function (m) { return netoReal > 0 ? (m / netoReal) * 100 : 0; };
        return {
            activos: activos.length, precio: precio, fases: fases, config: config, porFase: porFase,
            real: { items: real, total: suma(real), neto: netoReal },
            chris: { items: itemsChris, total: r.costoChris, neto: r.netoChris, propios: propios.length > 0 },
            reparto: r,
            participacion: { chris: parte(r.chris), fernando: parte(r.montos.fernando), lot: parte(r.montos.lot), diego: parte(r.montos.diego) }
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

    /* Quien se registró por la liga (registro.html) existe en
       candidatos_ec1375 —y por lo tanto en admin_lista_candidatos()— pero NO
       en candidatos_precio, porque el precio es dinero y lo captura el
       equipo, nunca el candidato desde su navegador. Antes esa persona
       desaparecía del panel: firmaba su NDA y nadie se enteraba. Aquí se le
       arma una fila 'prospecto' para que el admin la vea y le llene sus
       datos financieros — mismo patrón que la fila "sin precio capturado"
       que admin-precios.html ya arma para quien pagó sin estar dado de alta.

       **No cambia ningún cálculo financiero**: kpis(), ingresosLote(),
       gastosLote(), porFaseLote(), cortePorCandidato(), fichaCandidato() y
       lotes() pasan todos por visibles(), que lee candidatos_precio directo
       y nunca esta lista. Un prospecto no tiene lote ni monto, así que no
       hay nada que sumar hasta que lo den de alta. */
    function prospectos(datos) {
        var enPrecio = {};
        (datos.precio || []).forEach(function (c) { enPrecio[(c.email || '').toLowerCase()] = true; });
        var vistos = {};
        var out = [];
        (datos.candidatosRows || []).forEach(function (r) {
            var email = (r && r.email) ? r.email.toLowerCase() : '';
            if (!email || enPrecio[email] || vistos[email] || email === BYPASS_EMAIL) return;
            vistos[email] = true;
            out.push({ email: email, nombre: r.nombre || '', _sinAlta: true });
        });
        return out;
    }

    function candidatos(datos) {
        var idx = indexar(datos);
        /* Un evaluador (18 sep) no lee candidatos_precio ni los pagos: su
           lista sale de las filas del RPC, con las fases que el RPC regresa
           en fases_pagadas (2026-09-18-centro-evaluador.sql). */
        var base = (datos.precio && datos.precio.length) ? datos.precio.concat(prospectos(datos))
            : (datos.candidatosRows || []).filter(function (r) { return r && r.email; })
                .map(function (r) { return { email: r.email.toLowerCase(), lote: 1, estado: 'activo', total_acordado: 0 }; });
        return base.map(function (c) {
            var email = (c.email || '').toLowerCase();
            var sinAlta = c._sinAlta === true;
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
                /* lote/estado/total de un prospecto no son 0 ni 1: están SIN
                   CAPTURAR, y la UI tiene que poder decir eso en vez de
                   inventar "Lote 1 · activo · $0". */
                lote: sinAlta ? null : (c.lote || 1),
                estado: sinAlta ? ESTADO_PROSPECTO : (c.estado || 'activo'),
                totalAcordado: sinAlta ? null : (c.total_acordado || 0),
                tieneAlta: !sinAlta,
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
        /* Se registró y firmó su NDA, pero nadie le ha capturado sus datos
           financieros. Va aparte del filtro de arriba (que solo mira
           'activo') porque un prospecto todavía no es un candidato activo:
           justamente falta la decisión del equipo. */
        lista.filter(function (c) { return c.estado === ESTADO_PROSPECTO; }).forEach(function (c) {
            items.push({
                tipo: 'sin_alta',
                texto: (c.nombre || c.email) + ' se registró y falta capturarle lote y montos',
                email: c.email,
                href: 'admin-precios.html?alta=' + encodeURIComponent(c.email)
            });
        });
        (datos.sesiones || []).forEach(function (s) {
            if (!s.zoom_link) items.push({ tipo: 'sesion', texto: 'Sesión del ' + s.fecha + ' sin liga de Zoom', href: 'admin-sesiones.html' });
        });
        return items.concat(atencionSala(datos, lista, now));
    }

    /* Plazos de evidencia (desde el pago de Alineación, o la extensión del
       equipo) y sesiones ya grabadas sin copia en el NAS. */
    function atencionSala(datos, lista, now) {
        if (!SE || (datos.errores && datos.errores.salaConfig)) return [];
        var ahora = (now || new Date()).getTime(), hoy = SE.fechaISO(ahora);
        var dias = (datos.salaConfig && Number(datos.salaConfig.dias_limite)) || 30;
        var ev = {}; (datos.evalSala || []).forEach(function (r) { if (r && r.email) ev[r.email.toLowerCase()] = r; });
        var porEmail = {}; lista.forEach(function (c) { porEmail[c.email.toLowerCase()] = c; });
        var items = [];
        lista.filter(function (c) { return c.estado === 'activo' && c.fases.alineacion; }).forEach(function (c) {
            var email = c.email.toLowerCase();
            var pago = (datos.pagos || []).filter(function (p) { return (p.email || '').toLowerCase() === email && p.fase === 'alineacion'; })[0];
            var limite = (ev[email] && ev[email].limite_evidencia) || (pago ? SE.limiteDesde(pago.autorizado_en, dias) : null);
            var evid = (c.steps || []).filter(function (s) { return s.id === 'evidencias'; })[0];
            var info = SE.limiteInfo(limite, hoy, !!(evid && evid.done));
            if (!info) return;
            var href = 'admin-evaluacion.html?email=' + encodeURIComponent(c.email), nom = c.nombre || c.email;
            if (info.clave === 'vencido') items.push({ tipo: 'plazo_vencido', texto: nom + ' — su plazo de evidencia venció el ' + SE.fechaCorta(limite), email: email, href: href });
            else if (info.clave === 'pronto') items.push({ tipo: 'plazo_pronto', texto: nom + ' entrega su evidencia a más tardar el ' + SE.fechaCorta(limite) + ' (' + (info.dias === 0 ? 'hoy' : info.dias + (info.dias === 1 ? ' día' : ' días')) + ')', email: email, href: href });
        });
        (datos.reservasSala || []).forEach(function (r) {
            var h = r && r.horarios_evidencia;
            if (!h || Date.parse(h.fin) > ahora) return;
            var email = (r.email || '').toLowerCase(), v = ev[email] && ev[email].video;
            var partes = v && Array.isArray(v.partes) ? v.partes : [];
            if (partes.length && partes.every(function (p) { return p && p.nas && p.nas.ruta; })) return;
            var c = porEmail[email];
            items.push({ tipo: 'sin_grabacion', texto: 'Sesión grabada del ' + SE.fechaCorta(h.inicio) + ' (' + ((c && c.nombre) || email) + ') sin copiar al NAS', email: email, href: 'admin-evaluacion.html?email=' + encodeURIComponent(email) });
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
            // Con token: el endpoint solo incluye zoom_link para el equipo.
            (typeof Auth !== 'undefined' && Auth.apiHeaders ? Auth.apiHeaders() : Promise.resolve({}))
                .then(function (headers) { return fetch('/api/sesiones-alineacion', { headers: headers }); }).then(function (r) { return r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)); })
                .then(function (d) { return { data: d.sesiones || [], error: null }; }, function (e) { return { data: null, error: e }; }),
            q(sb.from('sala_evidencias_config').select('dias_limite').eq('id', 1).maybeSingle()),
            q(sb.from('reservas_evidencia').select('email,estado,horarios_evidencia(inicio,fin)').in('estado', ['reservada', 'asistio'])),
            q(sb.from('evaluaciones').select('email,limite_evidencia,video'))
        ]);
        var errores = {};
        var nombresClave = ['precio', 'pagos', 'reparto', 'utilidadesPagos', 'gastos', 'nombres', 'candidatosRows', 'evaluaciones', 'sesiones', 'salaConfig', 'reservasSala', 'evalSala'];
        var datos = {};
        nombresClave.forEach(function (k, i) {
            datos[k] = res[i].data || (k === 'sesiones' || k === 'salaConfig' ? null : []);
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
        FASES: FASES, FASE_LABEL: FASE_LABEL, SOCIOS: SOCIOS, PASOS_EXTRA: PASOS_EXTRA, ESTADO_PROSPECTO: ESTADO_PROSPECTO, ORIGEN_ANTICIPO: ORIGEN_ANTICIPO,
        cargar: cargar, kpis: kpis, utilidades: utilidades, gastosLote: gastosLote, repartir: repartir, fichaCandidato: fichaCandidato, porFaseLote: porFaseLote, cortePorCandidato: cortePorCandidato, utilidadesGlobal: utilidadesGlobal, lotes: lotes,
        candidatos: candidatos, porPaso: porPaso, ultimosPagos: ultimosPagos, proximasSesiones: proximasSesiones, atencion: atencion, atencionSala: atencionSala,
        declaraciones: declaraciones,
        fmtMX: function (n) { return '$' + Math.round(n || 0).toLocaleString('es-MX'); }
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = AdminData;
    if (typeof window !== 'undefined') window.AdminData = AdminData;
})();
