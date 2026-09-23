/* iec.js — reglas del Instrumento de Evaluación de Competencia (IEC1375).

   Lógica pura, sin DOM ni red: la usa `admin-iec.html` para la pantalla del
   evaluador y `portafolio.js` para estampar las marcas sobre la plantilla
   oficial. Las reglas son las que el propio instrumento imprime en sus
   páginas 2, 4 y 74:

   · Cada reactivo cumplido suma su peso. Los 137 calificables suman 100.08.
   · Los 5 de Actitudes/Hábitos/Valores se califican al revés: valen 0 cuando
     se presentan y RESTAN su peso cuando no (2.05 como máximo).
   · Es COMPETENTE quien llega a 97.64 puntos Y cumple al menos un reactivo
     de cada criterio de evaluación. Los dos, no uno. El segundo criterio
     cuenta solo los criterios de PRODUCTO y DESEMPEÑO (21 de los 34): así lo
     acota el Plan de Evaluación que el candidato firma ("aplica para
     reactivos de producto y desempeño"), que es más específico que la
     redacción general de la página 74 del instrumento.
   · "TODOS los reactivos deberán ser evaluados, en ningún caso se debe
     utilizar 'No aplica'" (instrucción 1 del IEC), así que un IEC con
     reactivos sin contestar no está terminado.
   · Aparte de los 142 reactivos, el instrumento trae 37 preguntas de
     cuestionario donde se anota la opción que eligió el candidato
     ("Respuesta Elejida"). La instrucción 12 pide revisar que no queden
     espacios en blanco, así que también entran en `validar`.  */
