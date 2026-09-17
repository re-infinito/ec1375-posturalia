// tests/firma-candidato.test.js — correr con: node --test tests/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../firma-candidato.js');

const PNG = 'data:image/png;base64,iVBORw0KGgo=';

test('firmaValida: dibujada exige imagen, escrita exige nombre', () => {
    assert.equal(F.firmaValida({ mode: 'draw', dataUrl: PNG }), true);
    assert.equal(F.firmaValida({ mode: 'draw', dataUrl: null }), false);
    assert.equal(F.firmaValida({ mode: 'type', typedName: 'Diego Garza' }), true);
    assert.equal(F.firmaValida({ mode: 'type', typedName: '   ' }), false);
    assert.equal(F.firmaValida({ mode: 'upload', dataUrl: PNG }), false);
    assert.equal(F.firmaValida(null), false);
});

test('firmaValida: una "imagen" que no es data:image no cuenta', () => {
    assert.equal(F.firmaValida({ mode: 'draw', dataUrl: 'javascript:alert(1)' }), false);
    assert.equal(F.firmaValida({ mode: 'draw', dataUrl: 'https://evil.example/x.png' }), false);
});

test('firmaDeAutodiagnostico: prefiere la firma principal', () => {
    const f = F.firmaDeAutodiagnostico({
        signatureMode: 'draw', signatureDataUrl: PNG, signatureTypedName: '',
        ndaSignatureMode: 'type', ndaSignatureTypedName: 'Otra'
    });
    assert.deepEqual(f, { mode: 'draw', dataUrl: PNG, typedName: '', origen: 'autodiagnostico' });
});

test('firmaDeAutodiagnostico: si no hay principal usa la del Acuerdo de Confidencialidad (se firma antes)', () => {
    const f = F.firmaDeAutodiagnostico({
        signatureMode: 'draw', signatureDataUrl: null,
        ndaSignatureMode: 'draw', ndaSignatureDataUrl: PNG
    });
    assert.equal(f.origen, 'confidencialidad');
    assert.equal(f.dataUrl, PNG);
});

test('firmaDeAutodiagnostico: firma escrita (forma de la cuenta demo) y modo ausente = dibujar', () => {
    const escrita = F.firmaDeAutodiagnostico({ signatureDataUrl: null, signatureTypedName: 'Ana Sofía', signatureMode: 'type' });
    assert.deepEqual(escrita, { mode: 'type', dataUrl: null, typedName: 'Ana Sofía', origen: 'autodiagnostico' });
    const sinModo = F.firmaDeAutodiagnostico({ signatureDataUrl: PNG });
    assert.equal(sinModo.mode, 'draw');
});

test('firmaDeAutodiagnostico: sin ninguna firma válida regresa null', () => {
    assert.equal(F.firmaDeAutodiagnostico(null), null);
    assert.equal(F.firmaDeAutodiagnostico({}), null);
    assert.equal(F.firmaDeAutodiagnostico({ signatureMode: 'type', signatureTypedName: '' }), null);
});

test('vistaPrevia: escapa el nombre escrito y solo pinta imágenes data:image', () => {
    const html = F.vistaPrevia({ mode: 'type', typedName: '<img src=x onerror=alert(1)>' });
    assert.ok(!html.includes('<img src=x'));
    assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
    assert.ok(F.vistaPrevia({ mode: 'draw', dataUrl: PNG }).includes('src="' + PNG + '"'));
    assert.equal(F.vistaPrevia({ mode: 'draw', dataUrl: 'javascript:alert(1)' }), '');
});
