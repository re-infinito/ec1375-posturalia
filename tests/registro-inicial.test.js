// tests/registro-inicial.test.js — correr con: node --test tests/*.test.js
//
// registro.html da de alta al candidato con nombre + correo + Acuerdo de
// Confidencialidad firmado, ANTES de que exista en cualquier otra parte del
// flujo. Lo que se prueba aquí es la regla que hace que eso no sea una
// segunda fuente de verdad: el Acuerdo se guarda en las MISMAS llaves de
// autodiagnostico_data que usa el paso 'nda' de autodiagnostico.html, y
// registrarse nunca borra avance que ya existiera.
//
// auth.js no es un módulo de Node: se carga en un contexto vm con un cliente
// de Supabase falso y un localStorage en memoria (mismo patrón que
// tests/datos-demo.test.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const RAIZ = path.join(__dirname, '..');
const PNG = 'data:image/png;base64,iVBORw0KGgo=';

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

/* opts.correo: sesión iniciada de ese correo (null = sin sesión).
   opts.fila: la fila de candidatos_ec1375 que ya existiera.
   opts.bypass: respuesta del RPC is_current_user_flow_bypass_admin.
   opts.errorUpsert: error que devuelve el upsert (null = escribe bien). */
function cargarAuth(opts = {}) {
    const localStorage = almacenEnMemoria();
    const upserts = [];
    const sesion = () => (opts.correo ? { user: { id: 'u-' + opts.correo, email: opts.correo } } : null);
    const sandbox = {
        localStorage,
        sessionStorage: almacenEnMemoria(),
        console: { ...console, warn: () => {} },
        setTimeout: () => 0,
        clearTimeout: () => {},
        supabase: {
            createClient: () => ({
                auth: {
                    getSession: async () => ({ data: { session: sesion() } }),
                    signOut: async () => {}
                },
                rpc: async () => ({ data: opts.bypass ?? false, error: null }),
                from: () => ({
                    select: () => ({
                        eq: () => ({ maybeSingle: async () => ({ data: opts.fila ?? null, error: null }) })
                    }),
                    upsert: async (row) => { upserts.push(row); return { error: opts.errorUpsert ?? null }; }
                })
            })
        }
    };
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(path.join(RAIZ, 'auth.js'), 'utf8'), sandbox, { filename: 'auth.js' });
    return { Auth: sandbox.Auth, localStorage, upserts };
}

/* ---------- construirRegistroInicial (función pura) ---------- */

test('construirRegistroInicial: primer registro deja el objeto que espera autodiagnostico.html', () => {
    const { Auth } = cargarAuth();
    const data = Auth.construirRegistroInicial(null, {
        nombre: '  Ana Lucía Pérez  ', email: '  ANA@Ejemplo.MX ',
        nda: { mode: 'draw', dataUrl: PNG }, fecha: '2026-09-20T18:30:00.000Z'
    });
    assert.equal(data.personalData.nombre, 'Ana Lucía Pérez');
    assert.equal(data.personalData.email, 'ana@ejemplo.mx');
    assert.equal(data.personalData.fecha, '2026-09-20');
    assert.equal(data.ndaAccepted, true);
    assert.equal(data.ndaSignedAt, '2026-09-20T18:30:00.000Z');
    assert.equal(data.ndaSignatureMode, 'draw');
    assert.equal(data.ndaSignatureDataUrl, PNG);
    assert.equal(data.ndaSignatureTypedName, '');
    // loadProgress() de autodiagnostico.html lee estas tres aunque estén vacías
    // (deepEqual no sirve: los objetos nacen en el contexto vm, no en este realm)
    assert.equal(Object.keys(data.answers).length, 0);
    assert.equal(data.certificados.length, 0);
    assert.equal(data.sinCertificadosPrevios, false);
});

