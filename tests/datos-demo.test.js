// tests/datos-demo.test.js — correr con: node --test tests/*.test.js
// Cuenta demo (bypass): lo que el admin edita durante un video debe sobrevivir
// a Auth.ensureAdminPlaceholderData(), y la marca `_demo` nunca debe llegar a
// los datos de una cuenta real. auth.js no es un módulo de Node: se carga en un
// contexto vm con un cliente de Supabase falso y un localStorage en memoria.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const RAIZ = path.join(__dirname, '..');

function almacenEnMemoria() {
    const m = new Map();
    return {
        getItem: (k) => (m.has(k) ? m.get(k) : null),
        setItem: (k, v) => { m.set(k, String(v)); },
        removeItem: (k) => { m.delete(k); },
        key: (i) => [...m.keys()][i] ?? null,
        get length() { return m.size; }
    };
}

function cargarAuth() {
    const localStorage = almacenEnMemoria();
    const sandbox = {
        localStorage,
        sessionStorage: almacenEnMemoria(),
        console,
        setTimeout: () => 0,          // sin _flushPendingSync real
        clearTimeout: () => {},
        supabase: {
            createClient: () => ({
                auth: { getSession: async () => ({ data: { session: null } }) },
                rpc: async () => ({ data: null, error: null })
            })
        }
    };
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(path.join(RAIZ, 'auth.js'), 'utf8'), sandbox, { filename: 'auth.js' });
    const leer = (k) => JSON.parse(localStorage.getItem(k) || 'null');
    return { Auth: sandbox.Auth, localStorage, leer };
}

/* Lo que hace cada página al guardar: arma un objeto nuevo con sus campos (sin
   `_demo`), lo escribe en localStorage y llama Auth.syncToSupabase(columna, …). */
function guardarComoPagina(ctx, llave, columna, cambios) {
    const { _demo, ...resto } = ctx.leer(llave) || {};
    const data = { ...resto, ...cambios };
    ctx.localStorage.setItem(llave, JSON.stringify(data));
    ctx.Auth.syncToSupabase(columna, data, 'CURP', 'Nombre');
}

// Columna de candidatos_ec1375 que cada página manda a syncToSupabase.
const COLUMNAS = {
    autodiagnosticoData: 'autodiagnostico_data',
    planEvaluacionData: 'plan_evaluacion_data',
    documentosSesionData: 'documentos_sesion_data',
    encuestaSatisfaccionData: 'encuesta_data',
    evidenciasData: 'evidencias_data',
    examenConocimientosData: 'examen_conocimientos_data'
};

test('cuenta demo: lo editado en cada página sobrevive a la siguiente resiembra', () => {
    for (const [llave, columna] of Object.entries(COLUMNAS)) {
        const ctx = cargarAuth();
        ctx.Auth._isBypassSession = true;
        ctx.Auth.ensureAdminPlaceholderData();

        guardarComoPagina(ctx, llave, columna, { editadoEnVideo: 'Consultorio editado' });
        assert.equal(ctx.Auth.ensureAdminPlaceholderData(), false, `${llave}: no debe resembrar`);

        const guardado = ctx.leer(llave);
        assert.equal(guardado.editadoEnVideo, 'Consultorio editado', `${llave}: se perdió la edición`);
        assert.equal(guardado._demo, true, `${llave}: debe seguir marcado como demo`);
    }
});

test('cuenta demo: la edición del Plan de Evaluación (caso reportado) no se pierde', () => {
    const ctx = cargarAuth();
    ctx.Auth._isBypassSession = true;
    ctx.Auth.ensureAdminPlaceholderData();
    const { planData } = ctx.leer('planEvaluacionData');
    guardarComoPagina(ctx, 'planEvaluacionData', 'plan_evaluacion_data', {
        planData: { ...planData, lugarDesarrollo: 'Consultorio EDITADO en video' },
        signatureMode: 'draw', signatureDataUrl: 'data:image/png;base64,iVBORw0KGgo='
    });
    ctx.Auth.ensureAdminPlaceholderData();
    const d = ctx.leer('planEvaluacionData');
    assert.equal(d.planData.lugarDesarrollo, 'Consultorio EDITADO en video');
    assert.equal(d.signatureMode, 'draw');
});

test('cuenta real: syncToSupabase nunca agrega la marca _demo', () => {
    for (const bandera of [false, undefined]) {
        const ctx = cargarAuth();
        ctx.Auth._isBypassSession = bandera;
        for (const [llave, columna] of Object.entries(COLUMNAS)) {
            guardarComoPagina(ctx, llave, columna, { campoReal: 'dato real' });
            assert.equal(ctx.leer(llave)._demo, undefined, `${llave} con _isBypassSession=${bandera}`);
        }
    }
});

test('datos de otra persona en el mismo navegador se siguen reemplazando con los demo', () => {
    const ctx = cargarAuth();
    ctx.Auth._isBypassSession = false;
    guardarComoPagina(ctx, 'planEvaluacionData', 'plan_evaluacion_data', { planData: { lugarDesarrollo: 'Dato de un candidato real' } });

    ctx.Auth._isBypassSession = true;
    assert.equal(ctx.Auth.ensureAdminPlaceholderData(), true);
    const d = ctx.leer('planEvaluacionData');
    assert.equal(d._demo, true);
    assert.equal(d.planData.lugarDesarrollo, 'Instalaciones del Centro Evaluador');
});

test('DEMO_COLUMNAS cubre exactamente lo que se siembra', () => {
    const { Auth } = cargarAuth();
    const sembradas = ['autodiagnosticoData', ...Object.keys(Auth.ADMIN_PLACEHOLDER_DOWNSTREAM())].sort();
    assert.equal(JSON.stringify(Object.values(Auth.DEMO_COLUMNAS).sort()), JSON.stringify(sembradas));
    for (const [columna, llave] of Object.entries(Auth.DEMO_COLUMNAS)) {
        assert.equal(COLUMNAS[llave], columna, `${llave} ↔ ${columna}`);
    }
});

/* El arreglo depende de que cada página, al guardar lo que se siembra, llame
   Auth.syncToSupabase con la columna correcta justo después de escribir. Si una
   página deja de hacerlo, la edición demo se volvería a perder: esta prueba lo
   detecta leyendo el HTML. */
test('cada página guarda lo sembrado y enseguida llama syncToSupabase con su columna', () => {
    const { Auth } = cargarAuth();
    const paginas = ['autodiagnostico.html', 'plan-evaluacion.html', 'documentos-sesion.html',
                     'encuesta-satisfaccion.html', 'evidencias.html', 'examen-conocimientos.html'];
    const vistas = {};
    for (const pagina of paginas) {
        const src = fs.readFileSync(path.join(RAIZ, pagina), 'utf8');
        const re = /localStorage\.setItem\('(\w+)'[^\n]*\n(?:[^\n]*\n){0,2}?[^\n]*Auth\.syncToSupabase\('(\w+)'/g;
        let m;
        while ((m = re.exec(src))) vistas[m[1]] = m[2];
    }
    for (const [columna, llave] of Object.entries(Auth.DEMO_COLUMNAS)) {
        assert.equal(vistas[llave], columna, `${llave}: no se encontró setItem seguido de syncToSupabase('${columna}')`);
    }
});
