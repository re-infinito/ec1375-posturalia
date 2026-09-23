// tests/cierre.test.js — correr con: node --test tests/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../cierre.js');

const lleno = () => {
    const d = C.prellenar({}, 'HUMBERTO LOT NAVARRO NAVARRO');
    C.ASPECTOS_SERVICIO.forEach((_, i) => { d.servicio.aspectos[i] = 'Bueno'; });
    C.VERIFICACION.forEach(v => { d.verificacion.items[v.n] = 'si'; });
    C.ATENCION_PREGUNTAS.forEach((_, i) => { d.atencion.respuestas[i] = 'Bueno'; });
    d.servicio.medio = 'Promoción directa';
    d.atencion.medio = 'Presencial';
    return d;
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

test('prellenar: toma del expediente lo que ya se capturó y no inventa lo demás', () => {
    const d = C.prellenar({
        autodiagnostico_data: { personalData: { domicilio: 'Av. Siempre Viva 1', email: 'ana@x.mx', telefonoCelular: '8110000000' } },
        plan_evaluacion_data: { planData: { lugarEvaluacion: 'Zoom' } }
    }, 'HUMBERTO LOT NAVARRO NAVARRO');
    assert.equal(d.atencion.domicilio, 'Av. Siempre Viva 1');
    assert.equal(d.atencion.email, 'ana@x.mx');
    assert.equal(d.atencion.telefono, '8110000000');
    assert.equal(d.atencion.lugar, 'Zoom');
    assert.equal(d.verificacion.verificador, 'HUMBERTO LOT NAVARRO NAVARRO');
    assert.deepEqual(d.servicio.aspectos, {}, 'ninguna opinión viene precargada');
    assert.deepEqual(d.verificacion.items, {});
    assert.deepEqual(d.atencion.respuestas, {});
    // sin expediente no truena y deja todo vacío salvo el lugar por omisión
    const v = C.prellenar(null, '');
    assert.equal(v.atencion.domicilio, '');
    assert.equal(v.verificacion.verificador, '');
    assert.equal(v.atencion.lugar, 'Zoom');
});

test('validar: dice exactamente qué falta, y nada cuando está completo', () => {
    assert.deepEqual(C.validar(lleno()), []);
    const faltan = C.validar(C.prellenar({}, ''));
    assert.ok(faltan.some(f => /10 aspectos de la Cédula/.test(f)));
    assert.ok(faltan.some(f => /14 puntos de la Verificación/.test(f)));
    assert.ok(faltan.some(f => /5 preguntas del Formato de Atención/.test(f)));
    assert.ok(faltan.some(f => /medio por el que el candidato contactó/.test(f)));
    assert.ok(faltan.some(f => /Nombre de quien verifica/.test(f)));
    assert.ok(faltan.some(f => /medio de contacto del Formato de Atención/.test(f)));
});

test('validar: una casilla suelta se reporta en singular y un valor inventado no cuenta', () => {
    const d = lleno();
    delete d.servicio.aspectos[3];
    assert.ok(C.validar(d).some(f => /1 aspecto de la Cédula/.test(f)));
    d.servicio.aspectos[3] = 'Excelente';
    assert.ok(C.validar(d).some(f => /1 aspecto de la Cédula/.test(f)), 'solo Bueno/Regular/Malo cuentan');
    const v = lleno();
    v.verificacion.items[7] = 'tal vez';
    assert.ok(C.validar(v).some(f => /1 punto de la Verificación/.test(f)));
    const n = lleno();
    n.verificacion.verificador = '   ';
    assert.ok(C.validar(n).some(f => /Nombre de quien verifica/.test(f)), 'espacios no son un nombre');
});

test('avance: cuenta las 29 casillas de los tres formatos', () => {
    assert.deepEqual(C.avance(C.prellenar({}, '')), { hechas: 0, total: 29, completo: false });
    assert.deepEqual(C.avance(lleno()), { hechas: 29, total: 29, completo: true });
    const d = lleno();
    delete d.atencion.respuestas[0];
    assert.deepEqual(C.avance(d), { hechas: 28, total: 29, completo: false });
    assert.equal(C.avance(null).hechas, 0, 'sin datos no truena');
});

test('guardar: marca completo solo cuando ya no falta nada, y conserva quién lo llenó', () => {
    const g = C.guardar({ por: 'viejo@x.mx' }, lleno(), { por: 'humberto@x.mx', ahora: '2026-09-22T12:00:00.000Z' });
    assert.equal(g.completo, true);
    assert.equal(g.por, 'humberto@x.mx');
    assert.equal(g.actualizado_at, '2026-09-22T12:00:00.000Z');
    assert.equal(g.version, C.VERSION);
    assert.equal(g.verificacion.verificador, 'HUMBERTO LOT NAVARRO NAVARRO');
    const medio = C.guardar(null, C.prellenar({}, ''), { por: 'x' });
    assert.equal(medio.completo, false);
});
