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

test('POST con accion: sin token responde 401 antes de tocar Zoom o el NAS', async () => {
    for (const accion of ['zoom-buscar', 'zoom-trozo', 'zoom-cerrar', 'zoom-borrar']) {
        const res = resFalsa();
        await handler({ method: 'POST', body: { accion }, headers: {} }, res);
        assert.equal(res.code, 401, accion);
    }
});

test('validarCierre: nombre de archivo y carpeta los arma el servidor', () => {
    const ok = { uploadId: 'sala-abc12345', nombre: 'Ana Demo', curp: 'ABCD900101MNLXXX01', inicio: '2026-09-25T16:00:00Z', parte: 1, partes: 1, bytes: 1000 };
    assert.equal(handler._validarCierre(ok), null);
    assert.match(handler._validarCierre(Object.assign({}, ok, { bytes: 0 })), /tamaño/);
    assert.match(handler._validarCierre(Object.assign({}, ok, { parte: 3, partes: 2 })), /parte/);
    assert.match(handler._validarCierre(Object.assign({}, ok, { inicio: 'x' })), /inicio/);
    assert.equal(handler._rutaGrabacion(ok), 'Portafolios/Ana_Demo_ABCD900101MNLXXX01/03-Evaluacion/Grabacion_Sesion_2026-09-25_1000.mp4');
});
