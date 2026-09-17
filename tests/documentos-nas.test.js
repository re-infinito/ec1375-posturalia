// tests/documentos-nas.test.js — correr con: node --test tests/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const N = require('../documentos-nas.js');

const CLAVES = ['ficha', 'consentimiento'];

test('huella: mismos datos → misma huella; un cambio → otra', () => {
    const a = N.huella({ nombre: 'Ana', firma: 'data:image/png;base64,AAA' });
    assert.equal(a, N.huella({ nombre: 'Ana', firma: 'data:image/png;base64,AAA' }));
    assert.notEqual(a, N.huella({ nombre: 'Ana ', firma: 'data:image/png;base64,AAA' }));
    assert.notEqual(a, N.huella({ nombre: 'Ana', firma: 'data:image/png;base64,AAB' }));
});

test('huella: ignora el estado de subida y banderas volátiles, a cualquier profundidad', () => {
    const base = { datos: { nombre: 'Ana', foto: { path: 'x.jpg' } } };
    const conEstado = {
        datos: { nombre: 'Ana', foto: { path: 'x.jpg', uploading: true, error: 'algo' } },
        documentosNextcloud: { ficha: 'Portafolios/a.pdf' }, documentosHuella: { ficha: 'zz' },
        documentosDescargados: { ficha: true }, _demo: true
    };
    assert.equal(N.huella(base), N.huella(conEstado));
});

test('pendientes: nunca subido o subido con otra huella', () => {
    const estado = { documentosNextcloud: { ficha: 'a.pdf', consentimiento: 'b.pdf' }, documentosHuella: { ficha: 'h1', consentimiento: 'h0' } };
    assert.deepEqual(N.pendientes(CLAVES, estado, 'h1'), ['consentimiento']);
    assert.deepEqual(N.pendientes(CLAVES, { documentosNextcloud: {} }, 'h1'), CLAVES);
});

test('pendientes: lo subido antes de este cambio (sin huella) se resube una vez', () => {
    const estado = { documentosNextcloud: { ficha: 'a.pdf', consentimiento: 'b.pdf' } };
    assert.deepEqual(N.pendientes(CLAVES, estado, 'h1'), CLAVES);
});

test('yaGenerado: cuenta subido o descargado; vacío no', () => {
    assert.equal(N.yaGenerado(CLAVES, { documentosNextcloud: {} }), false);
    assert.equal(N.yaGenerado(CLAVES, { documentosNextcloud: { ficha: 'a.pdf' } }), true);
    assert.equal(N.yaGenerado(CLAVES, { documentosDescargados: { consentimiento: true } }), true);
    assert.equal(N.yaGenerado(CLAVES, { documentosNextcloud: { ficha: [] } }), false);
});

test('estadoDoc: subido, desactualizado, descargado y pendiente', () => {
    const e = { documentosNextcloud: { ficha: 'a.pdf', consentimiento: 'b.pdf' }, documentosHuella: { ficha: 'h1', consentimiento: 'h0' }, documentosDescargados: { plan: true } };
    assert.equal(N.estadoDoc('ficha', e, 'h1'), 'subido');
    assert.equal(N.estadoDoc('consentimiento', e, 'h1'), 'desactualizado');
    assert.equal(N.estadoDoc('plan', e, 'h1'), 'descargado');
    assert.equal(N.estadoDoc('otro', e, 'h1'), 'pendiente');
});

test('sincronizar: resube solo lo pendiente, con el mismo nombre, y guarda ruta + huella', async () => {
    const llamadas = [];
    const estado = { documentosNextcloud: { ficha: 'viejo/ficha.pdf', consentimiento: 'c.pdf' }, documentosHuella: { ficha: 'h0', consentimiento: 'h1' } };
    let generados = 0, avisos = 0;
    const r = await N.sincronizar({
        grupo: 't1', fase: 'evaluacion', claves: CLAVES, huella: 'h1', estado, nombre: 'Ana', curp: 'X',
        generar: () => { generados++; return { ficha: { blob: 'B1', filename: 'Ficha_Ana.pdf' }, consentimiento: { blob: 'B2', filename: 'Carta_Ana.pdf' } }; },
        subirFn: async (fase, filename) => { llamadas.push([fase, filename]); return { success: true, path: 'Portafolios/Ana_X/03-Evaluacion/' + filename }; },
        alCambiar: () => { avisos++; }
    });
    assert.deepEqual(llamadas, [['evaluacion', 'Ficha_Ana.pdf']]);
    assert.deepEqual(r, { subidos: ['ficha'], fallidos: [] });
    assert.equal(estado.documentosNextcloud.ficha, 'Portafolios/Ana_X/03-Evaluacion/Ficha_Ana.pdf');
    assert.equal(estado.documentosHuella.ficha, 'h1');
    assert.equal(generados, 1);
    assert.ok(avisos >= 2);
    assert.equal(N.estaSubiendo('ficha'), false);
});

test('sincronizar: al día no genera ni sube nada', async () => {
    const estado = { documentosNextcloud: { ficha: 'a', consentimiento: 'b' }, documentosHuella: { ficha: 'h', consentimiento: 'h' } };
    const r = await N.sincronizar({
        grupo: 't2', fase: 'evaluacion', claves: CLAVES, huella: 'h', estado,
        generar: () => { throw new Error('no debía generar'); },
        subirFn: async () => { throw new Error('no debía subir'); }
    });
    assert.deepEqual(r, { subidos: [], fallidos: [] });
});

test('sincronizar: si falla la subida conserva la ruta y la huella anteriores', async () => {
    const estado = { documentosNextcloud: { ficha: 'a.pdf' }, documentosHuella: { ficha: 'h0' } };
    const r = await N.sincronizar({
        grupo: 't3', fase: 'evaluacion', claves: ['ficha'], huella: 'h1', estado,
        generar: () => ({ ficha: { blob: 'B', filename: 'f.pdf' } }),
        subirFn: async () => ({ success: false, error: 'Nextcloud respondió con status 423' })
    });
    assert.deepEqual(r, { subidos: [], fallidos: ['ficha'] });
    assert.equal(estado.documentosNextcloud.ficha, 'a.pdf');
    assert.equal(estado.documentosHuella.ficha, 'h0');
    assert.equal(N.estadoDoc('ficha', estado, 'h1'), 'desactualizado');
});

test('sincronizar: una segunda llamada mientras sube se repite al final con la huella más nueva', async () => {
    const estado = { documentosNextcloud: {}, documentosHuella: {} };
    const subidas = [];
    let soltar;
    const primera = new Promise(r => { soltar = r; });
    const base = {
        grupo: 't4', fase: 'registro', claves: ['a'], estado,
        generar: () => ({ a: { blob: 'B', filename: 'a.pdf' } })
    };
    const p1 = N.sincronizar({ ...base, huella: 'v1', subirFn: async () => { await primera; subidas.push('v1'); return { success: true, path: 'p' }; } });
    const p2 = N.sincronizar({ ...base, huella: 'v2', subirFn: async () => { subidas.push('v2'); return { success: true, path: 'p' }; } });
    assert.equal(N.estaSubiendo('a'), true);
    soltar();
    await p1; await p2;
    assert.deepEqual(subidas, ['v1', 'v2']);
    assert.equal(estado.documentosHuella.a, 'v2');
});
