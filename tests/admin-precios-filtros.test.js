// tests/admin-precios-filtros.test.js — correr con: node --test tests/*.test.js
//
// admin-precios.html es una página estática sin módulos: su script se carga
// en un contexto vm con un window/document mínimos (mismo patrón que
// tests/datos-demo.test.js con auth.js). Lo que se prueba aquí es filtrar(),
// que es PURA a propósito: recibe las filas, el estado de los filtros y los
// índices ya armados, y no toca DOM ni red.
//
// Por qué importa: con 26 candidatos y creciendo, los filtros son la única
// forma de contestar "¿a quién le falta capturarle lo cobrado?" sin leer la
// lista entera a ojo — que es justo el error que se quiere evitar, porque de
// ahí salen los ingresos y el reparto entre socios.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const RAIZ = path.join(__dirname, '..');

function cargarPagina() {
    const html = fs.readFileSync(path.join(RAIZ, 'admin-precios.html'), 'utf8');
    const bloques = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)];
    const codigo = bloques[bloques.length - 1][1];
    const sandbox = {
        console: { ...console, warn: () => {}, error: () => {} },
        document: { getElementById: () => null, querySelector: () => null, createElement: () => ({ set textContent(v) { this._v = v; }, get innerHTML() { return this._v; } }) },
        location: { search: '' },
        URLSearchParams: URLSearchParams,
        btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
        Auth: {}, supabaseClient: {}, CrmShell: {}
    };
    sandbox.window = sandbox;
    sandbox.window.addEventListener = () => {};
    sandbox.addEventListener = () => {};
    vm.createContext(sandbox);
    vm.runInContext(codigo, sandbox, { filename: 'admin-precios.html' });
    return sandbox;
}

const FILAS = [
    { email: 'ana@x.com', nombre: 'Ana Uno', lote: 1, estado: 'activo', monto_registro: 2000, monto_alineacion: 4250, monto_evaluacion: 0, monto_entrega: 0 },
    { email: 'beto@x.com', nombre: 'Beto Dos', lote: 2, estado: 'desistió', monto_registro: 2000, monto_alineacion: 0, monto_evaluacion: 0, monto_entrega: 0 },
    { email: 'caro@x.com', nombre: 'Caro Tres', lote: 2, estado: 'activo', monto_registro: 0, monto_alineacion: 0, monto_evaluacion: 0, monto_entrega: 0 },
    { email: 'nuevo@x.com', _sinPrecio: true }
];
const CTX = {
    nombres: { 'ana@x.com': 'Ana Uno Real' },
    pagos: {
        'ana@x.com': { registro: 'manual', alineacion: 'manual' },
        'beto@x.com': { registro: 'mercadopago' },
        'nuevo@x.com': { registro: 'registro-50' }
        /* caro@x.com: sin ninguna fase liberada */
    },
    cobrado: {
        'ana@x.com': { registro: 1000, alineacion: null },   // alineación sin capturar
        'beto@x.com': { registro: 2000 },                     // todo capturado
        'nuevo@x.com': { registro: null }
    }
};
const correos = (filas) => filas.map(f => f.email).sort();

test('filtrar: sin filtros devuelve todo', () => {
    const { filtrar } = cargarPagina();
    assert.equal(filtrar(FILAS, {}, CTX).length, 4);
});

test('filtrar: por estado', () => {
    const { filtrar } = cargarPagina();
    assert.deepEqual(correos(filtrar(FILAS, { estado: 'desistió' }, CTX)), ['beto@x.com']);
});

test('filtrar: por lote', () => {
    const { filtrar } = cargarPagina();
    assert.deepEqual(correos(filtrar(FILAS, { lote: '2' }, CTX)), ['beto@x.com', 'caro@x.com']);
});