test('construirRegistroInicial: la firma escrita no arrastra una imagen, y al revés', () => {
    const { Auth } = cargarAuth();
    const escrita = Auth.construirRegistroInicial(null, {
        nombre: 'Ana', nda: { mode: 'type', typedName: '  Ana Lucía Pérez ', dataUrl: PNG }
    });
    assert.equal(escrita.ndaSignatureMode, 'type');
    assert.equal(escrita.ndaSignatureTypedName, 'Ana Lucía Pérez');
    assert.equal(escrita.ndaSignatureDataUrl, null);

    const dibujada = Auth.construirRegistroInicial(null, {
        nombre: 'Ana', nda: { mode: 'draw', dataUrl: PNG, typedName: 'Otro Nombre' }
    });
    assert.equal(dibujada.ndaSignatureTypedName, '');
    assert.equal(dibujada.ndaSignatureDataUrl, PNG);
});

test('construirRegistroInicial: un modo de firma desconocido cae a dibujar', () => {
    const { Auth } = cargarAuth();
    const data = Auth.construirRegistroInicial(null, { nombre: 'Ana', nda: { mode: 'subida', dataUrl: PNG } });
    assert.equal(data.ndaSignatureMode, 'draw');
});

test('construirRegistroInicial: registrarse otra vez NUNCA borra avance ya guardado', () => {
    const { Auth } = cargarAuth();
    const previo = {
        personalData: { nombre: 'Ana P.', curp: 'PEAA900101MNLRNN01', domicilio: 'Calle 1', email: 'ana@ejemplo.mx', fecha: '2026-09-01', renapAutorizado: true },
        answers: { e1_c0_g0_i0: 'SI' },
        certificados: [{ nombre: 'Masaje', path: 'u/1.pdf' }],
        signatureDataUrl: PNG, signatureMode: 'draw', triptychAccepted: true,
        documentosNextcloud: { autodiagnostico: 'Portafolios/Ana/01-Registro/a.pdf' }
    };
    const data = Auth.construirRegistroInicial(previo, {
        nombre: 'Ana Lucía Pérez', email: 'ana@ejemplo.mx',
        nda: { mode: 'type', typedName: 'Ana Lucía Pérez' }, fecha: '2026-09-20T18:30:00.000Z'
    });
    assert.equal(data.answers.e1_c0_g0_i0, 'SI');
    assert.equal(Object.keys(data.answers).length, 1);
    assert.equal(data.certificados.length, 1);
    assert.equal(data.signatureDataUrl, PNG);
    assert.equal(data.triptychAccepted, true);
    assert.equal(data.documentosNextcloud.autodiagnostico, previo.documentosNextcloud.autodiagnostico);
    // el CURP y el domicilio ya capturados se conservan; el nombre se actualiza
    assert.equal(data.personalData.curp, 'PEAA900101MNLRNN01');
    assert.equal(data.personalData.domicilio, 'Calle 1');
    assert.equal(data.personalData.nombre, 'Ana Lucía Pérez');
    // la fecha de Datos Personales ya existía: no se pisa con la de hoy
    assert.equal(data.personalData.fecha, '2026-09-01');
});

test('construirRegistroInicial: nunca marca los datos como demo', () => {
    const { Auth } = cargarAuth();
    const data = Auth.construirRegistroInicial({ _demo: undefined }, { nombre: 'Ana', nda: { mode: 'draw', dataUrl: PNG } });
    assert.equal(data._demo, undefined);
});

/* ---------- la firma que queda es la que reutiliza el resto del sitio ---------- */

test('lo que guarda el registro es una firma válida para FirmaCandidato', () => {
    const { Auth } = cargarAuth();
    const F = require('../firma-candidato.js');
    const dibujada = Auth.construirRegistroInicial(null, { nombre: 'Ana', nda: { mode: 'draw', dataUrl: PNG } });
    assert.deepEqual({ ...F.firmaDeAutodiagnostico(dibujada) }, { mode: 'draw', dataUrl: PNG, typedName: '', origen: 'confidencialidad' });

    const escrita = Auth.construirRegistroInicial(null, { nombre: 'Ana', nda: { mode: 'type', typedName: 'Ana Lucía' } });
    assert.equal(F.firmaDeAutodiagnostico(escrita).origen, 'confidencialidad');
    assert.equal(F.firmaDeAutodiagnostico(escrita).typedName, 'Ana Lucía');
});

