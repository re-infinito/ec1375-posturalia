// tests/recordatorios.test.js — correr con: node --test tests/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../lib/recordatorios.js');

const MIN = 60000, HORA = 60 * MIN;
const INICIO = '2026-10-05T15:00:00.000Z';        // lunes 5 oct, 9:00 en México
const FIN = '2026-10-05T16:30:00.000Z';
const T0 = Date.parse(INICIO);

test('cae en la ventana que le toca', () => {
    assert.equal(R.avisoPendiente(INICIO, T0 - 24 * HORA, {}), '24h');
    assert.equal(R.avisoPendiente(INICIO, T0 - 2 * HORA, {}), '2h');
    assert.equal(R.avisoPendiente(INICIO, T0 - 1 * HORA, {}), '1h');
});

test('no manda dos veces el mismo aviso', () => {
    const ya = { '24h': '2026-10-04T15:00:00Z' };
    assert.equal(R.avisoPendiente(INICIO, T0 - 24 * HORA, ya), null);
    assert.equal(R.avisoPendiente(INICIO, T0 - 2 * HORA, ya), '2h', 'los otros sí siguen pendientes');
});

test('nada si la sesión ya empezó, o si la fecha no sirve', () => {
    assert.equal(R.avisoPendiente(INICIO, T0 + MIN, {}), null);
    assert.equal(R.avisoPendiente(INICIO, T0 + 5 * HORA, {}), null);
    assert.equal(R.avisoPendiente('no es fecha', T0, {}), null);
});

test('muy encima de la hora ya no avisa: sería ruido', () => {
    assert.equal(R.avisoPendiente(INICIO, T0 - 10 * MIN, {}), null);
});

test('nada cuando falta mucho: a 3 días no toca todavía', () => {
    assert.equal(R.avisoPendiente(INICIO, T0 - 72 * HORA, {}), null);
});

/* La prueba que de verdad importa: el disparador corre CADA HORA en punto.
   Se simulan 48 h de corridas y se exige que lleguen los tres avisos, una sola
   vez cada uno y en orden — tanto para un horario en punto como para uno a la
   media, que con ventanas estrechas se quedaba sin el de 2 h y sin el de 1 h. */
function simularCronPorHoras(inicioIso) {
    const t0 = Date.parse(inicioIso);
    const enviados = {}, bitacora = [];
    // corridas en punto, desde 48 h antes hasta la hora de inicio
    const primera = Math.ceil((t0 - 48 * HORA) / HORA) * HORA;
    for (let t = primera; t <= t0; t += HORA) {
        const a = R.avisoPendiente(inicioIso, t, enviados);
        if (a) { enviados[a] = new Date(t).toISOString(); bitacora.push(a); }
    }
    return bitacora;
}

test('horario en punto: llegan los tres, en orden y sin repetir', () => {
    assert.deepEqual(simularCronPorHoras('2026-10-05T15:00:00.000Z'), ['24h', '2h', '1h']);
});

test('horario a la media hora: también llegan los tres', () => {
    assert.deepEqual(simularCronPorHoras('2026-10-05T15:30:00.000Z'), ['24h', '2h', '1h']);
});

test('a cualquier minuto de arranque llegan los tres', () => {
    for (let m = 0; m < 60; m += 7) {
        const iso = new Date(Date.parse('2026-10-05T15:00:00.000Z') + m * MIN).toISOString();
        assert.deepEqual(simularCronPorHoras(iso), ['24h', '2h', '1h'], 'falló con minuto ' + m);
    }
});

test('si el disparador se retrasa 20 min, igual llegan los tres', () => {
    const t0 = Date.parse(INICIO), enviados = {}, bitacora = [];
    for (let t = t0 - 48 * HORA; t <= t0; t += HORA) {
        const a = R.avisoPendiente(INICIO, t + 20 * MIN, enviados);
        if (a) { enviados[a] = 'x'; bitacora.push(a); }
    }
    assert.deepEqual(bitacora, ['24h', '2h', '1h']);
});

test('reservar con pocas horas de anticipación no inventa el aviso de 24 h', () => {
    const t0 = Date.parse(INICIO), enviados = {}, bitacora = [];
    for (let t = t0 - 3 * HORA; t <= t0; t += HORA) {      // reservó 3 h antes
        const a = R.avisoPendiente(INICIO, t, enviados);
        if (a) { enviados[a] = 'x'; bitacora.push(a); }
    }
    assert.deepEqual(bitacora, ['2h', '1h']);
});

test('la fecha y la hora salen en hora de México, no en UTC', () => {
    assert.equal(R.horaMx(INICIO), '09:00', '15:00 UTC son las 9:00 en México');
    assert.equal(R.rangoMx(INICIO, FIN), '09:00 a 10:30 h');
    assert.match(R.fechaLargaMx(INICIO), /lunes.*5 de octubre de 2026/);
});

test('el saludo usa el primer nombre, bien capitalizado', () => {
    assert.equal(R.nombreDePila('ANA SOFÍA DEMO RAMÍREZ'), 'Ana');
    assert.equal(R.nombreDePila('  diego  eugenio '), 'Diego');
    assert.equal(R.nombreDePila(''), '');
    assert.equal(R.nombreDePila(null), '');
});

test('cada aviso trae su propio asunto', () => {
    const claves = ['24h', '2h', '1h'].map((c) => R.textoAviso(c).asunto);
    assert.equal(new Set(claves).size, 3, 'los tres asuntos son distintos');
    for (const a of claves) assert.ok(a.length > 10);
});