test('filtrar: la búsqueda usa el nombre REAL cruzado, no solo el capturado a mano', () => {
    const { filtrar } = cargarPagina();
    // 'Ana Uno Real' viene de candidatos_ec1375; en candidatos_precio dice 'Ana Uno'
    assert.deepEqual(correos(filtrar(FILAS, { busqueda: 'real' }, CTX)), ['ana@x.com']);
    assert.deepEqual(correos(filtrar(FILAS, { busqueda: 'BETO' }, CTX)), ['beto@x.com']);
    assert.deepEqual(correos(filtrar(FILAS, { busqueda: 'nuevo@' }, CTX)), ['nuevo@x.com']);
});

test('filtrar: "falta capturar lo cobrado" saca justo a quien tiene una fase liberada sin monto', () => {
    const { filtrar } = cargarPagina();
    // ana: alineación liberada con cobrado null → sí
    // nuevo: registro abierto por la liga, cobrado null → sí
    // beto: todo capturado → no.  caro: nada liberado → no
    assert.deepEqual(correos(filtrar(FILAS, { pendiente: 'sin_cobrado' }, CTX)),
        ['ana@x.com', 'nuevo@x.com']);
});

test('filtrar: "sin precio capturado" incluye al que no tiene fila y al que la tiene en ceros', () => {
    const { filtrar } = cargarPagina();
    assert.deepEqual(correos(filtrar(FILAS, { pendiente: 'sin_precio' }, CTX)),
        ['caro@x.com', 'nuevo@x.com']);
});

test('filtrar: "sin ninguna fase liberada"', () => {
    const { filtrar } = cargarPagina();
    assert.deepEqual(correos(filtrar(FILAS, { pendiente: 'sin_liberar' }, CTX)), ['caro@x.com']);
});

test('filtrar: los filtros se combinan (se cruzan, no se suman)', () => {
    const { filtrar } = cargarPagina();
    assert.deepEqual(correos(filtrar(FILAS, { estado: 'activo', lote: '2' }, CTX)), ['caro@x.com']);
    assert.equal(filtrar(FILAS, { estado: 'desistió', lote: '1' }, CTX).length, 0);
});

test('filtrar: no revienta con índices vacíos (primer arranque, RPC caído)', () => {
    const { filtrar } = cargarPagina();
    assert.equal(filtrar(FILAS, { busqueda: 'ana' }, {}).length, 1);
    assert.equal(filtrar(FILAS, { pendiente: 'sin_cobrado' }, {}).length, 0);
    assert.equal(filtrar([], { estado: 'activo' }, CTX).length, 0);
});

test('admin-precios.html: la lista ya no vive en un overflow horizontal', () => {
    const html = fs.readFileSync(path.join(RAIZ, 'admin-precios.html'), 'utf8');
    assert.ok(!html.includes('table-wrap'), 'quedó el contenedor con scroll lateral');
    assert.ok(!html.includes('overflow-x'), 'quedó un overflow-x en la página');
    assert.ok(html.includes('@media (max-width: 860px)'), 'falta el corte a tarjetas en celular');
    assert.ok(html.includes('minmax(0,1fr)'), 'las columnas deben poder encogerse');
});