/* ---------- registrarCandidato (escritura) ---------- */

test('registrarCandidato: escribe nombre y autodiagnostico_data en la fila del usuario', async () => {
    const { Auth, localStorage, upserts } = cargarAuth({ correo: 'ana@ejemplo.mx' });
    const res = await Auth.registrarCandidato({
        nombre: 'Ana Lucía Pérez', email: 'ana@ejemplo.mx', nda: { mode: 'draw', dataUrl: PNG }
    });
    assert.equal(res.error, null);
    assert.equal(upserts.length, 1);
    assert.equal(upserts[0].user_id, 'u-ana@ejemplo.mx');
    assert.equal(upserts[0].nombre, 'Ana Lucía Pérez');
    assert.equal(upserts[0].autodiagnostico_data.ndaAccepted, true);
    assert.equal(upserts[0].autodiagnostico_data.personalData.email, 'ana@ejemplo.mx');
    // y queda también en el navegador, en la llave que lee autodiagnostico.html
    const local = JSON.parse(localStorage.getItem('autodiagnosticoData'));
    assert.equal(local.ndaAccepted, true);
    assert.equal(local.personalData.nombre, 'Ana Lucía Pérez');
});

test('registrarCandidato: no pisa con vacío el CURP que la fila ya tenía', async () => {
    const { Auth, upserts } = cargarAuth({
        correo: 'ana@ejemplo.mx',
        fila: { user_id: 'u-ana@ejemplo.mx', nombre: 'Ana P.', curp: 'PEAA900101MNLRNN01', autodiagnostico_data: { answers: { e1_c0_g0_i0: 'SI' } } }
    });
    await Auth.registrarCandidato({ nombre: 'Ana Lucía Pérez', nda: { mode: 'type', typedName: 'Ana Lucía Pérez' } });
    assert.equal(upserts[0].curp, 'PEAA900101MNLRNN01');
    assert.equal(upserts[0].autodiagnostico_data.answers.e1_c0_g0_i0, 'SI');
});

test('registrarCandidato: sin sesión o sin nombre no escribe nada y lo dice', async () => {
    const sinSesion = cargarAuth({ correo: null });
    const r1 = await sinSesion.Auth.registrarCandidato({ nombre: 'Ana', nda: { mode: 'draw', dataUrl: PNG } });
    assert.ok(r1.error);
    assert.equal(sinSesion.upserts.length, 0);

    const sinNombre = cargarAuth({ correo: 'ana@ejemplo.mx' });
    const r2 = await sinNombre.Auth.registrarCandidato({ nombre: '   ', nda: { mode: 'draw', dataUrl: PNG } });
    assert.ok(r2.error);
    assert.equal(sinNombre.upserts.length, 0);
});

test('registrarCandidato: un error de Supabase se devuelve (el candidato debe enterarse)', async () => {
    const { Auth, upserts } = cargarAuth({ correo: 'ana@ejemplo.mx', errorUpsert: { message: 'sin red' } });
    const res = await Auth.registrarCandidato({ nombre: 'Ana Lucía', nda: { mode: 'draw', dataUrl: PNG } });
    assert.equal(upserts.length, 1);
    assert.equal(res.error.message, 'sin red');
});

test('registrarCandidato: la cuenta demo nunca escribe en Supabase', async () => {
    const { Auth, localStorage, upserts } = cargarAuth({ correo: 'paideia.tech@outlook.com', bypass: true });
    const res = await Auth.registrarCandidato({ nombre: 'Ana Sofía Demo Ramírez', nda: { mode: 'draw', dataUrl: PNG } });
    assert.equal(res.error, null);
    assert.equal(upserts.length, 0);
    assert.equal(JSON.parse(localStorage.getItem('autodiagnosticoData')).ndaAccepted, true);
});
