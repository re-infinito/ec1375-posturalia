// tests/iec.test.js — correr con: node --test tests/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const I = require('../iec.js');
const R = require('../iec-reactivos.js');

const todos = (v) => { const o = {}; R.REACTIVOS.forEach(r => { o[r.n] = v; }); return o; };
const cuestLleno = () => { const o = {}; R.CUESTIONARIO.forEach(q => { o[q.n] = q.relacionar ? 'a),b),c)' : 'a)'; }); return o; };

test('la plantilla trae los 142 reactivos y sus pesos cuadran con el propio IEC', () => {
    assert.equal(R.REACTIVOS.length, 142);
    assert.deepEqual(R.REACTIVOS.map(r => r.n), Array.from({ length: 142 }, (_, i) => i + 1));
    const calif = R.REACTIVOS.filter(r => r.tipo !== 'AHV');
    const ahv = R.REACTIVOS.filter(r => r.tipo === 'AHV');
    assert.equal(calif.length, 137);
    assert.equal(ahv.length, 5);
    assert.equal(I.redondear(calif.reduce((a, r) => a + r.peso, 0)), 100.08);
    assert.equal(I.redondear(ahv.reduce((a, r) => a + r.peso, 0)), 2.05);
    // los tres pesos que declara la página 2 del instrumento
    const cuenta = p => calif.filter(r => r.peso === p).length;
    assert.deepEqual([cuenta(0.29), cuenta(0.59), cuenta(2.94)], [69, 51, 17]);
    // toda página cae dentro del instrumento y toda y dentro de la hoja carta
    assert.ok(R.REACTIVOS.every(r => r.pag >= 5 && r.pag <= R.PAGINAS && r.y > 40 && r.y < 760));
    assert.ok(R.REACTIVOS.every(r => r.texto.length > 3 && r.grupo.length > 3));
});

test('calificar: todo cumplido da 100.08 y COMPETENTE', () => {
    const c = I.calificar(todos('si'));
    assert.equal(c.puntos, 100.08);
    assert.equal(c.penalizacion, 0);
    assert.equal(c.total, 100.08);
    assert.equal(c.juicio, 'COMPETENTE');
    assert.equal(c.completo, true);
    assert.deepEqual(c.criteriosSinCumplir, []);
});

test('calificar: las Actitudes/Hábitos/Valores no suman, solo restan', () => {
    const ahv = R.REACTIVOS.filter(r => r.tipo === 'AHV');
    const solo = {}; ahv.forEach(r => { solo[r.n] = 'si'; });
    assert.equal(I.calificar(solo).puntos, 0, 'presentarlas no suma un punto');
    const falla = Object.assign(todos('si'), { [ahv[0].n]: 'no' });
    const c = I.calificar(falla);
    assert.equal(c.penalizacion, ahv[0].peso);
    assert.equal(c.total, I.redondear(100.08 - ahv[0].peso));
    assert.equal(c.juicio, 'COMPETENTE', 'una actitud ausente no tumba el juicio por sí sola');
});

test('calificar: el segundo criterio solo cuenta producto y desempeño', () => {
    const sinCriterio = todos('si');
    R.REACTIVOS.filter(r => r.crit === 'P2E1').forEach(r => { sinCriterio[r.n] = 'no'; });
    const c = I.calificar(sinCriterio);
    assert.deepEqual(c.criteriosSinCumplir, ['P2E1']);
    assert.equal(c.juicio, 'NO COMPETENTE');
    // un conocimiento en NO baja el puntaje pero no cuenta como criterio sin cumplir
    const sinConoc = todos('si');
    const c1 = R.REACTIVOS.find(r => r.tipo === 'C');
    sinConoc[c1.n] = 'no';
    assert.deepEqual(I.calificar(sinConoc).criteriosSinCumplir, []);
});

test('calificar: por debajo del umbral es NO COMPETENTE aunque cubra los criterios', () => {
    const casi = todos('si');
    // quitar un reactivo de peso mayor deja 97.14, abajo de 97.64
    const mayor = R.REACTIVOS.find(r => r.peso === 2.94);
    casi[mayor.n] = 'no';
    const c = I.calificar(casi);
    assert.equal(c.total, I.redondear(100.08 - 2.94));
    assert.equal(c.alcanzaPuntaje, false);
    assert.equal(c.juicio, 'NO COMPETENTE');
    assert.deepEqual(c.criteriosSinCumplir, [], 'su criterio sigue cubierto por los otros reactivos');
});

test('calificar: sin contestar no se cuenta como cumplido ni como fallado', () => {
    const c = I.calificar({});
    assert.equal(c.contestados, 0);
    assert.equal(c.sinContestar.length, 142);
    assert.equal(c.puntos, 0);
    assert.equal(c.penalizacion, 0, 'una actitud sin contestar todavía no resta');
    assert.equal(c.completo, false);
    assert.equal(I.calificar({ 1: 'tal vez', 2: '' }).contestados, 0);
});