test('admin-precios.html: el color de fila ya no es un hex oscuro fijo', () => {
    const html = fs.readFileSync(path.join(RAIZ, 'admin-precios.html'), 'utf8');
    // Los hex oscuros se veían como una banda negra encima del tema claro.
    // Se busca el USO, no la mención: el porqué sigue escrito en un comentario.
    assert.ok(!html.includes('ESTADO_COLOR'), 'sigue la paleta de hex fijos');
    assert.ok(!/background-color:\$\{/.test(html), 'sigue pintándose el fondo de fila a mano');
    assert.ok(html.includes('color-mix(in srgb, var(--success)'), 'las tintas deben salir de los tokens del tema');
});

test('admin-precios.html: el borrado comprueba lo que de verdad se borró', () => {
    const html = fs.readFileSync(path.join(RAIZ, 'admin-precios.html'), 'utf8');
    // Con RLS, un DELETE que no alcanza ninguna fila NO da error: devuelve
    // vacío. Sin .select() el panel diría "borrado" y no habría borrado nada.
    assert.ok(html.includes(".delete().eq('email', email).select()"), 'falta el .select() de comprobación');
    assert.ok(html.includes('admin_borrar_candidato'), 'falta borrar el avance del flujo');
    assert.match(html, /Authentication → Users/, 'hay que decir que la cuenta de Auth no se borra desde aquí');
});


/* ---------- "Realizado" tiene que decir lo mismo que los KPIs ----------
   Antes esta página sumaba el PRECIO DE LISTA de cada fase liberada e
   ignoraba el campo "cobrado" que ella misma pide capturar. Resultado: el
   panel y admin-kpis podían reportar cifras distintas del mismo dinero, sin
   forma de saber cuál creer. montoCobradoLocal() aplica la misma regla que
   AdminData.montoCobrado(). */

function conDatos(pagos, cobrado) {
    const s = cargarPagina();
    /* pagosPorEmail/cobradoPorEmail son `let` del script: viven en el ámbito
       léxico del contexto, no como propiedad del objeto sandbox. Asignarlas
       desde fuera no las toca; hay que asignarlas DENTRO del contexto. */
    vm.runInContext(
        `pagosPorEmail = ${JSON.stringify(pagos)}; cobradoPorEmail = ${JSON.stringify(cobrado)};`,
        s);
    return s;
}
const CAND = { email: 'x@x.com', monto_registro: 2000, monto_alineacion: 4250, monto_evaluacion: 6000, monto_entrega: 2500 };

test('realizado: la cifra capturada manda sobre el precio de lista', () => {
    const s = conDatos({ 'x@x.com': { registro: 'manual' } }, { 'x@x.com': { registro: 1000 } });
    assert.equal(s.montoCobradoLocal(CAND), 1000, 'entraron 1000 de los 2000, no se cuentan 2000');
});

test('realizado: liberada a mano sin capturar cuenta el precio de lista', () => {
    // Si el equipo la liberó, es porque cobró esa fase (regla de Diego).
    const s = conDatos({ 'x@x.com': { alineacion: 'manual' } }, { 'x@x.com': { alineacion: null } });
    assert.equal(s.montoCobradoLocal(CAND), 4250);
});

test('realizado: Mercado Pago sin capturar también cuenta completo', () => {
    const s = conDatos({ 'x@x.com': { entrega: 'mercadopago' } }, {});
    assert.equal(s.montoCobradoLocal(CAND), 2500);
});

test('realizado: fase abierta por la liga sin capturar cuenta CERO, no el precio', () => {
    // Sabemos que dejaron un anticipo, no cuánto. Reportar de menos y
    // corregir es preferible a repartir dinero que no ha llegado.
    const s = conDatos({ 'x@x.com': { registro: 'registro-50' } }, { 'x@x.com': { registro: null } });
    assert.equal(s.montoCobradoLocal(CAND), 0);
});

test('realizado: una fase NO liberada nunca suma, aunque tenga precio', () => {
    const s = conDatos({ 'x@x.com': {} }, {});
    assert.equal(s.montoCobradoLocal(CAND), 0);
});

test('realizado: suma varias fases con reglas mezcladas', () => {
    const s = conDatos(
        { 'x@x.com': { registro: 'manual', alineacion: 'mercadopago', evaluacion: 'registro-50' } },
        { 'x@x.com': { registro: 1000, alineacion: null, evaluacion: null } });
    assert.equal(s.montoCobradoLocal(CAND), 1000 + 4250 + 0);
});

test('realizado: un cero capturado es un dato, no un "sin capturar"', () => {
    const s = conDatos({ 'x@x.com': { registro: 'manual' } }, { 'x@x.com': { registro: 0 } });
    assert.equal(s.montoCobradoLocal(CAND), 0, 'un 0 escrito a propósito no debe caer al precio de lista');
});
