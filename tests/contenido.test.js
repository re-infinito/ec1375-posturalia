// tests/contenido.test.js — correr con: node --test tests/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../contenido.js')._helpers;

test('clasificarError: sesión, red, tabla inexistente, RLS', () => {
    assert.equal(C.clasificarError(null, false), 'sin_sesion');
    assert.equal(C.clasificarError({ message: 'TypeError: Failed to fetch' }, true), 'sin_conexion');
    assert.equal(C.clasificarError({ message: "Could not find the table 'public.contenido_ec1375'", code: 'PGRST205' }, true), 'no_publicado');
    assert.equal(C.clasificarError({ message: 'row-level security policy violated' }, true), 'sin_acceso');
    assert.equal(C.clasificarError({ message: 'algo raro' }, true), 'desconocido');
});

test('reemplazarImagenes y rutasEnHtml', () => {
    const html = '<img src="{{img:registro/a.jpg}}"><img src="{{img:registro/b.jpg}}"><img src="{{img:registro/a.jpg}}">';
    assert.deepEqual(C.rutasEnHtml(html), ['registro/a.jpg', 'registro/b.jpg']);
    const out = C.reemplazarImagenes(html, { 'registro/a.jpg': 'https://x/a?token=1' });
    assert.ok(out.includes('https://x/a?token=1'));
    assert.ok(out.includes('data:image/gif;base64'));   // b.jpg sin URL → pixel transparente
    assert.ok(!out.includes('{{img:'));
});
