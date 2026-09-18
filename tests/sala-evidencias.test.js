// tests/sala-evidencias.test.js — correr con: node --test tests/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../sala-evidencias.js');

const MIN = 60000;
const T = Date.parse('2026-09-25T16:00:00Z'); // jueves 25 sep 2026, 10:00 en México
const reserva = (estado) => ({ id: 'r1', inicio: '2026-09-25T16:00:00.000Z', fin: '2026-09-25T17:30:00.000Z', estado: estado || 'reservada' });
const SALA = { url: 'https://us06web.zoom.us/j/82757263451?pwd=abc', id: '827 5726 3451', clave: 'PAIDEIA' };

test('fechas en hora de México (UTC−6, sin horario de verano)', () => {
    assert.equal(S.mxAIso('2026-09-25', '10:00'), '2026-09-25T16:00:00.000Z');
    assert.equal(S.hora('2026-09-25T16:00:00Z'), '10:00');
    assert.equal(S.hora('2026-09-25T06:05:00Z'), '00:05');
    assert.equal(S.horarioTexto('2026-09-25T16:00:00Z', '2026-09-25T17:30:00Z'), '10:00 a 11:30 h');
    assert.equal(S.fechaISO(Date.parse('2026-09-26T05:30:00Z')), '2026-09-25'); // 23:30 del 25 en México
    assert.match(S.fechaLarga('2026-10-15'), /15 de octubre de 2026/);
});

test('limiteDesde: día de la autorización en México + N días', () => {
    assert.equal(S.limiteDesde('2026-09-10T16:00:00Z', 30), '2026-10-10');
    assert.equal(S.limiteDesde('2026-09-11T03:00:00Z', 30), '2026-10-10'); // 21:00 del 10 en México
    assert.equal(S.limiteDesde(null, 30), null);
    assert.equal(S.limiteDesde('no es fecha', 30), null);
});

test('limiteInfo: ok, pronto (≤7 y último día), vencido, entregada, sin límite', () => {
    assert.deepEqual(S.limiteInfo('2026-10-15', '2026-10-03', false), { clave: 'ok', dias: 12, limite: '2026-10-15' });
    assert.equal(S.limiteInfo('2026-10-15', '2026-10-08', false).clave, 'pronto');
    assert.deepEqual(S.limiteInfo('2026-10-15', '2026-10-15', false), { clave: 'pronto', dias: 0, limite: '2026-10-15' });
    assert.deepEqual(S.limiteInfo('2026-10-15', '2026-10-16', false), { clave: 'vencido', dias: -1, limite: '2026-10-15' });
    assert.equal(S.limiteInfo('2026-10-15', '2026-10-16', true).clave, 'entregada');
    assert.equal(S.limiteInfo(null, '2026-10-16', false), null);
});

test('estado: sin reserva y cancelada', () => {
    assert.equal(S.estado({ reserva: null }, T).clave, 'sin_reserva');
    assert.equal(S.estado({ reserva: reserva('cancelada') }, T).clave, 'sin_reserva');
    assert.equal(S.estado(null, T).clave, 'sin_reserva');
});

test('estado: antes de la ventana, con cuenta regresiva a la apertura', () => {
    const e = S.estado({ reserva: reserva(), minutos_antes: 10, sala: null }, T - 11 * MIN);
    assert.equal(e.clave, 'antes');
    assert.equal(e.abreEnMs, MIN);
});

test('estado: la ventana abre exactamente N min antes y cierra exactamente al fin', () => {
    assert.equal(S.estado({ reserva: reserva(), minutos_antes: 10, sala: SALA }, T - 10 * MIN).clave, 'abierta');
    assert.equal(S.estado({ reserva: reserva(), minutos_antes: 10, sala: SALA }, T + 90 * MIN).clave, 'abierta');
    assert.equal(S.estado({ reserva: reserva(), minutos_antes: 10, sala: SALA }, T + 90 * MIN + 1).clave, 'terminada');
});

test('estado: en la ventana pero sin enlace del servidor → sigue "antes" esperando', () => {
    const e = S.estado({ reserva: reserva(), minutos_antes: 10, sala: null }, T);
    assert.equal(e.clave, 'antes');
    assert.equal(e.esperandoServidor, true);
});

