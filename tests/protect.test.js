// tests/protect.test.js — correr con: node --test tests/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../protect.js')._helpers;

test('shouldActivate: solo con sesión, exentos bypass y admin, force solo activa', () => {
    assert.equal(P.shouldActivate({ session: null }), false);
    assert.equal(P.shouldActivate({ session: {} }), true);
    assert.equal(P.shouldActivate({ session: {}, isBypass: true }), false);
    assert.equal(P.shouldActivate({ session: {}, isAdmin: true }), false);
    assert.equal(P.shouldActivate({ session: {}, isBypass: true, force: true }), true);
    assert.equal(P.shouldActivate({ session: null, force: true }), false);
});

test('watermarkSvg escapa el correo y lleva la fecha', () => {
    const url = P.watermarkSvg('a<b>&"c@x.com', '15/09/2026 14:00', '#000');
    assert.ok(url.startsWith('data:image/svg+xml;utf8,'));
    const svg = decodeURIComponent(url.slice('data:image/svg+xml;utf8,'.length));
    assert.ok(svg.includes('a&lt;b&gt;&amp;&quot;c@x.com'));
    assert.ok(svg.includes('15/09/2026 14:00'));
    assert.ok(!svg.includes('<b>'));
});

test('isBlockedKey: DevTools, ver código, guardar, imprimir (salvo permitido), PrintScreen', () => {
    const k = (key, o) => Object.assign({ key, ctrlKey: false, metaKey: false, shiftKey: false }, o || {});
    assert.equal(P.isBlockedKey(k('F12')), true);
    assert.equal(P.isBlockedKey(k('I', { ctrlKey: true, shiftKey: true })), true);
    assert.equal(P.isBlockedKey(k('u', { metaKey: true })), true);
    assert.equal(P.isBlockedKey(k('s', { ctrlKey: true })), true);
    assert.equal(P.isBlockedKey(k('p', { ctrlKey: true }), false), true);
    assert.equal(P.isBlockedKey(k('p', { ctrlKey: true }), true), false);
    assert.equal(P.isBlockedKey(k('PrintScreen')), true);
    assert.equal(P.isBlockedKey(k('c', { ctrlKey: true })), false);   // copiar lo maneja el evento copy, no el teclado
    assert.equal(P.isBlockedKey(k('a')), false);
});

test('fechaTexto formato dd/mm/yyyy hh:mm', () => {
    assert.equal(P.fechaTexto(new Date(2026, 8, 5, 9, 7)), '05/09/2026 09:07');
});
