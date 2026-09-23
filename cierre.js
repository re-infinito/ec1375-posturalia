/* cierre.js — los tres formatos de cierre del portafolio que el Centro
   Evaluador llena por candidato (22 sep 2026).

   Son las páginas 40, 41 y 42 del machote `FORMATO PORTAFOLIO-1375-2026`:
   la Cédula de Evaluación del Servicio a usuarios, la Verificación Interna
   del Proceso de Evaluación y el Formato de Atención a Usuarios. Hasta ahora
   salían con los datos de identificación llenos y las casillas en blanco;
   decisión de Diego: Humberto evalúa a todos los candidatos, así que los
   captura él en `admin-cierre.html` y el portafolio los imprime llenos.

   Este módulo es la fuente única de qué pregunta cada formato: lo usan la
   pantalla del evaluador y `portafolio.js`. Sin DOM ni red. */
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

    /* Lo que ya sabemos del candidato, para no teclearlo de nuevo. */
    function prellenar(row, evaluador) {
        row = mapa(row);
        var pd = mapa(mapa(row.autodiagnostico_data).personalData);
        var plan = mapa(mapa(row.plan_evaluacion_data).planData);
        return {
            servicio: { medio: '', otroMedio: '', aspectos: {}, comentarios: '' },
            verificacion: { items: {}, observaciones: '', verificador: texto(evaluador) },
            atencion: {
                folio: '', lugar: texto(plan.lugarEvaluacion) || 'Zoom', medio: '', otroMedio: '',
                domicilio: texto(pd.domicilio), colonia: '', cp: '', municipio: '', estado: '', ciudad: '',
                telefono: texto(pd.telefonoCelular) || texto(pd.telefonoCasa), email: texto(pd.email),
                respuestas: {}
            }
        };
    }

    /* Qué falta por capturar, en la misma forma que validarCedula. */
    function validar(cierre) {
        var d = mapa(cierre), faltan = [];
        var s = mapa(d.servicio), v = mapa(d.verificacion), a = mapa(d.atencion);
        var asp = mapa(s.aspectos), items = mapa(v.items), resp = mapa(a.respuestas);
        var faltaAsp = ASPECTOS_SERVICIO.filter(function (_, i) { return ESCALA_SERVICIO.indexOf(asp[i]) < 0; }).length;
        if (faltaAsp) faltan.push('Calificar ' + faltaAsp + ' aspecto' + (faltaAsp > 1 ? 's' : '') + ' de la Cédula del Servicio a usuarios');
        if (!texto(s.medio)) faltan.push('El medio por el que el candidato contactó al Centro');
        var faltaVer = VERIFICACION.filter(function (x) { return items[x.n] !== 'si' && items[x.n] !== 'no'; }).length;
        if (faltaVer) faltan.push('Contestar ' + faltaVer + ' punto' + (faltaVer > 1 ? 's' : '') + ' de la Verificación Interna');
        if (!texto(v.verificador)) faltan.push('Nombre de quien verifica el proceso');
        var faltaAt = ATENCION_PREGUNTAS.filter(function (_, i) { return ESCALA_SERVICIO.indexOf(resp[i]) < 0; }).length;
        if (faltaAt) faltan.push('Calificar ' + faltaAt + ' pregunta' + (faltaAt > 1 ? 's' : '') + ' del Formato de Atención a Usuarios');
        if (!texto(a.medio)) faltan.push('El medio de contacto del Formato de Atención a Usuarios');
        return faltan;
    }

    /* Cuántas casillas de las 29 llevan respuesta (para la barra de avance). */
    function avance(cierre) {
        var d = mapa(cierre);
        var asp = mapa(mapa(d.servicio).aspectos), items = mapa(mapa(d.verificacion).items), resp = mapa(mapa(d.atencion).respuestas);
        var hechas = ASPECTOS_SERVICIO.filter(function (_, i) { return ESCALA_SERVICIO.indexOf(asp[i]) >= 0; }).length
            + VERIFICACION.filter(function (x) { return items[x.n] === 'si' || items[x.n] === 'no'; }).length
            + ATENCION_PREGUNTAS.filter(function (_, i) { return ESCALA_SERVICIO.indexOf(resp[i]) >= 0; }).length;
        var total = ASPECTOS_SERVICIO.length + VERIFICACION.length + ATENCION_PREGUNTAS.length;
        return { hechas: hechas, total: total, completo: hechas === total };
    }

    function guardar(cierre, datos, o) {
        o = o || {};
        var prev = mapa(cierre), d = mapa(datos);
        return Object.assign({}, prev, {
            version: VERSION,
            servicio: mapa(d.servicio), verificacion: mapa(d.verificacion), atencion: mapa(d.atencion),
            completo: !validar(d).length,
            por: o.por || prev.por || '',
            actualizado_at: o.ahora || new Date().toISOString()
        });
    }

    var api = { VERSION: VERSION, ESCALA_SERVICIO: ESCALA_SERVICIO, ASPECTOS_SERVICIO: ASPECTOS_SERVICIO,
        MEDIOS_EVALUACION: MEDIOS_EVALUACION, VERIFICACION: VERIFICACION, MEDIOS_ATENCION: MEDIOS_ATENCION,
        ATENCION_PREGUNTAS: ATENCION_PREGUNTAS, CAMPOS_ATENCION: CAMPOS_ATENCION,
        prellenar: prellenar, validar: validar, avance: avance, guardar: guardar };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.Cierre = api;
})(typeof window !== 'undefined' ? window : globalThis);
