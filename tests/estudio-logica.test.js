const test = require('node:test');
const assert = require('node:assert');
const E = require('../estudio-logica.js');

/* Datos mínimos con la misma forma que ruta-estudio:data. La paridad completa
   contra el motor V4.4 original (3000 estados aleatorios con los datos reales)
   se verificó el 17 sep al portar — ver docs/superpowers/specs/2026-09-17-visor-estudio-unificado-design.md. */
function datos() {
    const rx = {};
    for (let n = 1; n <= 142; n++) rx[n] = { criterio: n <= 2 ? 'E1·D1' : (n === 3 ? 'E2·C4' : 'E3·P1'), peso: n === 1 ? 2.94 : 0.59, critico: n === 1 };
    return {
        rx,
        criterios: { 'E1·D1': { titulo: 'Protocolos', elem: 1 }, 'E2·C4': { titulo: 'Higiene de columna', elem: 2 }, 'E3·P1': { titulo: 'Otro', elem: 3 } },
        slides: [
            { sid: 'a', mod: 1, crit: ['E1·D1'], rx: [1], route: 'remedial', core: true, titulo: 'A' },
            { sid: 'b', mod: 1, crit: ['E1·D1'], rx: [2], route: 'both', core: false, titulo: 'B' },
            { sid: 'c', mod: 2, crit: ['E2·C4'], rx: [3], route: 'optional', core: true, titulo: 'C' },
            { sid: 'd', mod: 2, crit: ['E2·C4'], rx: [3], route: 'remedial', core: false, titulo: 'D' }
        ],
        mediaBySid: { a: ['v1'] },
        objetivos: {
            OB1: { criterionId: 'E1·D1', rxAutodiagnostico: 1, weight: 1, relatedSlides: ['a', 'zz'], name: 'Uno' },
            OB2: { criterionId: 'E2·C4', rxAutodiagnostico: 3, weight: 5, relatedSlides: ['d'], name: 'Dos' }
        },
        banco: [
            { questionId: 'OB1-1', objectiveId: 'OB1', format: 'mc', options: ['x', 'y'], answer: 1 },
            { questionId: 'OB1-2', objectiveId: 'OB1', format: 'mc', options: ['x', 'y'], answer: 0 },
            { questionId: 'OB2-1', objectiveId: 'OB2', format: 'col', pairs: [['p', 'q'], ['r', 's']] }
        ]
    };
}
const MEDIA = { v1: { required: true } };
function semilla(no) {
    const si = []; const nos = [];
    for (let n = 1; n <= 142; n++) (no.includes(n) ? nos : si).push(n);
    return { answeredYes: si, answeredNo: nos };
}

test('normaliza: 142 respuestas cierran el registro y calculan obligatorios', () => {
    const L = E.crear(datos(), MEDIA);
    const s = L.normaliza(semilla([1, 3]));
    assert.strictEqual(s.diagnostic.completed, true);
    assert.strictEqual(s.diagnosticOriginal.locked, true);
    assert.deepStrictEqual(s.remediation.requiredCriteria, ['E1·D1'], 'solo el NO en reactivo crítico es obligatorio');
    assert.strictEqual(s.practice.requiredObjectives, 2);
});

test('brechas: orden por riesgo, pantallas de repaso y estado hecho', () => {
    const L = E.crear(datos(), MEDIA);
    const s = L.normaliza(semilla([1, 3]));
    const b = L.brechas(s);
    assert.deepStrictEqual(b.map(x => x.criterio), ['E1·D1', 'E2·C4']);
    assert.deepStrictEqual(b[0].pantallas, ['a', 'b']);
    assert.deepStrictEqual(b[1].pantallas, ['d'], 'excluye route optional');
    assert.strictEqual(b[0].obligatorio, true);
    assert.strictEqual(b[1].obligatorio, false);
});

test('visto bueno: bloqueado hasta reforzar los obligatorios; los recomendados no bloquean', () => {
    const L = E.crear(datos(), MEDIA);
    const s = L.normaliza(semilla([1, 3]));
    assert.deepStrictEqual(L.gateVobo(s), { ok: false, reason: 'remediation_required' });
    assert.strictEqual(L.darVoBo(s), false);
    L.marcarReforzado(s, ['E1·D1']);
    assert.deepStrictEqual(L.gateVobo(s), { ok: true });
    assert.strictEqual(L.darVoBo(s, '2026-09-17'), true);
    assert.strictEqual(s.diagnostic.approved, true);
    assert.strictEqual(s.diagnostic.approvedAt, '2026-09-17');
});

test('práctica: requiere visto bueno; precarga de alineación completa la compuerta interna', () => {
    const L = E.crear(datos(), MEDIA);
    const s = L.normaliza(semilla([3]));
    assert.strictEqual(L.gatePractica(s).ok, false);
    L.darVoBo(s);
    assert.strictEqual(L.gatePractica(s).ok, true);
    assert.strictEqual(s.alignment.completed, false);
    L.precargarAlineacion(s);
    assert.strictEqual(s.alignment.completed, true);
    assert.deepStrictEqual(s.media.completed, ['v1']);
});

