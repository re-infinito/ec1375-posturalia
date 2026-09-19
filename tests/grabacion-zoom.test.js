// tests/grabacion-zoom.test.js — correr con: node --test tests/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../grabacion-zoom.js');
const MB = 1024 * 1024;

test('planTrozos: trozos de 32 MB, el último parcial; archivo vacío = sin trozos', () => {
    const t = G.planTrozos(100 * MB);
    assert.equal(t.length, 4);
    assert.deepEqual(t[0], { n: 1, desde: 0, hasta: 32 * MB - 1 });
    assert.deepEqual(t[3], { n: 4, desde: 96 * MB, hasta: 100 * MB - 1 });
    assert.deepEqual(G.planTrozos(0), []);
    assert.equal(G.TROZO, 32 * MB);
});

test('archivoPrincipal: prefiere pantalla + orador, luego el más grande', () => {
    const a = [
        { id: 'g', tipo: 'gallery_view', bytes: 900 },
        { id: 's', tipo: 'shared_screen_with_speaker_view', bytes: 500 },
        { id: 'x', tipo: 'raro', bytes: 9999 }
    ];
    assert.equal(G.archivoPrincipal(a).id, 's');
    assert.equal(G.archivoPrincipal([{ id: 'x', tipo: 'raro', bytes: 1 }, { id: 'y', tipo: 'otro', bytes: 5 }]).id, 'y');
    assert.equal(G.archivoPrincipal([]), null);
});

test('nombreGrabacion: fecha y hora de México; "_parteN" solo con varias partes', () => {
    assert.equal(G.nombreGrabacion('2026-09-25T16:00:00Z', 1, 1), 'Grabacion_Sesion_2026-09-25_1000.mp4');
    assert.equal(G.nombreGrabacion('2026-09-26T05:30:00Z', 2, 2), 'Grabacion_Sesion_2026-09-25_2330_parte2.mp4');
});

test('ventanaBusqueda: 15 min antes del inicio a 60 min después del fin', () => {
    assert.deepEqual(G.ventanaBusqueda({ inicio: '2026-09-25T16:00:00Z', fin: '2026-09-25T17:30:00Z' }),
        { desde: '2026-09-25T15:45:00.000Z', hasta: '2026-09-25T18:30:00.000Z' });
    assert.equal(G.ventanaBusqueda(null), null);
});

test('esIdSubida / nuevoIdSubida', () => {
    assert.equal(G.esIdSubida(G.nuevoIdSubida()), true);
    assert.equal(G.esIdSubida('../x'), false);
    assert.equal(G.esIdSubida('corto'), false);
});

test('puedeBorrarDeZoom: todas las partes en el NAS y certificado entregado', () => {
    const ok = { etapas: { entregado: { fecha: 'x' } }, video: { partes: [{ nas: { ruta: 'Portafolios/A/03-Evaluacion/g.mp4' } }] } };
    assert.equal(G.puedeBorrarDeZoom(ok), true);
    assert.equal(G.puedeBorrarDeZoom(Object.assign({}, ok, { etapas: {} })), false);
    assert.equal(G.puedeBorrarDeZoom({ etapas: ok.etapas, video: { partes: [{ nas: null }] } }), false);
    assert.equal(G.puedeBorrarDeZoom({ etapas: ok.etapas, video: { partes: [] } }), false);
});
