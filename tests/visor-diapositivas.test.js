const test = require('node:test');
const assert = require('node:assert');
const V = require('../visor-diapositivas.js');

const estudio = {
    slides: [
        { sid: 'v3-0', mod: 0, titulo: 'Introducción', crit: [], rx: [], route: 'alignment' },
        { sid: 'v3-1', mod: 0, titulo: 'Tu autodiagnóstico', crit: [], rx: [], route: 'both' },
        { sid: 'v3-8', mod: 1, titulo: 'Técnicas', crit: ['E1·C1'], rx: [20], route: 'both' },
        { sid: 'v3-70', mod: 5, titulo: 'Higiene de columna', crit: ['E2·C4'], rx: [60, 61], route: 'remedial' },
        { sid: 'v3-71', mod: 5, titulo: 'Postura', crit: ['E2·C4'], rx: [], route: 'optional' },
        { sid: 'v3-114', mod: 6, titulo: 'Cierre', crit: [], rx: [], route: 'alignment' }
    ]
};
const alineacion = {
    slides: [
        { sid: 'v3-0', mod: 0, modulo: 'Introducción' },
        { sid: 'v3-1', mod: 0, modulo: 'Introducción' },
        { sid: 'n-que-es-ec', mod: 0, modulo: 'Introducción', titulo: 'Qué es un EC', crit: [], rx: [] },
        { sid: 'n-sep-conocer', mod: 0, modulo: 'Introducción', titulo: 'SEP y CONOCER', crit: [], rx: [] },
        { sid: 'v3-8', mod: 1, modulo: 'Preparar el espacio' },
        { sid: 'v3-114', mod: 6, modulo: 'Listo para evaluarte' },
        { sid: 'vp-1', mod: 7, modulo: 'Tu video práctico', titulo: 'Tu video', crit: [], rx: [] },
        { sid: 'vp-2', mod: 7, modulo: 'Tu video práctico', titulo: 'Ocho etapas', crit: [], rx: [] }
    ]
};

test('catalogo: agrega solo las pantallas exclusivas de Alineación, en su lugar', () => {
    const cat = V.catalogo(estudio, alineacion);
    assert.deepStrictEqual(cat.map(e => e.sid),
        ['v3-0', 'v3-1', 'n-que-es-ec', 'n-sep-conocer', 'v3-8', 'v3-70', 'v3-71', 'v3-114', 'vp-1', 'vp-2']);
    assert.deepStrictEqual(cat.map(e => e.pos), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    assert.strictEqual(cat[2].fuente, 'alineacion');
    assert.strictEqual(cat[4].modulo, 'Preparar el espacio', 'toma el nombre del módulo de Alineación');
    assert.strictEqual(cat[8].modulo, 'Tu video práctico');
});

test('catalogo: sin datos de Alineación devuelve solo ruta-estudio con nombres por default', () => {
    const cat = V.catalogo(estudio, null);
    assert.strictEqual(cat.length, 6);
    assert.strictEqual(cat[3].modulo, 'Conoce tus equipos');
});

test('reactivosNo: usa el orden oficial de claves (n = índice + 1)', () => {
    const keys = ['a', 'b', 'c', 'd'];
    assert.deepStrictEqual(V.reactivosNo({ a: 'SI', b: 'NO', c: 'SI', d: 'NO' }, keys), [2, 4]);
    assert.deepStrictEqual(V.reactivosNo(null, keys), []);
});

test('criteriosFallados: solo primer intento incorrecto, sin repetir criterio', () => {
    const reactivos = [{ tema: 'Higiene de Columna' }, { tema: 'Biomecánica' }, { tema: 'Movimientos del Cuerpo' }, { tema: 'Tema inventado' }];
    const examen = { firstAttemptCorrect: { 0: false, 1: false, 2: false, 3: false } };
    assert.deepStrictEqual(V.criteriosFallados(examen, reactivos), ['E2·C4', 'E2·C3']);
    assert.deepStrictEqual(V.criteriosFallados({ firstAttemptCorrect: { 0: true } }, reactivos), []);
});

test('recomendados: marca el motivo (autodiagnóstico y/o examen)', () => {
    const cat = V.catalogo(estudio, alineacion);
    const rec = V.recomendados(cat, [60], ['E1·C1', 'E2·C4']);
    assert.deepStrictEqual(rec, {
        'v3-8': ['examen'],
        'v3-70': ['autodiagnostico', 'examen'],
        'v3-71': ['examen']
    });
});

test('porCriterio: prefiere pantallas de repaso; si no hay, cualquiera que lo toque', () => {
    const cat = V.catalogo(estudio, alineacion);
    assert.deepStrictEqual(V.porCriterio(cat, 'E2·C4').map(e => e.sid), ['v3-70']);
    const soloOpcional = [{ sid: 'x', crit: ['E9'], route: 'optional', rx: [] }];
    assert.deepStrictEqual(V.porCriterio(soloOpcional, 'E9').map(e => e.sid), ['x']);
});

test('filtrar: búsqueda sin acentos por título, criterio, nombre de criterio y #reactivo', () => {
    const cat = V.catalogo(estudio, alineacion);
    const criterios = { 'E1·C1': { titulo: 'Técnicas de atención tradicional' } };
    assert.deepStrictEqual(V.filtrar(cat, { q: 'tecnicas' }, criterios).map(e => e.sid), ['v3-8']);
    assert.deepStrictEqual(V.filtrar(cat, { q: 'tradicional' }, criterios).map(e => e.sid), ['v3-8']);
    assert.deepStrictEqual(V.filtrar(cat, { q: '#61' }).map(e => e.sid), ['v3-70']);
    assert.deepStrictEqual(V.filtrar(cat, { mod: 7 }).map(e => e.sid), ['vp-1', 'vp-2']);
    assert.deepStrictEqual(V.filtrar(cat, { crit: 'E2·C4' }).map(e => e.sid), ['v3-70']);
    const rec = V.recomendados(cat, [20], []);
    assert.deepStrictEqual(V.filtrar(cat, { soloRecomendados: true, recomendados: rec }).map(e => e.sid), ['v3-8']);
    assert.strictEqual(V.filtrar(cat, {}).length, cat.length);
});

test('seccionesPorSid: corta el HTML publicado por data-sid', () => {
    const html = '<section class="slide" data-mod="0" data-sid="v3-0"><h2>A</h2></section>\n' +
        '<section class="slide" data-sid="vp-1" aria-label="x"><p>B</p></section>';
    const m = V.seccionesPorSid(html);
    assert.deepStrictEqual(Object.keys(m), ['v3-0', 'vp-1']);
    assert.ok(m['vp-1'].includes('<p>B</p>') && m['vp-1'].endsWith('</section>'));
});

test('urlBiblioteca: tema conocido filtra por criterio; desconocido abre la Biblioteca completa', () => {
    assert.strictEqual(V.urlBiblioteca('Higiene de Columna'), 'biblioteca.html?crit=E2%C2%B7C4');
    assert.strictEqual(V.urlBiblioteca('Otro'), 'biblioteca.html');
});
