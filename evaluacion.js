/* =========================================================
   evaluacion.js — circuito del Centro Evaluador (18 sep): etapas después
   de Evidencias, reglas de la Cédula de Evaluación y plan del portafolio.
   Lógica pura, sin red: la usan admin-evaluacion.html, admin-candidatos.html,
   panel.html (línea de tiempo del candidato), cedula.html y portafolio.js.
   Spec: docs/superpowers/specs/2026-09-18-circuito-centro-evaluador-design.md
   Pruebas: tests/evaluacion.test.js
========================================================= */
(function (root) {
    'use strict';

    /* manual = la marca el equipo (se guarda en evaluaciones.etapas con
       { fecha, por }); las demás salen de datos reales. */
    var ETAPAS = [
        { clave: 'evidencias', label: 'Evidencias recibidas', manual: false },
        { clave: 'revision', label: 'En revisión del evaluador', manual: true },
        { clave: 'registro_sep', label: 'Registrado en el portal de la SEP', manual: true },
        { clave: 'dictamen', label: 'Dictamen de tu evaluación', manual: false },
        { clave: 'pago_entrega', label: 'Pago de Entrega', manual: false },
        { clave: 'portafolio_sep', label: 'Portafolio enviado a la SEP', manual: true },
        { clave: 'tramite', label: 'Certificado en trámite (unos 90 días)', manual: true },
        { clave: 'recibido', label: 'Certificado recibido', manual: true },
        { clave: 'entregado', label: 'Certificado entregado', manual: true }
    ];

    var JUICIOS = ['COMPETENTE', 'NO COMPETENTE'];
    var CAMPOS_CEDULA = [
        { id: 'mejoresPracticas', label: 'Mejores prácticas' },
        { id: 'areasOportunidad', label: 'Áreas de oportunidad' },
        { id: 'criteriosNoCubiertos', label: 'Criterios de Evaluación que no se cubrieron' },
        { id: 'recomendaciones', label: 'Recomendaciones' }
    ];
    var TEXTO_ACUERDO = 'Estoy de acuerdo con el juicio de evaluación y satisfecho con los comentarios emitidos.';

    function cedulaPublicada(ev) {
        var c = ev && ev.cedula;
        return c && !c.borrador && JUICIOS.indexOf(c.juicio) >= 0 ? c : null;
    }
    function dictamenDe(ev) {
        var c = cedulaPublicada(ev);
        return c ? (c.juicio === 'COMPETENTE' ? 'competente' : 'no_competente') : null;
    }

    /* ctx = { evaluacion, evidenciasHechas, entregaPagada }. Devuelve
       { etapas: [{ clave, label, manual, hecha, fecha, bloqueada }], actual, dictamen }.
       Sin "implicar" etapas manuales que el equipo no marcó: la línea de
       tiempo muestra lo que de verdad se registró. */
    function lineaDeTiempo(ctx) {
        ctx = ctx || {};
        var ev = ctx.evaluacion || {};
        var marcadas = ev.etapas || {};
        var ced = cedulaPublicada(ev);
        var dictamen = dictamenDe(ev);
        var noComp = dictamen === 'no_competente';
        var iDictamen = ETAPAS.map(function (e) { return e.clave; }).indexOf('dictamen');
        var etapas = ETAPAS.map(function (e, i) {
            var hecha = false, fecha = null;
            if (e.clave === 'evidencias') hecha = !!ctx.evidenciasHechas;
            else if (e.clave === 'dictamen') { hecha = !!ced; fecha = ced ? (ced.publicada_at || null) : null; }
            else if (e.clave === 'pago_entrega') hecha = !!ctx.entregaPagada;
            else if (marcadas[e.clave]) { hecha = true; fecha = marcadas[e.clave].fecha || null; }
            var bloqueada = noComp && i > iDictamen;
            if (bloqueada) { hecha = false; fecha = null; }
            return { clave: e.clave, label: e.label, manual: e.manual, hecha: hecha, fecha: fecha, bloqueada: bloqueada };
        });
        var actual = null;
        if (noComp) actual = 'dictamen';
        else for (var i = 0; i < etapas.length; i++) if (!etapas[i].hecha) { actual = etapas[i].clave; break; }
        return { etapas: etapas, actual: actual, dictamen: dictamen };
    }

    function firmaValida(f) {
        if (!f || typeof f !== 'object') return false;
        if (f.mode === 'draw') return typeof f.dataUrl === 'string' && /^data:image\//.test(f.dataUrl);
        if (f.mode === 'type') return typeof f.typedName === 'string' && f.typedName.trim().length >= 3;
        return false;
    }
    function texto(v) { return typeof v === 'string' ? v.trim() : ''; }

    /* Lo que falta para publicar la Cédula (lista vacía = se puede). */
    function validarCedula(c) {
        c = c || {};
        var falta = [];
        if (!texto(c.evaluadora)) falta.push('Nombre del evaluador(a)');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(texto(c.fecha))) falta.push('Fecha');
        if (JUICIOS.indexOf(c.juicio) < 0) falta.push('Juicio (COMPETENTE / NO COMPETENTE)');
        if (!CAMPOS_CEDULA.some(function (k) { return texto(c[k.id]); })) falta.push('Al menos un comentario del resultado');
        if (!firmaValida(c.firmaEvaluador)) falta.push('Firma del evaluador(a)');
        return falta;
    }

    /* Publicar: la Cédula anterior publicada (con la firma del candidato que
       tuviera) pasa al historial y el candidato tiene que volver a firmar. */
    function publicarCedula(ev, datos, o) {
        ev = ev || {}; o = o || {};
        var actual = ev.cedula, anteriores = ev.cedulas_anteriores || [];
        var archivar = actual && !actual.borrador;
        var cedula = Object.assign({}, datos, { borrador: false, publicada_at: o.ahora, por: o.por });
        return {
            cedula: cedula,
            cedulas_anteriores: archivar ? anteriores.concat([Object.assign({}, actual, { firma_candidato: ev.firma_candidato || null, archivada_at: o.ahora })]) : anteriores,
            firma_candidato: null
        };
    }
    function guardarBorrador(ev, datos, o) {
        ev = ev || {}; o = o || {};
        return { cedula: Object.assign({}, datos, { borrador: true, por: o.por }), firma_candidato: ev.firma_candidato || null };
    }

    /* ── Portafolio: puerto 1:1 del orden de assemble_expediente.py ── */
    var FORM_FALLBACK_MARK = 'MANUAL_FORM_FALLBACK';
    var SLOTS = {
        ficha_registro_candidato: ['autodiagnostico_data', 'fichaRegistro', 'Ficha de Registro RENAP (candidato)'],
        curp: ['evidencias_data', 'curp', 'Comprobante CURP'],
        ine: ['evidencias_data', 'ine', 'Identificación oficial (INE/Pasaporte)'],
        pdf_autodiagnostico: ['autodiagnostico_data', 'autodiagnostico', 'PDF de Autodiagnóstico'],
        pdf_plan_evaluacion: ['plan_evaluacion_data', 'planEvaluacion', 'PDF de Plan de Evaluación'],
        ficha_registro_paciente: ['documentos_sesion_data', 'ficha', 'Ficha de Registro de Atención (paciente)'],
        carta_consentimiento: ['documentos_sesion_data', 'consentimiento', 'Carta de Consentimiento Informado'],
        plan_sesion: ['documentos_sesion_data', 'plan_sesion', 'Plan de Sesión'],
        plan_seguimiento: ['documentos_sesion_data', 'plan_seguimiento', 'Plan de Seguimiento'],
        pdf_encuesta: ['encuesta_data', 'encuesta', 'PDF de Encuesta de Satisfacción'],
        acuse_triptico: ['autodiagnostico_data', 'acuseTriptico', 'Acuse de Recibido - Tríptico'],
        acuse_plan_evaluacion: ['plan_evaluacion_data', 'acusePlanEvaluacion', 'Acuse de Recibido - Plan de Evaluación']
    };
    var IEC_RUTA = 'Plantillas/plantilla_IEC_blanco.pdf';

    /* Centro de Evaluación y evaluador del expediente (confirmados por Diego
       el 19 sep). En el expediente aprobado de Humberto la clave corta va en
       el Plan de Evaluación y la Cédula, y el nombre completo del Centro en
       los acuses. */
    var CENTRO_EVALUACION = { clave: 'CE1399-OC063-18', nombre: 'COLEGIO ILUSTRE DE CIENCIAS FORENSES DE MÉXICO AC CE1399-OC063-18' };
    var EVALUADOR_PREDETERMINADO = 'HUMBERTO LOT NAVARRO NAVARRO';
    var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

    /* '2025-08-23' → 'agosto 23 2025', como la "Fecha de Aplicación" del IEC de referencia. */
    function fechaLarga(iso) {
        var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto(iso));
        return m && +m[2] >= 1 && +m[2] <= 12 ? MESES[+m[2] - 1] + ' ' + (+m[3]) + ' ' + m[1] : '';
    }
    function mayus(t) { return texto(t).toLocaleUpperCase('es-MX'); }

    function planPortafolio(row) {
        row = row || {};
        var avisos = [];
        function slot(nombre) {
            var s = SLOTS[nombre], data = row[s[0]];
            var val = data && typeof data === 'object' && data.documentosNextcloud ? data.documentosNextcloud[s[1]] : null;
            var lista = (Array.isArray(val) ? val : (val ? [val] : [])).filter(function (e) { return e && e !== FORM_FALLBACK_MARK; });
            if (!lista.length) {
                avisos.push(val
                    ? "Falta '" + s[2] + "' — quedó marcado como enviado por el formulario alterno de respaldo, revisar a mano (no está en Nextcloud)"
                    : "Falta '" + s[2] + "' (el candidato todavía no lo ha subido)");
                return [];
            }
            return lista.map(function (ruta) { return { tipo: 'nas', ruta: ruta, etiqueta: s[2], slot: nombre }; });
        }
        var g = function (p) { return { tipo: 'generado', pagina: p }; };
        var ev = row.evidencias_data && typeof row.evidencias_data === 'object' ? row.evidencias_data : {};
        var videoLink = texto(ev.planData && ev.planData.videoLink) || null;
        var ficha = slot('ficha_registro_candidato'), curp = slot('curp'), ine = slot('ine'), auto = slot('pdf_autodiagnostico'),
            plan = slot('pdf_plan_evaluacion'), fp = slot('ficha_registro_paciente'), carta = slot('carta_consentimiento'),
            ps = slot('plan_sesion'), seg = slot('plan_seguimiento'), enc = slot('pdf_encuesta'),
            at = slot('acuse_triptico'), ap = slot('acuse_plan_evaluacion');
        if (!videoLink) avisos.push('Falta la liga al video (no está en Evidencias)');
        var items = [g('portada'), g('indice'), g('sep1')].concat(ficha, curp, ine, auto, [g('sep2')], plan,
            [{ tipo: 'plantilla', ruta: IEC_RUTA, etiqueta: 'Instrumento de Evaluación (IEC) en blanco', slot: 'iec' }],
            fp, carta, ps, seg, [g('video'), g('sep3'), g('cedula')], enc, [g('sep4')], at, ap);
        return { items: items, avisos: avisos, videoLink: videoLink, nombre: row.nombre || '' };
    }

    /* Lo que el portafolio estampa sobre los documentos que el candidato
       generó sin evaluador (19 sep): nombre del evaluador y del Centro en el
       Plan y los acuses, firma del evaluador en el Plan, y en el IEC nombres,
       fecha de aplicación y rúbricas. El evaluador firma cada documento por
       separado (evaluaciones.firmas_evaluador.plan / .iec); la rúbrica del
       candidato es la firma de su Cédula. */
    function sellosPortafolio(row, ev) {
        row = row || {}; ev = ev || {};
        var ced = cedulaPublicada(ev);
        var firmas = ev.firmas_evaluador && typeof ev.firmas_evaluador === 'object' ? ev.firmas_evaluador : {};
        var evaluador = (ced && texto(ced.evaluadora)) || EVALUADOR_PREDETERMINADO;
        var planData = row.plan_evaluacion_data && row.plan_evaluacion_data.planData ? row.plan_evaluacion_data.planData : {};
        var fechaAplicacion = fechaLarga(planData.fechaEvaluacion) || fechaLarga(ced && ced.fecha);
        var s = {
            evaluador: evaluador, evaluadorMayus: mayus(evaluador), candidatoMayus: mayus(row.nombre),
            ceClave: CENTRO_EVALUACION.clave, ceNombre: CENTRO_EVALUACION.nombre, fechaAplicacion: fechaAplicacion,
            firmaPlan: firmaValida(firmas.plan) ? firmas.plan : null,
            firmaIec: firmaValida(firmas.iec) ? firmas.iec : null,
            firmaCandidato: ced && firmaValida(ev.firma_candidato) ? ev.firma_candidato : null,
            avisos: []
        };
        if (!s.firmaPlan) s.avisos.push('Falta la firma del evaluador en el Plan de Evaluación (Centro Evaluador → Firmas del evaluador)');
        if (!s.firmaIec) s.avisos.push('Falta la rúbrica del evaluador en el IEC (Centro Evaluador → Firmas del evaluador)');
        if (!fechaAplicacion) s.avisos.push('El IEC va sin Fecha de Aplicación: falta la fecha de evaluación en el Plan');
        return s;
    }

    /* Rutas que el proxy del NAS acepta: solo Portafolios/ o Plantillas/,
       sin segmentos vacíos, ".", ".." ni barras invertidas. La misma regla
       se aplica en api/subir-portafolio.js. */
    function rutaNasPermitida(r) {
        if (typeof r !== 'string' || !/^(Portafolios|Plantillas)\//.test(r) || r.indexOf('\\') >= 0) return false;
        return r.split('/').every(function (s) { return s && s !== '.' && s !== '..'; });
    }

    var URL_PANEL = 'https://sepconocer.paideiatech.com/panel.html';
    function mensajeWhatsApp(clave, d) {
        d = d || {};
        var hola = 'Hola ' + (d.nombre || '') + ', ';
        var m = {
            revision: hola + 'tu evaluador(a) ya está revisando tus evidencias de la certificación EC1375. Sigue tu avance en tu panel: ',
            registro_sep: hola + 'ya quedaste registrado(a) en el portal de la SEP para tu certificación EC1375. Sigue tu avance en tu panel: ',
            portafolio_sep: hola + 'tu portafolio de evidencias ya se envió a la SEP. Sigue tu avance en tu panel: ',
            tramite: hola + 'tu certificado EC1375 ya está en trámite ante la SEP (unos 90 días). Te avisamos cuando llegue. Tu panel: ',
            recibido: hola + '¡ya recibimos tu certificado EC1375! Te contactamos para coordinar la entrega. Tu panel: ',
            entregado: hola + 'tu certificado EC1375 quedó entregado. ¡Felicidades y gracias por tu confianza! Tu panel: '
        };
        if (clave === 'dictamen') {
            return d.dictamen === 'competente'
                ? '¡Felicidades ' + (d.nombre || '') + '! Tu resultado de evaluación EC1375 es COMPETENTE. Entra a tu panel para leer tu Cédula de Evaluación y firmarla: ' + URL_PANEL
                : hola + 'ya está tu Cédula de Evaluación EC1375. Entra a tu panel para leer los comentarios de tu evaluador(a); ahí mismo podrás subir una nueva evidencia: ' + URL_PANEL;
        }
        return (m[clave] || hola + 'hay novedades en tu proceso EC1375. Revisa tu panel: ') + URL_PANEL;
    }
    function telefonoWhatsApp(t) {
        var d = String(t || '').replace(/\D/g, '');
        if (!d) return null;
        if (d.length === 10) return '52' + d;
        return d;
    }

    var api = {
        ETAPAS: ETAPAS, JUICIOS: JUICIOS, CAMPOS_CEDULA: CAMPOS_CEDULA, TEXTO_ACUERDO: TEXTO_ACUERDO, IEC_RUTA: IEC_RUTA,
        lineaDeTiempo: lineaDeTiempo, dictamenDe: dictamenDe, cedulaPublicada: cedulaPublicada, firmaValida: firmaValida,
        validarCedula: validarCedula, publicarCedula: publicarCedula, guardarBorrador: guardarBorrador,
        planPortafolio: planPortafolio, rutaNasPermitida: rutaNasPermitida,
        CENTRO_EVALUACION: CENTRO_EVALUACION, EVALUADOR_PREDETERMINADO: EVALUADOR_PREDETERMINADO,
        fechaLarga: fechaLarga, sellosPortafolio: sellosPortafolio,
        mensajeWhatsApp: mensajeWhatsApp, telefonoWhatsApp: telefonoWhatsApp
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.Evaluacion = api;
})(typeof window !== 'undefined' ? window : this);
