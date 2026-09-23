// tests/cierre.test.js — correr con: node --test tests/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../cierre.js');

const lleno = () => {
    const d = C.prellenarCandidato({});
    C.ASPECTOS_SERVICIO.forEach((_, i) => { d.servicio.aspectos[i] = 'Bueno'; });
    C.ATENCION_PREGUNTAS.forEach((_, i) => { d.atencion.respuestas[i] = 'Bueno'; });
    d.servicio.medio = 'Promoción directa';
    d.atencion.medio = 'Presencial';
    return d;
};
const verLleno = () => {
    const v = C.prellenarVerificacion('HUMBERTO LOT NAVARRO NAVARRO');
    C.VERIFICACION.forEach(x => { v.items[x.n] = 'si'; });
    return v;
};

test('los tres formatos traen lo que pide el machote', () => {
    assert.equal(C.ASPECTOS_SERVICIO.length, 10);
    assert.equal(C.VERIFICACION.length, 14);
    assert.equal(C.ATENCION_PREGUNTAS.length, 5);
    assert.deepEqual(C.ESCALA_SERVICIO, ['Bueno', 'Regular', 'Malo']);
    assert.equal(C.MEDIOS_EVALUACION.length, 5);
    assert.equal(C.MEDIOS_ATENCION.length, 4);
    // la Verificación va en sus 3 bloques, numerada del 1 al 14 sin huecos
    assert.deepEqual(C.VERIFICACION.map(v => v.n), Array.from({ length: 14 }, (_, i) => i + 1));
    assert.deepEqual([...new Set(C.VERIFICACION.map(v => v.grupo))],
        ['Integración del portafolio de evidencias', 'Verificación del Instrumento de evaluación', 'Productos y entrega']);
    assert.ok(C.VERIFICACION.every(v => v.texto.length > 20));
});

test('cada hoja la llena quien le toca: dos del candidato y una del Centro', () => {
    // el módulo ya no ofrece una sola función que mezcle las tres
    assert.equal(typeof C.prellenarCandidato, 'function');
    assert.equal(typeof C.prellenarVerificacion, 'function');
    assert.equal(C.prellenar, undefined);
    assert.ok(!Object.keys(C.prellenarCandidato({})).includes('verificacion'), 'al candidato no se le pide la Verificación Interna');
    assert.deepEqual(Object.keys(C.prellenarVerificacion('X')).sort(), ['items', 'observaciones', 'verificador']);
});

test('prellenarCandidato: toma del expediente lo que ya capturó y no inventa opiniones', () => {
    const d = C.prellenarCandidato({
        autodiagnostico_data: { personalData: { domicilio: 'Av. Siempre Viva 1', email: 'ana@x.mx', telefonoCelular: '8110000000' } },
        plan_evaluacion_data: { planData: { lugarEvaluacion: 'Zoom' } }
    });
    assert.equal(d.atencion.domicilio, 'Av. Siempre Viva 1');
    assert.equal(d.atencion.email, 'ana@x.mx');
    assert.equal(d.atencion.telefono, '8110000000');
    assert.equal(d.atencion.lugar, 'Zoom');
    assert.deepEqual(d.servicio.aspectos, {}, 'ninguna opinión viene precargada');
    assert.deepEqual(d.atencion.respuestas, {});
    // sin expediente no truena
    const v = C.prellenarCandidato(null);
    assert.equal(v.atencion.domicilio, '');
    assert.equal(v.atencion.lugar, 'Zoom');
    assert.equal(C.prellenarVerificacion('HUMBERTO').verificador, 'HUMBERTO');
});

test('validarCandidato: le habla al candidato y solo de lo suyo', () => {
    assert.deepEqual(C.validarCandidato(lleno()), []);
    const faltan = C.validarCandidato(C.prellenarCandidato({}));
    assert.ok(faltan.some(f => /10 aspectos del servicio que recibiste/.test(f)));
    assert.ok(faltan.some(f => /5 preguntas sobre la atención que te dieron/.test(f)));
    assert.ok(faltan.some(f => /Cómo conociste al Centro/.test(f)));
    assert.ok(faltan.some(f => /Por qué medio te atendieron/.test(f)));
    assert.ok(!faltan.some(f => /Verificación/.test(f)), 'la Verificación Interna no es cosa suya');
});

test('validarVerificacion: solo los 14 puntos y quién verifica', () => {
    assert.deepEqual(C.validarVerificacion(verLleno()), []);
    const faltan = C.validarVerificacion(C.prellenarVerificacion(''));
    assert.ok(faltan.some(f => /14 puntos de la Verificación/.test(f)));
    assert.ok(faltan.some(f => /Nombre de quien verifica/.test(f)));
    assert.equal(faltan.length, 2);
});

test('una casilla suelta se reporta en singular y un valor inventado no cuenta', () => {
    const d = lleno();
    delete d.servicio.aspectos[3];
    assert.ok(C.validarCandidato(d).some(f => /1 aspecto del servicio/.test(f)));
    d.servicio.aspectos[3] = 'Excelente';
    assert.ok(C.validarCandidato(d).some(f => /1 aspecto del servicio/.test(f)), 'solo Bueno/Regular/Malo cuentan');
    const v = verLleno();
    v.items[7] = 'tal vez';
    assert.ok(C.validarVerificacion(v).some(f => /1 punto de la Verificación/.test(f)));
    v.items[7] = 'si'; v.verificador = '   ';
    assert.ok(C.validarVerificacion(v).some(f => /Nombre de quien verifica/.test(f)), 'espacios no son un nombre');
});

test('avance: 15 casillas del candidato y 14 puntos del Centro', () => {
    assert.deepEqual(C.avanceCandidato(C.prellenarCandidato({})), { hechas: 0, total: 15, completo: false });
    assert.deepEqual(C.avanceCandidato(lleno()), { hechas: 15, total: 15, completo: true });
    const d = lleno();
    delete d.atencion.respuestas[0];
    assert.deepEqual(C.avanceCandidato(d), { hechas: 14, total: 15, completo: false });
    assert.deepEqual(C.avanceVerificacion(verLleno()), { hechas: 14, total: 14, completo: true });
    assert.equal(C.avanceCandidato(null).hechas, 0, 'sin datos no truena');
    assert.equal(C.avanceVerificacion(null).hechas, 0);
});

test('guardarVerificacion: marca completo solo cuando ya no falta nada', () => {
    const g = C.guardarVerificacion({ por: 'viejo@x.mx' }, verLleno(), { por: 'humberto@x.mx', ahora: '2026-09-22T12:00:00.000Z' });
    assert.equal(g.completo, true);
    assert.equal(g.por, 'humberto@x.mx');
    assert.equal(g.actualizado_at, '2026-09-22T12:00:00.000Z');
    assert.equal(g.version, C.VERSION);
    assert.equal(g.verificacion.verificador, 'HUMBERTO LOT NAVARRO NAVARRO');
    assert.equal(g.verificacion.items[1], 'si');
    const medio = C.guardarVerificacion(null, C.prellenarVerificacion(''), { por: 'x' });
    assert.equal(medio.completo, false);
});
