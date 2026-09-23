/* cierre.js — los tres formatos de cierre del portafolio (22 sep 2026).

   Son las páginas 40, 41 y 42 del machote `FORMATO PORTAFOLIO-1375-2026` y
   NO las llena la misma persona. Regla de Diego: lo que le toca al candidato
   lo contesta el candidato, sin mezclar.

   · Cédula de Evaluación del Servicio a usuarios (p. 40) → el CANDIDATO,
     en `encuesta-satisfaccion.html`. Es su opinión del servicio.
   · Formato de Atención a Usuarios (p. 42) → el CANDIDATO, ahí mismo. Es
     cómo lo atendieron cuando llegó.
   · Verificación Interna del Proceso (p. 41) → el CENTRO EVALUADOR, en
     `admin-verificacion.html`. Es la revisión del portafolio antes de
     entregarlo, y la firma quien verifica.

   Lo del candidato se guarda en `encuesta_data`; lo del Centro, en
   `evaluaciones.cierre`. Este módulo es la fuente única de qué pregunta cada
   formato: lo usan las dos pantallas y `portafolio.js`. Sin DOM ni red. */
(function (root) {
    'use strict';

    var VERSION = '2026-09-22';

    /* Página 40 — la opinión del candidato sobre el servicio recibido. */
    var ESCALA_SERVICIO = ['Bueno', 'Regular', 'Malo'];
    var ASPECTOS_SERVICIO = [
        'Trato general del personal que le atendió',
        'Explicación del proceso evaluación - certificación',
        'Claridad en el uso del lenguaje',
        'Transparencia en información sobre costos',
        'Aclaración de dudas',
        'Estado de las Instalaciones en las que se evaluó',
        'Estado del equipo con el que se evaluó',
        'Proceso de Evaluación de la competencia',
        'Comunicación general para dar seguimiento a su proceso',
        'Entrega del certificado (oportunidad)'
    ];
    var MEDIOS_EVALUACION = ['Promoción directa', 'Por su patrón o su empleador',
        'Trípticos, folletos o carteles', 'Canalizado por ECE u OC', 'Otro'];

    /* Página 41 — la revisa quien verifica el proceso dentro del Centro. */
    var VERIFICACION = [
        { n: 1, grupo: 'Integración del portafolio de evidencias', texto: 'El índice corresponde al enviado por el CONOCER - Febrero 2018' },
        { n: 2, grupo: 'Integración del portafolio de evidencias', texto: 'Revisión correcta de logotipos e información del CE o EI' },
        { n: 3, grupo: 'Integración del portafolio de evidencias', texto: 'El diagnóstico, Plan de Evaluación, Instrumento de Evaluación, Cédula de Evaluación se encuentran firmados en su totalidad por candidato y evaluador.' },
        { n: 4, grupo: 'Integración del portafolio de evidencias', texto: 'Diagnóstico calificado con tinta negra, sin lápiz, ni espacios en blanco.' },
        { n: 5, grupo: 'Integración del portafolio de evidencias', texto: 'Plan de evaluación calificado con tinta negra, sin lápiz, ni espacios en blanco.' },
        { n: 6, grupo: 'Integración del portafolio de evidencias', texto: 'Verifica las fechas del acuerdo del Plan de Evaluación, desarrollo de la evaluación, evaluación de conocimientos y entrega de resultados corresponden a la notificación enviada y presentada en el SII.' },
        { n: 7, grupo: 'Verificación del Instrumento de evaluación', texto: 'Verifica SÍ es el caso el cumplimiento de la aplicación del Instrumento de Evaluación de la Competencia, del ejercicio práctico.' },
        { n: 8, grupo: 'Verificación del Instrumento de evaluación', texto: 'Verifica la suficiencia de las evidencias recopiladas durante el proceso de la evaluación.' },
        { n: 9, grupo: 'Verificación del Instrumento de evaluación', texto: 'Verifica la suficiencia de la competencia del candidato en cada uno de los elementos del EC.' },
        { n: 10, grupo: 'Verificación del Instrumento de evaluación', texto: 'Revisa que el portafolio de evidencias presente todos los registros y la documentación que sustenta el juicio de competencia el cual debe estar ordenado, limpio, sin tachaduras, lápiz o corrector.' },
        { n: 11, grupo: 'Productos y entrega', texto: 'Verifica el cumplimiento de productos conforme al EC' },
        { n: 12, grupo: 'Productos y entrega', texto: 'Asegura el cumplimiento de las verificaciones y revisiones realizadas' },
        { n: 13, grupo: 'Productos y entrega', texto: 'Entrega el "Portafolio de Evidencias" al ECE o al CE conforme a sus lineamientos y en un plazo no mayor a cinco días naturales.' },
        { n: 14, grupo: 'Productos y entrega', texto: '¿Contiene la firma del EI o Director del CE?' }
    ];

    /* Página 42 — cómo se atendió al usuario cuando llegó. */
    var MEDIOS_ATENCION = ['Presencial', 'Telefónico', 'E-Mail', 'Otro'];
    var ATENCION_PREGUNTAS = [
        '¿Cómo califica la atención que se le ha dado? (tiempo en que fue atendido y utilidad de la información que se le proporcionó)',
        'Considera que el tiempo de atención fue el adecuado (Tiempo que duró la explicación y aclaración de dudas)',
        '¿Considera que se le dio un trato amable? (La persona le saludó, le trató con respeto y cordialidad)',
        'La persona que le brindó la atención ¿Le dio la confianza necesaria para satisfacer todas sus dudas respecto al proceso de evaluación-certificación?',
        '¿Para dirigirse a usted la persona que lo atendió utilizó palabras y términos que le facilitaron comprender lo que estaba explicando?'
    ];
    var CAMPOS_ATENCION = [
        { id: 'folio', label: 'Folio' },
        { id: 'lugar', label: 'Lugar' },
        { id: 'domicilio', label: 'Domicilio' },
        { id: 'colonia', label: 'Colonia' },
        { id: 'cp', label: 'Código Postal' },
        { id: 'municipio', label: 'Delegación o Municipio' },
        { id: 'estado', label: 'Estado' },
        { id: 'ciudad', label: 'Ciudad' },
        { id: 'telefono', label: 'Teléfono(s)' },
        { id: 'email', label: 'E-Mail' }
    ];

    function mapa(o) { return o && typeof o === 'object' ? o : {}; }
    function texto(v) { return typeof v === 'string' ? v.trim() : ''; }

    /* ── Lo que contesta el CANDIDATO (páginas 40 y 42) ─────────────── */

    /* Arranque de las dos hojas del candidato: sus datos de contacto ya los
       dio en el Autodiagnóstico, así que no se los volvemos a pedir. Sus
       OPINIONES nunca vienen precargadas. */
    function prellenarCandidato(row) {
        row = mapa(row);
        var pd = mapa(mapa(row.autodiagnostico_data).personalData);
        var plan = mapa(mapa(row.plan_evaluacion_data).planData);
        return {
            servicio: { medio: '', otroMedio: '', aspectos: {}, comentarios: '' },
            atencion: {
                folio: '', lugar: texto(plan.lugarEvaluacion) || 'Zoom', medio: '', otroMedio: '',
                domicilio: texto(pd.domicilio), colonia: '', cp: '', municipio: '', estado: '', ciudad: '',
                telefono: texto(pd.telefonoCelular) || texto(pd.telefonoCasa), email: texto(pd.email),
                respuestas: {}
            }
        };
    }

    function validarCandidato(datos) {
        var d = mapa(datos), faltan = [];
        var s = mapa(d.servicio), a = mapa(d.atencion);
        var asp = mapa(s.aspectos), resp = mapa(a.respuestas);
        var faltaAsp = ASPECTOS_SERVICIO.filter(function (_, i) { return ESCALA_SERVICIO.indexOf(asp[i]) < 0; }).length;
        if (faltaAsp) faltan.push('Calificar ' + faltaAsp + ' aspecto' + (faltaAsp > 1 ? 's' : '') + ' del servicio que recibiste');
        if (!texto(s.medio)) faltan.push('Cómo conociste al Centro de Evaluación');
        var faltaAt = ATENCION_PREGUNTAS.filter(function (_, i) { return ESCALA_SERVICIO.indexOf(resp[i]) < 0; }).length;
        if (faltaAt) faltan.push('Calificar ' + faltaAt + ' pregunta' + (faltaAt > 1 ? 's' : '') + ' sobre la atención que te dieron');
        if (!texto(a.medio)) faltan.push('Por qué medio te atendieron la primera vez');
        return faltan;
    }

    function avanceCandidato(datos) {
        var d = mapa(datos);
        var asp = mapa(mapa(d.servicio).aspectos), resp = mapa(mapa(d.atencion).respuestas);
        var hechas = ASPECTOS_SERVICIO.filter(function (_, i) { return ESCALA_SERVICIO.indexOf(asp[i]) >= 0; }).length
            + ATENCION_PREGUNTAS.filter(function (_, i) { return ESCALA_SERVICIO.indexOf(resp[i]) >= 0; }).length;
        var total = ASPECTOS_SERVICIO.length + ATENCION_PREGUNTAS.length;
        return { hechas: hechas, total: total, completo: hechas === total };
    }

    /* ── Lo que contesta el CENTRO EVALUADOR (página 41) ─────────────── */

    function prellenarVerificacion(evaluador) {
        return { items: {}, observaciones: '', verificador: texto(evaluador) };
    }

    function validarVerificacion(datos) {
        var v = mapa(datos), items = mapa(v.items), faltan = [];
        var falta = VERIFICACION.filter(function (x) { return items[x.n] !== 'si' && items[x.n] !== 'no'; }).length;
        if (falta) faltan.push('Contestar ' + falta + ' punto' + (falta > 1 ? 's' : '') + ' de la Verificación Interna');
        if (!texto(v.verificador)) faltan.push('Nombre de quien verifica el proceso');
        return faltan;
    }

    function avanceVerificacion(datos) {
        var items = mapa(mapa(datos).items);
        var hechas = VERIFICACION.filter(function (x) { return items[x.n] === 'si' || items[x.n] === 'no'; }).length;
        return { hechas: hechas, total: VERIFICACION.length, completo: hechas === VERIFICACION.length };
    }

    function guardarVerificacion(cierre, datos, o) {
        o = o || {};
        var prev = mapa(cierre), d = mapa(datos);
        return Object.assign({}, prev, {
            version: VERSION,
            verificacion: mapa(d),
            completo: !validarVerificacion(d).length,
            por: o.por || prev.por || '',
            actualizado_at: o.ahora || new Date().toISOString()
        });
    }

    var api = { VERSION: VERSION, ESCALA_SERVICIO: ESCALA_SERVICIO, ASPECTOS_SERVICIO: ASPECTOS_SERVICIO,
        MEDIOS_EVALUACION: MEDIOS_EVALUACION, VERIFICACION: VERIFICACION, MEDIOS_ATENCION: MEDIOS_ATENCION,
        ATENCION_PREGUNTAS: ATENCION_PREGUNTAS, CAMPOS_ATENCION: CAMPOS_ATENCION,
        prellenarCandidato: prellenarCandidato, validarCandidato: validarCandidato, avanceCandidato: avanceCandidato,
        prellenarVerificacion: prellenarVerificacion, validarVerificacion: validarVerificacion,
        avanceVerificacion: avanceVerificacion, guardarVerificacion: guardarVerificacion };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.Cierre = api;
})(typeof window !== 'undefined' ? window : globalThis);
