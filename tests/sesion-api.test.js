// tests/sesion-api.test.js — correr con: node --test tests/*.test.js
//
// Auditoría del 24 sep: varios endpoints de api/ respondían a cualquiera con
// la URL (precio negociado, inscripciones con liga de Zoom, alta de correos
// ajenos, eventos del calendario). lib/sesion.js exige el token de Supabase
// y que el correo pedido sea el de la sesión (o que quien llama sea admin).
//
// @supabase/supabase-js se reemplaza en require.cache ANTES de cargar los
// endpoints: tokens y admins falsos, nada sale a la red.
const test = require('node:test');
const assert = require('node:assert/strict');

const TOKENS = { 'tok-ana': 'ana@correo.com', 'tok-admin': 'equipo@paideiatech.com' };
const ADMINS = new Set(['equipo@paideiatech.com']);

function consultaVacia() {
    const q = {
        select: () => q, eq: () => q, order: () => q, in: () => q, single: async () => ({ data: null, error: { message: 'x' } }),
        then: (ok) => ok({ data: [], error: null })
    };
    return q;
}

const supabaseFalso = {
    createClient: () => ({
        auth: {
            getUser: async (token) => TOKENS[token]
                ? { data: { user: { email: TOKENS[token] } }, error: null }
                : { data: { user: null }, error: { message: 'invalid' } }
        },
        rpc: async (nombre, args) => ({ data: nombre === 'is_admin' && ADMINS.has(args.check_email), error: null }),
        from: () => consultaVacia()
    })
};
require.cache[require.resolve('@supabase/supabase-js')] = {
    id: 'supabase-falso', filename: 'supabase-falso', loaded: true, exports: supabaseFalso
};

const Sesion = require('../lib/sesion.js');
const montoFase = require('../api/monto-fase.js');
const crearPreferencia = require('../api/crear-preferencia.js');
const misInscripciones = require('../api/mis-inscripciones-alineacion.js');
const inscribir = require('../api/inscribir-alineacion.js');
const crearEvento = require('../api/crear-evento-google.js');
const eliminarEvento = require('../api/eliminar-evento-google.js');

function resFalsa() {
    const r = { code: null, body: null, headers: {} };
    r.setHeader = (k, v) => { r.headers[k] = v; };
    r.status = c => { r.code = c; return r; };
    r.json = b => { r.body = b; return r; };
    r.send = b => { r.body = b; return r; };
    r.end = () => r;
    return r;
}
const conToken = t => (t ? { authorization: 'Bearer ' + t } : {});

test('usuarioDeSesion: sin token, token raro o inválido → null', async () => {
    assert.equal(await Sesion.usuarioDeSesion({ headers: {} }), null);
    assert.equal(await Sesion.usuarioDeSesion({ headers: { authorization: 'tok-ana' } }), null);
    assert.equal(await Sesion.usuarioDeSesion({ headers: conToken('tok-falso') }), null);
    assert.deepEqual(await Sesion.usuarioDeSesion({ headers: conToken('tok-ana') }), { token: 'tok-ana', email: 'ana@correo.com' });
});

test('sin sesión, todos los endpoints responden 401', async () => {
    const casos = [
        [montoFase, { method: 'POST', body: { email: 'ana@correo.com', fase: 'alineacion' } }],
        [crearPreferencia, { method: 'POST', body: { email: 'ana@correo.com', fase: 'alineacion' } }],
        [misInscripciones, { method: 'GET', query: { email: 'ana@correo.com' } }],
        [inscribir, { method: 'POST', body: { sesion_id: 1, usuario_email: 'ana@correo.com', usuario_nombre: 'Ana' } }],
        [crearEvento, { method: 'POST', body: { fecha: '2026-10-01', horaInicio: '10:00', horaFin: '11:00' } }],
        [eliminarEvento, { method: 'POST', body: { eventId: 'abc' } }]
    ];
    for (const [handler, req] of casos) {
        const res = resFalsa();
        await handler({ headers: {}, query: {}, ...req }, res);
        assert.equal(res.code, 401, JSON.stringify(req));
    }
});

test('el correo pedido tiene que ser el de la sesión → 403 si es de otro', async () => {
    const casos = [
        [montoFase, { method: 'POST', body: { email: 'otra@correo.com', fase: 'alineacion' } }],
        [crearPreferencia, { method: 'POST', body: { email: 'otra@correo.com', fase: 'alineacion' } }],
        [misInscripciones, { method: 'GET', query: { email: 'otra@correo.com' } }],
        [inscribir, { method: 'POST', body: { sesion_id: 1, usuario_email: 'otra@correo.com', usuario_nombre: 'Otra' } }]
    ];
    for (const [handler, req] of casos) {
        const res = resFalsa();
        await handler({ headers: conToken('tok-ana'), query: {}, ...req }, res);
        assert.equal(res.code, 403, JSON.stringify(req));
    }
});

test('el calendario solo lo tocan los admins', async () => {
    for (const [handler, body] of [[crearEvento, { fecha: '2026-10-01', horaInicio: '10:00', horaFin: '11:00' }], [eliminarEvento, { eventId: 'abc' }]]) {
        const res = resFalsa();
        await handler({ method: 'POST', headers: conToken('tok-ana'), query: {}, body }, res);
        assert.equal(res.code, 403);
    }
});

test('monto-fase: el propio correo (sin importar mayúsculas) y el admin pasan la guarda', async () => {
    const fetchOriginal = global.fetch;
    global.fetch = async () => ({ ok: true, json: async () => [{ total_acordado: 10000, monto_alineacion: null }] });
    try {
        for (const [token, email] of [['tok-ana', ' Ana@Correo.com '], ['tok-admin', 'ana@correo.com']]) {
            const res = resFalsa();
            await montoFase({ method: 'POST', headers: conToken(token), body: { email, fase: 'alineacion' } }, res);
            assert.equal(res.code, 200, token);
            assert.deepEqual(res.body, { monto: 3000 });
        }
    } finally {
        global.fetch = fetchOriginal;
    }
});

test('mis-inscripciones: el propio correo pasa la guarda', async () => {
    const res = resFalsa();
    await misInscripciones({ method: 'GET', headers: conToken('tok-ana'), query: { email: 'ana@correo.com' } }, res);
    assert.notEqual(res.code, 401);
    assert.notEqual(res.code, 403);
});
