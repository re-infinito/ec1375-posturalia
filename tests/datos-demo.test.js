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

const LLAVE_SESION = 'sb-numsuiuwrvpprhnxovmh-auth-token';
const CORREO_DEMO = 'paideia.tech@outlook.com';

/* opts.previo: lo que ya había en localStorage antes de cargar auth.js.
   opts.correo: sesión guardada de ese correo (null = sin sesión).
   opts.bypass: lo que responde el RPC is_current_user_flow_bypass_admin
   (true, false o 'error'). Las escrituras a candidatos_ec1375 quedan en upserts. */
function cargarAuth(opts = {}) {
    const localStorage = almacenEnMemoria();
    for (const [k, v] of Object.entries(opts.previo || {})) localStorage.setItem(k, JSON.stringify(v));
    const estado = { correo: opts.correo || null, bypass: opts.bypass ?? false };
    const sesion = () => (estado.correo ? { user: { id: 'u-' + estado.correo, email: estado.correo } } : null);
    if (estado.correo) localStorage.setItem(LLAVE_SESION, JSON.stringify({ access_token: 't', ...sesion() }));
    const upserts = [];
    const sandbox = {
        localStorage,
        sessionStorage: almacenEnMemoria(),
        console: { ...console, warn: () => {} },
        setTimeout: () => 0,          // sin _flushPendingSync real
        clearTimeout: () => {},
        supabase: {
            createClient: () => ({
                auth: {
                    getSession: async () => ({ data: { session: sesion() } }),
                    signOut: async () => { estado.correo = null; localStorage.removeItem(LLAVE_SESION); }
                },
                rpc: async () => (estado.bypass === 'error'
                    ? { data: null, error: { message: 'sin red' } }
                    : { data: estado.bypass, error: null }),
                from: () => ({ upsert: async (row) => { upserts.push(row); return { error: null }; } })
            })
        }
    };
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(path.join(RAIZ, 'auth.js'), 'utf8'), sandbox, { filename: 'auth.js' });
    const leer = (k) => JSON.parse(localStorage.getItem(k) || 'null');
    return { Auth: sandbox.Auth, localStorage, leer, estado, upserts };
}

/* Los 6 objetos demo tal como quedan en el navegador después de usar la cuenta demo. */
function datosDemoSembrados() {
    const ctx = cargarAuth();
    ctx.Auth._isBypassSession = true;
    ctx.Auth.ensureAdminPlaceholderData();
    return Object.fromEntries(Object.values(ctx.Auth.DEMO_COLUMNAS).map((k) => [k, ctx.leer(k)]));
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
                     'encuesta-satisfaccion.html', 'evidencias.html', 'estudio.html'];  /* el Examen vive en estudio.html desde el 17 sep */
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

/* ── Una cuenta real nunca usa ni sube los datos demo (17 sep) ──────────────
   localStorage es del navegador: si la cuenta demo cerró sesión y entra una
   cuenta real, las páginas no deben encontrar los objetos `_demo` en su llave
   (varias los cargan en `load`, antes de preguntarle nada al servidor). */
const LLAVES_DEMO = Object.keys(COLUMNAS);
const visibles = (ctx) => LLAVES_DEMO.filter((k) => ctx.localStorage.getItem(k) !== null);

test('cuenta real con sesión guardada: los datos demo no están a la vista desde que carga auth.js, y se borran al confirmar', async () => {
    const ctx = cargarAuth({ previo: datosDemoSembrados(), correo: 'de.minconsciente@outlook.com', bypass: false });
    assert.deepEqual(visibles(ctx), [], 'ninguna página debe poder cargarlos');
    assert.equal(await ctx.Auth.isBypassSession(), false);
    assert.equal(ctx.localStorage.getItem(ctx.Auth.DEMO_APARTADO), null, 'cuenta real confirmada: el apartado se borra');
    assert.deepEqual(visibles(ctx), []);
});

test('sin sesión guardada (la demo cerró sesión): se apartan, y la cuenta demo los recupera con lo editado', async () => {
    const previo = datosDemoSembrados();
    previo.planEvaluacionData.planData.lugarDesarrollo = 'Consultorio EDITADO en video';
    const ctx = cargarAuth({ previo, correo: null });
    assert.deepEqual(visibles(ctx), []);
    assert.equal(await ctx.Auth.isBypassSession(), false);          // sin sesión: se quedan apartados
    assert.notEqual(ctx.localStorage.getItem(ctx.Auth.DEMO_APARTADO), null);

    ctx.estado.correo = CORREO_DEMO; ctx.estado.bypass = true;       // entra la cuenta demo
    assert.equal(await ctx.Auth.isBypassSession(), true);
    assert.equal(ctx.Auth.ensureAdminPlaceholderData(), false, 'no debe resembrar');
    assert.deepEqual(visibles(ctx), LLAVES_DEMO);
    assert.equal(ctx.leer('planEvaluacionData').planData.lugarDesarrollo, 'Consultorio EDITADO en video');
    assert.equal(ctx.localStorage.getItem(ctx.Auth.DEMO_APARTADO), null);
});