(function (root) {
    'use strict';

    var R = typeof require === 'function' && typeof module !== 'undefined'
        ? require('./iec-reactivos.js') : root.IecReactivos;

    var VERSION = '2026-09-22';
    var SI = 'si', NO = 'no';

    function esRespuesta(v) { return v === SI || v === NO; }
    function mapa(o) { return o && typeof o === 'object' ? o : {}; }
    function texto(v) { return typeof v === 'string' ? v.trim() : ''; }

    /* Redondeo a centésimas: sumar 0.29 y 0.59 en punto flotante deja colas
       (100.07999999999998) que al compararse contra 97.64 no molestan, pero
       impresas en el IEC sí se ven mal. */
    function redondear(n) { return Math.round(n * 100) / 100; }

    /* Los 34 criterios de evaluación, en el orden en que aparecen. */
    function criterios() {
        var vistos = {}, lista = [];
        R.REACTIVOS.forEach(function (r) {
            if (!vistos[r.crit]) { vistos[r.crit] = { clave: r.crit, tipo: r.tipo, elem: r.elem, reactivos: [] }; lista.push(vistos[r.crit]); }
            vistos[r.crit].reactivos.push(r.n);
        });
        return lista;
    }

    /* Califica un IEC. `respuestas` es { '<número de reactivo>': 'si'|'no' }. */
    function calificar(respuestas) {
        var resp = mapa(respuestas);
        var puntos = 0, penalizacion = 0, sinContestar = [], cumplidoPorCrit = {};
        R.REACTIVOS.forEach(function (r) {
            var v = resp[r.n];
            if (!esRespuesta(v)) { sinContestar.push(r.n); return; }
            if (v === SI) {
                cumplidoPorCrit[r.crit] = true;
                if (r.tipo !== 'AHV') puntos += r.peso;
            } else if (r.tipo === 'AHV') {
                penalizacion += r.peso;
            }
        });
        puntos = redondear(puntos); penalizacion = redondear(penalizacion);
        var total = redondear(puntos - penalizacion);
        var sinCumplir = criterios().filter(function (c) {
            return (c.tipo === 'D' || c.tipo === 'P') && !cumplidoPorCrit[c.clave];
        }).map(function (c) { return c.clave; });
        var completo = sinContestar.length === 0;
        return {
            puntos: puntos, penalizacion: penalizacion, total: total,
            umbral: R.UMBRAL, alcanzaPuntaje: total >= R.UMBRAL,
            criteriosSinCumplir: sinCumplir, sinContestar: sinContestar,
            contestados: R.REACTIVOS.length - sinContestar.length, reactivos: R.REACTIVOS.length,
            completo: completo,
            juicio: total >= R.UMBRAL && !sinCumplir.length ? 'COMPETENTE' : 'NO COMPETENTE'
        };
    }

    /* Las preguntas del cuestionario sin la respuesta del candidato. */
    function faltanCuestionario(cuest) {
        var c = mapa(cuest);
        return (R.CUESTIONARIO || []).filter(function (q) { return !texto(c[q.n]); }).map(function (q) { return q.n; });
    }

    /* Qué falta para poder aplicar el IEC (misma forma que validarCedula). */
    function validar(iec) {
        var d = mapa(iec), faltan = [];
        var c = calificar(d.respuestas);
        if (!c.completo) faltan.push('Contestar los ' + c.sinContestar.length + ' reactivos que faltan (el IEC no admite "No aplica")');
        var q = faltanCuestionario(d.cuestionario);
        if (q.length) faltan.push('Anotar la respuesta del candidato en ' + q.length + ' pregunta' + (q.length > 1 ? 's' : '') + ' del cuestionario');
        if (!texto(d.fecha)) faltan.push('Fecha de aplicación');
        return faltan;
    }

    /* Sugerencias a partir de lo que el candidato YA entregó por la
       plataforma. Solo se sugiere lo que tiene respaldo documental: los
       conocimientos (el Examen de Conocimientos presentado) y los productos
       cuyo documento está en el expediente. Los desempeños y las
       actitudes salen del video, así que ahí no se sugiere nada: los marca
       el evaluador. */
    var PRODUCTO_DOC = {
        P1E2: ['documentos_sesion_data', 'ficha'],
        P1E3: ['documentos_sesion_data', 'consentimiento'],
        P1E4: ['documentos_sesion_data', 'plan_seguimiento'],
        P2E4: ['documentos_sesion_data', 'plan_sesion']
    };
    function sugerencias(row) {
        row = mapa(row);
        var out = {}, fuentes = {};
        var ex = mapa(row.examen_conocimientos_data);
        if (ex.submitted) R.REACTIVOS.forEach(function (r) {
            if (r.tipo === 'C') { out[r.n] = SI; fuentes[r.n] = 'Examen de Conocimientos presentado'; }
        });
        R.REACTIVOS.forEach(function (r) {
            var d = PRODUCTO_DOC[r.crit];
            if (!d) return;
            var data = mapa(row[d[0]]);
            var ruta = mapa(data.documentosNextcloud)[d[1]];
            if (typeof ruta === 'string' && ruta && ruta !== 'MANUAL_FORM_FALLBACK') {
                out[r.n] = SI; fuentes[r.n] = 'El documento está en el expediente';
            }
        });
        return { respuestas: out, fuentes: fuentes };
    }

    /* Lo que se guarda en evaluaciones.iec. Conserva quién y cuándo. */
    function guardar(iec, datos, o) {
        o = o || {};
        var prev = mapa(iec), d = mapa(datos);
        var c = calificar(d.respuestas);
        var cuest = {};
        (R.CUESTIONARIO || []).forEach(function (q) { if (texto(mapa(d.cuestionario)[q.n])) cuest[q.n] = texto(mapa(d.cuestionario)[q.n]); });
        return Object.assign({}, prev, {
            version: VERSION,
            respuestas: mapa(d.respuestas),
            observaciones: mapa(d.observaciones),
            cuestionario: cuest,
            fecha: texto(d.fecha),
            puntos: c.puntos, penalizacion: c.penalizacion, total: c.total, juicio: c.juicio,
            completo: c.completo && !faltanCuestionario(cuest).length,
            por: o.por || prev.por || '',
            actualizado_at: o.ahora || new Date().toISOString()
        });
    }

    /* Agrupa los reactivos para la pantalla: por elemento y, dentro, por el
       encabezado del grupo tal como aparece impreso en el instrumento. */
    function secciones() {
        var out = [], porElem = {};
        R.REACTIVOS.forEach(function (r) {
            if (!porElem[r.elem]) { porElem[r.elem] = { elem: r.elem, titulo: R.ELEMENTOS[r.elem], grupos: [], _g: {} }; out.push(porElem[r.elem]); }
            var e = porElem[r.elem], llave = r.tipo + '|' + r.grupo;
            if (!e._g[llave]) { e._g[llave] = { titulo: r.grupo, tipo: r.tipo, tipoNombre: R.TIPOS[r.tipo], reactivos: [] }; e.grupos.push(e._g[llave]); }
            e._g[llave].reactivos.push(r);
        });
        out.forEach(function (e) { delete e._g; });
        return out.sort(function (a, b) { return a.elem - b.elem; });
    }

    var api = { VERSION: VERSION, SI: SI, NO: NO, calificar: calificar, validar: validar,
        sugerencias: sugerencias, guardar: guardar, secciones: secciones, criterios: criterios,
        faltanCuestionario: faltanCuestionario, cuestionario: R.CUESTIONARIO,
        redondear: redondear, reactivos: R.REACTIVOS };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.Iec = api;
})(typeof window !== 'undefined' ? window : globalThis);