test('estado: no asistió y asistió (ya pasó)', () => {
    assert.equal(S.estado({ reserva: reserva('no_asistio') }, T).clave, 'no_asistio');
    assert.equal(S.estado({ reserva: reserva('asistio') }, T + 200 * MIN).clave, 'terminada');
});

test('puedeCambiar: solo con N horas o más de anticipación', () => {
    assert.equal(S.puedeCambiar(reserva(), 24, T - 24 * 60 * MIN), true);
    assert.equal(S.puedeCambiar(reserva(), 24, T - 23 * 60 * MIN), false);
    assert.equal(S.puedeCambiar(null, 24, T), false);
});

test('cuentaRegresiva', () => {
    assert.equal(S.cuentaRegresiva(59 * MIN), '59 min');
    assert.equal(S.cuentaRegresiva(90 * MIN), '1 h 30 min');
    assert.equal(S.cuentaRegresiva(26 * 60 * MIN), '1 día 2 h');
    assert.equal(S.cuentaRegresiva(3 * 24 * 60 * MIN), '3 días');
    assert.equal(S.cuentaRegresiva(0), 'ya');
});

const PLANTILLA = { dias: [4], horas: ['09:00', '10:00', '11:00'], duracion: 90, colchon: 15, desde: '2026-09-24', hasta: '2026-10-01' };
const AHORA = Date.parse('2026-09-20T00:00:00Z');

test('generarHorarios: jueves, sin traslapes entre sí (colchón incluido)', () => {
    const r = S.generarHorarios(PLANTILLA, [], AHORA);
    assert.deepEqual(r.nuevos.map(h => h.inicio), [
        '2026-09-24T15:00:00.000Z', '2026-09-24T17:00:00.000Z',
        '2026-10-01T15:00:00.000Z', '2026-10-01T17:00:00.000Z'
    ]);
    assert.equal(r.nuevos[0].fin, '2026-09-24T16:30:00.000Z');
    assert.equal(r.nuevos[0].colchon_min, 15);
    assert.equal(r.omitidos.length, 2); // las de 10:00 chocan con 09:00 + 90 + 15
    assert.ok(r.omitidos.every(o => /traslapa/.test(o.motivo)));
});

test('generarHorarios: respeta los horarios que ya existen y omite los pasados', () => {
    const existentes = [{ inicio: '2026-09-24T17:00:00Z', fin: '2026-09-24T18:30:00Z', colchon_min: 15 }];
    const r = S.generarHorarios(PLANTILLA, existentes, AHORA);
    assert.ok(!r.nuevos.some(h => h.inicio === '2026-09-24T17:00:00.000Z'));
    const pasado = S.generarHorarios(PLANTILLA, [], Date.parse('2026-09-28T00:00:00Z'));
    assert.ok(pasado.nuevos.every(h => h.inicio.startsWith('2026-10-01')));
    assert.ok(pasado.omitidos.some(o => o.motivo === 'ya pasó'));
});

test('generarHorarios: datos inválidos → error sin horarios', () => {
    assert.ok(S.generarHorarios(Object.assign({}, PLANTILLA, { duracion: 0 }), [], AHORA).error);
    assert.ok(S.generarHorarios(Object.assign({}, PLANTILLA, { hasta: '2026-09-01' }), [], AHORA).error);
});

test('agruparPorDia: por fecha de México, en orden', () => {
    const g = S.agruparPorDia([
        { id: 'b', inicio: '2026-09-25T17:00:00Z', fin: '2026-09-25T18:30:00Z' },
        { id: 'a', inicio: '2026-09-25T15:00:00Z', fin: '2026-09-25T16:30:00Z' },
        { id: 'c', inicio: '2026-09-26T05:00:00Z', fin: '2026-09-26T06:30:00Z' } // 23:00 del 25 en México
    ]);
    assert.equal(g.length, 1);
    assert.deepEqual(g[0].horarios.map(h => h.id), ['a', 'b', 'c']);
    assert.equal(g[0].fecha, '2026-09-25');
});

test('esUrlZoom: solo enlaces https de zoom.us', () => {
    assert.equal(S.esUrlZoom('https://us06web.zoom.us/j/82757263451?pwd=abc.1'), true);
    assert.equal(S.esUrlZoom('https://evil.com/zoom.us/j/1'), false);
    assert.equal(S.esUrlZoom('javascript:alert(1)'), false);
    assert.equal(S.esUrlZoom('http://zoom.us/j/1'), false);
});