test('sin sesión guardada: si entra una cuenta real, los datos demo se borran y no se suben', async () => {
    const ctx = cargarAuth({ previo: datosDemoSembrados(), correo: null });
    ctx.estado.correo = 'de.minconsciente@outlook.com'; ctx.estado.bypass = false;
    assert.equal(await ctx.Auth.isBypassSession(), false);
    assert.deepEqual(visibles(ctx), []);
    assert.equal(ctx.localStorage.getItem(ctx.Auth.DEMO_APARTADO), null);
});

test('sesión guardada de la cuenta demo: sus datos siguen a la vista al cargar (las páginas los leen en load)', async () => {
    const ctx = cargarAuth({ previo: datosDemoSembrados(), correo: CORREO_DEMO, bypass: true });
    assert.deepEqual(visibles(ctx), LLAVES_DEMO);
    assert.equal(await ctx.Auth.isBypassSession(), true);
    assert.deepEqual(visibles(ctx), LLAVES_DEMO);
});

test('pista falsa: dice ser la demo pero el servidor dice que no → se borran', async () => {
    const ctx = cargarAuth({ previo: datosDemoSembrados(), correo: CORREO_DEMO, bypass: false });
    assert.equal(await ctx.Auth.isBypassSession(), false);
    assert.deepEqual(visibles(ctx), []);
    assert.equal(ctx.localStorage.getItem(ctx.Auth.DEMO_APARTADO), null);
});

test('el servidor no responde: los datos demo se apartan (no se borran) y vuelven cuando confirma la demo', async () => {
    const ctx = cargarAuth({ previo: datosDemoSembrados(), correo: CORREO_DEMO, bypass: 'error' });
    assert.equal(await ctx.Auth.isBypassSession(), false);
    assert.deepEqual(visibles(ctx), []);
    ctx.estado.bypass = true;
    assert.equal(await ctx.Auth.isBypassSession(), true);
    assert.deepEqual(visibles(ctx), LLAVES_DEMO);
});

test('los datos sin marca _demo (de una cuenta real) nunca se apartan ni se borran', async () => {
    const real = { planData: { lugarDesarrollo: 'Mi consultorio' } };
    const ctx = cargarAuth({ previo: { planEvaluacionData: real }, correo: null });
    assert.deepEqual(ctx.leer('planEvaluacionData'), real);
    ctx.estado.correo = 'de.minconsciente@outlook.com';
    await ctx.Auth.isBypassSession();
    assert.deepEqual(ctx.leer('planEvaluacionData'), real);
});

test('cerrar sesión como demo aparta sus datos al momento', async () => {
    const ctx = cargarAuth({ previo: datosDemoSembrados(), correo: CORREO_DEMO, bypass: true });
    await ctx.Auth.signOut();
    assert.deepEqual(visibles(ctx), []);
    assert.notEqual(ctx.localStorage.getItem(ctx.Auth.DEMO_APARTADO), null);
});

test('respaldo: una cuenta real nunca sube un guardado con curp o nombre demo, pero sí los suyos', async () => {
    const ctx = cargarAuth({ correo: 'de.minconsciente@outlook.com', bypass: false });
    const intentos = [
        ['DERA900515MNLMMN08', 'Otro nombre', {}],
        ['', 'Ana Sofía Demo Ramírez', {}],
        ['GAAD000000HNLRRG00', 'Diego', { _demo: true }]
    ];
    for (const [curp, nombre, data] of intentos) {
        ctx.Auth.syncToSupabase('plan_evaluacion_data', data, curp, nombre);
        await ctx.Auth.flushSync();
    }
    assert.equal(ctx.upserts.length, 0);
    ctx.Auth.syncToSupabase('plan_evaluacion_data', { planData: {} }, 'GAAD000000HNLRRG00', 'Diego');
    await ctx.Auth.flushSync();
    assert.equal(ctx.upserts.length, 1);
    assert.equal(ctx.upserts[0].curp, 'GAAD000000HNLRRG00');
});

test('"Reiniciar demo" también borra el apartado', () => {
    const { Auth } = cargarAuth();
    assert.ok(Auth.DEMO_LOCAL_KEYS.includes(Auth.DEMO_APARTADO));
});
