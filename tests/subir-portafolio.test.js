// tests/subir-portafolio.test.js — correr con: node --test tests/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const handler = require('../api/subir-portafolio.js');

const MB = 1024 * 1024;

test('rangoPedido: por default el primer trozo de 3.5 MB', () => {
    assert.deepEqual(handler._rangoPedido(undefined, undefined), { desde: 0, hasta: 3.5 * MB - 1 });
    assert.deepEqual(handler._rangoPedido('100', '199'), { desde: 100, hasta: 199 });
});

test('rangoPedido: nunca más de 3.5 MB por respuesta (límite de Vercel 4.5 MB)', () => {
    assert.deepEqual(handler._rangoPedido('0', String(20 * MB)), { desde: 0, hasta: 3.5 * MB - 1 });
});

test('rangoPedido: rechaza rangos inválidos', () => {
    for (const [a, b] of [['-1', '5'], ['10', '5'], ['x', '5'], ['1.5', '9']]) assert.equal(handler._rangoPedido(a, b), null, a + '-' + b);
});

function resFalsa() {
    const r = { code: null, body: null, headers: {} };
    r.setHeader = (k, v) => { r.headers[k] = v; };
    r.status = c => { r.code = c; return r; };
    r.json = b => { r.body = b; return r; };
    r.send = b => { r.body = b; return r; };
    return r;
}

test('GET: ruta fuera de Portafolios/ o Plantillas/ se rechaza antes de revisar la sesión', async () => {
    for (const ruta of ['Contenido/x.json', 'Portafolios/../Contenido/x', '']) {
        const res = resFalsa();
        await handler({ method: 'GET', query: { ruta }, headers: {} }, res);
        assert.equal(res.code, 400, ruta);
    }
});

test('GET: sin token responde 401', async () => {
    const res = resFalsa();
    await handler({ method: 'GET', query: { ruta: 'Portafolios/A/01-Registro/x.pdf' }, headers: {} }, res);
    assert.equal(res.code, 401);
});
