// tests/portafolio.test.js — correr con: node --test tests/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../portafolio.js');

// Texto de un PDF como lo entrega pdf.js (x, y de la línea base, ancho, alto).
const it = (str, x, y, w, h) => ({ str, x, y, w: w || str.length * 4, h: h || 8 });

test('agruparLineas: junta por línea base (±2 pt) y ordena de arriba a abajo y de izquierda a derecha', () => {
    const l = P._agruparLineas([it('Diego', 158, 700.2), it('Candidato/a:', 44, 700), it('Evaluadora:', 44, 740), it('', 300, 740)]);
    assert.equal(l.length, 2);
    assert.equal(l[0].texto, 'Evaluadora:');
    assert.equal(l[1].texto, 'Candidato/a: Diego');
});

test('ubicarCampo: el valor va en la columna donde está el nombre del candidato', () => {
    const lineas = P._agruparLineas([it('Evaluadora:', 44, 740), it('Centro de Evaluación:', 44, 721), it('Candidato/a:', 44, 684), it('Diego Garza', 196, 684, 44, 8)]);
    const c = P._ubicarCampo(lineas, /^Evaluador[a]?:/);
    assert.deepEqual({ x: c.x, y: c.y, lleno: c.lleno }, { x: 196, y: 740, lleno: false });
    assert.equal(c.size, 8);
    assert.equal(P._ubicarCampo(lineas, /^Centro de Evaluaci[oó]n:/).x, 196);
    assert.equal(P._ubicarCampo(lineas, /^No existe:/), null);
});

test('ubicarCampo: si el renglón ya trae valor, no se vuelve a escribir', () => {
    const lineas = P._agruparLineas([it('Evaluadora:', 44, 740), it('Luz Elisma', 196, 740), it('Candidato/a:', 44, 684), it('Diego', 196, 684)]);
    assert.equal(P._ubicarCampo(lineas, /^Evaluador[a]?:/).lleno, true);
});

test('ubicarCampo: sin renglón de candidato no adivina la columna', () => {
    assert.equal(P._ubicarCampo(P._agruparLineas([it('Evaluadora:', 44, 740)]), /^Evaluador[a]?:/), null);
});