test('práctica: primero los temas en NO; fallo → verificación → needs_support; acierto completa', () => {
    const L = E.crear(datos(), MEDIA);
    const s = L.normaliza(semilla([3]));
    assert.deepStrictEqual(L.objetivosPendientes(s), ['OB2', 'OB1'], 'OB2 tiene su reactivo en NO');
    const q = L.D.banco[0];
    let r = L.responderPractica(s, q, false, L.fasePara(s, 'OB1'));
    assert.strictEqual(r.masteryState, 'awaiting_verification');
    assert.strictEqual(s.practice.objectives.OB1.selfReportConflict, true, 'el autodiagnóstico decía SÍ');
    assert.strictEqual(L.fasePara(s, 'OB1'), 'verificacion');
    assert.strictEqual(L.preguntaVerificacion(s, 'OB1', 'OB1-1', () => 0).questionId, 'OB1-2', 'variante distinta de la fallada');
    r = L.responderPractica(s, L.D.banco[1], false, 'verificacion');
    assert.strictEqual(r.masteryState, 'needs_support');
    assert.ok(L.brechas(s).some(b => b.criterio === 'E1·D1' && b.origen === 'demonstrated_gap'));
    r = L.responderPractica(s, L.D.banco[1], true, L.fasePara(s, 'OB1'));
    assert.strictEqual(r.cambio, 'mastered_in_practice');
    L.responderPractica(s, L.D.banco[2], true, 'inicial');
    assert.strictEqual(s.practice.completed, true);
    assert.deepStrictEqual(L.rutaObjetivo('OB1'), ['a'], 'ignora pantallas que no existen');
});

test('práctica voluntaria no toca el estado', () => {
    const L = E.crear(datos(), MEDIA);
    const s = L.normaliza(semilla([]));
    const antes = JSON.stringify(s);
    L.responderPractica(s, L.D.banco[0], false, 'voluntaria');
    assert.strictEqual(JSON.stringify(s), antes);
});

test('prepararPregunta y revisarPares', () => {
    const d = datos();
    const mc = E.prepararPregunta(d.banco[0], () => 0.99);
    assert.strictEqual(mc.tipo, 'mc');
    assert.strictEqual(mc.orden[mc.correcta].ok, true);
    const col = E.prepararPregunta(d.banco[2], () => 0.5);
    assert.strictEqual(col.tipo, 'col');
    assert.strictEqual(E.revisarPares(col.pares, col.pares.map(p => p[1])), true);
    assert.strictEqual(E.revisarPares(col.pares, ['s', 'q']), col.pares[0][1] === 's');
});

test('semillaDesdeAutodiagnostico: SI/NO por orden de claves', () => {
    assert.deepStrictEqual(E.semillaDesdeAutodiagnostico({ a: 'SI', b: 'NO', c: 'SI' }, ['a', 'b', 'c']), { answeredYes: [1, 3], answeredNo: [2] });
});

test('examen: responder, reintentar, limpiar incorrecta, avanzar y finalizar', () => {
    const R = [{ tema: 'Signos Vitales', opciones: ['a', 'b', 'c'], correcta: 2 }, { tema: 'Higiene de Columna', opciones: ['a', 'b'], correcta: 0 }];
    const X = E.examen;
    const st = X.nuevo(R, () => 0);
    assert.strictEqual(X.valido(st, R), true);
    assert.deepStrictEqual(st.order[0].optionOrder.slice().sort(), [0, 1, 2]);
    assert.strictEqual(X.responder(st, 0, 1, R), false);
    assert.strictEqual(st.firstAttemptCorrect[0], false);
    assert.strictEqual(X.limpiarIncorrecta(st, R), true);
    assert.strictEqual(st.answers[0], undefined);
    assert.strictEqual(X.responder(st, 0, 2, R), true);
    assert.strictEqual(st.firstAttemptCorrect[0], false, 'el primer intento queda registrado');
    assert.strictEqual(X.limpiarIncorrecta(st, R), false);
    assert.strictEqual(X.siguiente(st, R), 'siguiente');
    X.responder(st, 1, 0, R);
    assert.strictEqual(X.siguiente(st, R), 'fin');
    X.finalizar(st, R, '2026-09-17');
    assert.deepStrictEqual([st.submitted, st.score, st.correctas, st.fecha], [true, 100, 2, '2026-09-17']);
    assert.deepStrictEqual(X.temasRepasados(st, R), ['Signos Vitales']);
    assert.strictEqual(X.valido({ order: [] }, R), false);
    assert.strictEqual(X.valido({ order: [], submitted: true }, R), true, 'examen demo ya presentado');
});