test('validar: exige contestar todo, el cuestionario y la fecha', () => {
    assert.deepEqual(I.validar({ respuestas: todos('si'), cuestionario: cuestLleno(), fecha: '2026-09-20' }), []);
    const faltan = I.validar({ respuestas: {}, fecha: '' });
    assert.ok(faltan.some(f => /142 reactivos/.test(f)));
    assert.ok(faltan.some(f => /37 preguntas del cuestionario/.test(f)));
    assert.ok(faltan.includes('Fecha de aplicación'));
    // una sola pregunta pendiente se dice en singular
    const casi = cuestLleno(); delete casi[R.CUESTIONARIO[0].n];
    assert.ok(I.validar({ respuestas: todos('si'), cuestionario: casi, fecha: '2026-09-20' })
        .some(f => /1 pregunta del cuestionario/.test(f)));
});

test('el cuestionario del instrumento: 37 preguntas con su lugar en la plantilla', () => {
    assert.equal(R.CUESTIONARIO.length, 37);
    assert.ok(R.CUESTIONARIO.every(q => q.pag >= 29 && q.pag <= 73 && q.y > 40 && q.y < 760 && q.x > 0));
    assert.ok(R.CUESTIONARIO.every(q => q.pregunta.length > 10 && q.opciones.length > 1));
    assert.equal(R.CUESTIONARIO.filter(q => q.relacionar).length, 4, 'las de relacionar columnas piden varias letras');
    // ni un rastro de quien entregó el expediente del que salió la plantilla
    const texto = R.CUESTIONARIO.map(q => q.pregunta + q.opciones.join(' ')).join(' ');
    assert.ok(!/HUMBERTO|NAVARRO|ELISMA|JONGUITUD|Rubrica|N-FO-03/i.test(texto));
    assert.deepEqual(I.faltanCuestionario(cuestLleno()), []);
    assert.equal(I.faltanCuestionario({}).length, 37);
    assert.equal(I.faltanCuestionario({ 1: '   ' }).length, 37, 'espacios en blanco no cuentan como respuesta');
});

test('sugerencias: solo propone lo que el expediente respalda', () => {
    const vacio = I.sugerencias({});
    assert.deepEqual(vacio.respuestas, {}, 'sin expediente no sugiere nada');
    const row = {
        examen_conocimientos_data: { submitted: true },
        documentos_sesion_data: { documentosNextcloud: { ficha: 'Portafolios/A/03-Evaluacion/F.pdf', consentimiento: 'MANUAL_FORM_FALLBACK' } }
    };
    const s = I.sugerencias(row);
    const conoc = R.REACTIVOS.filter(r => r.tipo === 'C');
    assert.ok(conoc.every(r => s.respuestas[r.n] === 'si'), 'el examen presentado cubre los conocimientos');
    const p1e2 = R.REACTIVOS.filter(r => r.crit === 'P1E2');
    assert.ok(p1e2.every(r => s.respuestas[r.n] === 'si'));
    assert.ok(R.REACTIVOS.filter(r => r.crit === 'P1E3').every(r => !s.respuestas[r.n]), 'el formulario alterno no cuenta como entregado');
    assert.ok(R.REACTIVOS.filter(r => r.tipo === 'D' || r.tipo === 'AHV').every(r => !s.respuestas[r.n]), 'desempeños y actitudes los marca el evaluador con el video');
});

test('guardar: deja el puntaje y el juicio calculados, no los del cliente', () => {
    const g = I.guardar({ por: 'viejo@x.mx' }, { respuestas: todos('si'), cuestionario: cuestLleno(), fecha: '2026-09-20', juicio: 'NO COMPETENTE', total: 3 },
        { por: 'eval@x.mx', ahora: '2026-09-22T10:00:00.000Z' });
    assert.equal(g.juicio, 'COMPETENTE');
    assert.equal(g.total, 100.08);
    assert.equal(g.por, 'eval@x.mx');
    assert.equal(g.actualizado_at, '2026-09-22T10:00:00.000Z');
    assert.equal(g.version, I.VERSION);
    assert.equal(g.completo, true);
    assert.equal(Object.keys(g.cuestionario).length, 37);
    // el cuestionario a medias deja el IEC incompleto aunque los 142 estén
    const medio = I.guardar(null, { respuestas: todos('si'), cuestionario: { 1: 'c)' }, fecha: '2026-09-20' }, { por: 'x' });
    assert.equal(medio.completo, false);
    assert.deepEqual(medio.cuestionario, { 1: 'c)' }, 'se limpian los espacios y se guarda solo lo contestado');
});

test('secciones: los 4 elementos, con todos los reactivos y sin repetir', () => {
    const s = I.secciones();
    assert.deepEqual(s.map(e => e.elem), [1, 2, 3, 4]);
    const n = s.flatMap(e => e.grupos.flatMap(g => g.reactivos.map(r => r.n)));
    assert.equal(n.length, 142);
    assert.equal(new Set(n).size, 142);
    assert.ok(s.every(e => e.titulo && e.grupos.every(g => g.titulo && g.tipoNombre)));
});
