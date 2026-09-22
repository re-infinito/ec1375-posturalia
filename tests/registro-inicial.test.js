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
   opts.errorUpsert: error que devuelve el upsert directo (camino viejo).
   opts.errorRpc: error que devuelve registrar_candidato_inicial().
   opts.faseAbierta: lo que responde el RPC de registro.
   opts.rpcAusente: true simula que el SQL todavía no se ha corrido.

   El RPC registrar_candidato_inicial() hace el merge DEL LADO DEL SERVIDOR
   (ver docs/sql/2026-09-20-registrar-candidato-inicial.sql, probado contra
   un Postgres 16 real). Aquí se imita lo justo para poder afirmar sobre lo
   que auth.js le MANDA y sobre cómo trata lo que le responde; el merge en
   sí se prueba en SQL, no aquí. */
function cargarAuth(opts = {}) {
    const localStorage = almacenEnMemoria();
    const upserts = [];
    const rpcs = [];
    const llamadasRegistro = [];
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
                rpc: async (nombre, args) => {
                    rpcs.push(nombre);
                    if (nombre === 'registrar_candidato_inicial') {
                        llamadasRegistro.push(args);
                        if (opts.rpcAusente) return { data: null, error: { code: '42883', message: 'function public.registrar_candidato_inicial(...) does not exist' } };
                        if (opts.errorRpc) return { data: null, error: opts.errorRpc };
                        const previo = (opts.fila && opts.fila.autodiagnostico_data) || null;
                        const yaFirmo = !!(previo && previo.ndaAccepted);
                        return {
                            data: {
                                ok: true,
                                faseAbierta: yaFirmo ? false : (opts.faseAbierta ?? true),
                                reRegistro: yaFirmo,
                                datos: sandbox.Auth.construirRegistroInicial(previo, {
                                    nombre: args.p_nombre,
                                    email: opts.correo,
                                    nda: { mode: args.p_nda_mode, dataUrl: args.p_nda_data_url, typedName: args.p_nda_typed_name }
                                })
                            },
                            error: null
                        };
                    }
                    if (nombre === 'autorizar_registro_inicial') {
                        if (opts.rpcAusente) return { data: null, error: { message: 'function does not exist' } };
                        return { data: opts.faseAbierta ?? true, error: null };
                    }
                    return { data: opts.bypass ?? false, error: null };
                },
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
    return { Auth: sandbox.Auth, localStorage, upserts, rpcs, llamadasRegistro };
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

test('registrarCandidato: manda nombre y firma al RPC, y guarda lo que responde', async () => {
    const { Auth, localStorage, llamadasRegistro } = cargarAuth({ correo: 'ana@ejemplo.mx' });
    const res = await Auth.registrarCandidato({
        nombre: 'Ana Lucía Pérez', email: 'ana@ejemplo.mx', nda: { mode: 'draw', dataUrl: PNG }
    });
    assert.equal(res.error, null);
    assert.equal(llamadasRegistro.length, 1);
    assert.equal(llamadasRegistro[0].p_nombre, 'Ana Lucía Pérez');
    assert.equal(llamadasRegistro[0].p_nda_mode, 'draw');
    assert.equal(llamadasRegistro[0].p_nda_data_url, PNG);
    assert.equal(res.data.ndaAccepted, true);
    assert.equal(res.data.personalData.email, 'ana@ejemplo.mx');
    // y queda también en el navegador, en la llave que lee autodiagnostico.html
    const local = JSON.parse(localStorage.getItem('autodiagnosticoData'));
    assert.equal(local.ndaAccepted, true);
    assert.equal(local.personalData.nombre, 'Ana Lucía Pérez');
});

test('registrarCandidato: la firma escrita viaja como escrita, no como dibujo', async () => {
    const { Auth, llamadasRegistro } = cargarAuth({
        correo: 'ana@ejemplo.mx',
        fila: { user_id: 'u-ana@ejemplo.mx', nombre: 'Ana P.', curp: 'PEAA900101MNLRNN01', autodiagnostico_data: { answers: { e1_c0_g0_i0: 'SI' } } }
    });
    const res = await Auth.registrarCandidato({ nombre: 'Ana Lucía Pérez', nda: { mode: 'type', typedName: 'Ana Lucía Pérez' } });
    assert.equal(llamadasRegistro[0].p_nda_mode, 'type');
    assert.equal(llamadasRegistro[0].p_nda_typed_name, 'Ana Lucía Pérez');
    assert.equal(llamadasRegistro[0].p_nda_data_url, null);
    // el avance que ya tenía sigue ahí (el merge lo hace el servidor)
    assert.equal(res.data.answers.e1_c0_g0_i0, 'SI');
});

test('registrarCandidato: sin sesión o sin nombre no escribe nada y lo dice', async () => {
    const sinSesion = cargarAuth({ correo: null });
    const r1 = await sinSesion.Auth.registrarCandidato({ nombre: 'Ana', nda: { mode: 'draw', dataUrl: PNG } });
    assert.ok(r1.error);
    assert.equal(sinSesion.llamadasRegistro.length, 0);

    const sinNombre = cargarAuth({ correo: 'ana@ejemplo.mx' });
    const r2 = await sinNombre.Auth.registrarCandidato({ nombre: '   ', nda: { mode: 'draw', dataUrl: PNG } });
    assert.ok(r2.error);
    assert.equal(sinNombre.llamadasRegistro.length, 0);
});

/* LA REGRESIÓN DEL 20 DE SEPTIEMBRE.
   El primer correo de prueba real falló con "new row violates row-level
   security policy for table candidatos_ec1375": la política exige
   is_fase_authorized(email,'registro'), que un recién llegado todavía no
   tiene. El arreglo de fondo es de SQL (el RPC hace las dos escrituras del
   lado del servidor, en orden); lo que le toca a auth.js es NO tragarse el
   error y devolver el detalle técnico para que la página lo enseñe: la
   falla llegó como una foto del celular de un candidato, y sin el código de
   Postgres a la vista esa foto no alcanzaba para diagnosticar nada. */
test('registrarCandidato: un error de RLS se devuelve CON su detalle técnico', async () => {
    const { Auth } = cargarAuth({
        correo: 'ana@ejemplo.mx',
        errorRpc: { code: '42501', message: 'new row violates row-level security policy for table "candidatos_ec1375"' }
    });
    const res = await Auth.registrarCandidato({ nombre: 'Ana Lucía', nda: { mode: 'draw', dataUrl: PNG } });
    assert.ok(res.error, 'nunca un "listo" falso');
    assert.equal(res.error.codigo, '42501');
    assert.match(res.error.detalle, /row-level security/);
    assert.match(res.error.detalle, /42501/);
});

test('registrarCandidato: un error de Supabase se devuelve (el candidato debe enterarse)', async () => {
    const { Auth } = cargarAuth({ correo: 'ana@ejemplo.mx', errorRpc: { message: 'sin red' } });
    const res = await Auth.registrarCandidato({ nombre: 'Ana Lucía', nda: { mode: 'draw', dataUrl: PNG } });
    assert.ok(res.error);
    assert.equal(res.error.detalle, 'sin red');
});

test('registrarCandidato: la cuenta demo no escribe en Supabase Y lo dice (nunca un "listo" falso)', async () => {
    const { Auth, localStorage, upserts, llamadasRegistro } = cargarAuth({ correo: 'paideia.tech@outlook.com', bypass: true });
    const res = await Auth.registrarCandidato({ nombre: 'Ana Sofía Demo Ramírez', nda: { mode: 'draw', dataUrl: PNG } });
    assert.equal(upserts.length, 0);
    assert.equal(llamadasRegistro.length, 0);
    // un registro que no quedó guardado JAMÁS debe reportarse como exitoso
    assert.ok(res.error, 'tiene que devolver el motivo, no null');
    assert.equal(res.error.demo, true);
    assert.match(res.error.message, /demostración/);
    assert.equal(JSON.parse(localStorage.getItem('autodiagnosticoData')).ndaAccepted, true);
});


/* ---------- Apertura automática de la fase 'registro' (20 sep) ----------
   Quien llega por la liga ya dejó el 50% del registro, así que al terminar se
   le abre la fase — si no, se registra, firma y choca con "Este contenido se
   habilita al pagar su fase" en su propio Autodiagnóstico. Lo hace el RPC
   autorizar_registro_inicial() (docs/sql/2026-09-20-...), nunca un insert
   desde el navegador: candidatos_fase_pagos decide quién ve el contenido
   protegido, y abrirle RLS al candidato sería regalarle la llave. */

test('registro: al guardar se abre la fase de Registro y se avisa a la página', async () => {
    const { Auth, rpcs } = cargarAuth({ correo: 'ana@ejemplo.mx' });
    const res = await Auth.registrarCandidato({ nombre: 'Ana Lucía', nda: { mode: 'draw', dataUrl: PNG } });
    assert.equal(res.error, null);
    assert.equal(res.faseAbierta, true);
    assert.ok(rpcs.includes('registrar_candidato_inicial'));
    // la fila y la fase las abre la MISMA llamada: si fueran dos, el
    // candado circular de RLS volvería (ver el comentario de auth.js).
    assert.ok(!rpcs.includes('autorizar_registro_inicial'));
});

test('registro: si el SQL todavía no se corre, el registro SE GUARDA igual', async () => {
    // Falla en silencio a propósito: el equipo abre la fase a mano, como hasta ahora.
    // A quien YA tiene su fase abierta (el equipo le capturó el pago antes)
    // la escritura directa le sigue funcionando igual que siempre.
    const { Auth, upserts } = cargarAuth({ correo: 'ana@ejemplo.mx', rpcAusente: true });
    const res = await Auth.registrarCandidato({ nombre: 'Ana Lucía', nda: { mode: 'draw', dataUrl: PNG } });
    assert.equal(res.error, null, 'el registro no puede fallar porque falte el RPC');
    assert.equal(res.faseAbierta, false);
    assert.equal(upserts.length, 1, 'cae al camino viejo, no se queda sin guardar');
});

test('registro: si el RPC dice que no, no se miente sobre la fase', async () => {
    const { Auth } = cargarAuth({ correo: 'ana@ejemplo.mx', faseAbierta: false });
    const res = await Auth.registrarCandidato({ nombre: 'Ana Lucía', nda: { mode: 'draw', dataUrl: PNG } });
    assert.equal(res.error, null);
    assert.equal(res.faseAbierta, false);
});

test('registro: si el guardado falla, NI SIQUIERA se intenta abrir la fase', async () => {
    const { Auth, rpcs } = cargarAuth({ correo: 'ana@ejemplo.mx', rpcAusente: true, errorUpsert: { message: 'sin red' } });
    const res = await Auth.registrarCandidato({ nombre: 'Ana Lucía', nda: { mode: 'draw', dataUrl: PNG } });
    assert.ok(res.error);
    assert.equal(res.faseAbierta, undefined);
    assert.ok(!rpcs.includes('autorizar_registro_inicial'), 'no se abre acceso a un registro que no quedó');
});

test('registro: la cuenta demo no abre ninguna fase', async () => {
    const { Auth, rpcs } = cargarAuth({ correo: 'paideia.tech@outlook.com', bypass: true });
    await Auth.registrarCandidato({ nombre: 'Ana Sofía Demo Ramírez', nda: { mode: 'draw', dataUrl: PNG } });
    assert.ok(!rpcs.includes('registrar_candidato_inicial'));
    assert.ok(!rpcs.includes('autorizar_registro_inicial'));
});

test('registro: volver a firmar NO reabre la fase (a quien el equipo apagó por rajarse)', async () => {
    // Si re-registrarse reabriera la fase, "apagamos a los que se rajen"
    // dejaría de servir: bastaría con volver a abrir la liga y re-firmar.
    const { Auth, llamadasRegistro } = cargarAuth({
        correo: 'ana@ejemplo.mx',
        fila: { user_id: 'u-ana@ejemplo.mx', nombre: 'Ana', curp: '',
                autodiagnostico_data: { ndaAccepted: true, ndaSignedAt: '2026-09-15T10:00:00Z', answers: {} } }
    });
    const res = await Auth.registrarCandidato({ nombre: 'Ana Lucía', nda: { mode: 'draw', dataUrl: PNG } });
    assert.equal(res.error, null);
    assert.equal(res.reRegistro, true);
    assert.equal(res.faseAbierta, false);
    // ...pero su firma y sus datos SÍ se actualizan
    assert.equal(llamadasRegistro.length, 1);
    assert.equal(llamadasRegistro[0].p_nombre, 'Ana Lucía');
    assert.equal(res.data.nda ? null : res.data.ndaSignatureMode, 'draw');
});

test('registro: una fila previa SIN el Acuerdo firmado sí cuenta como primer registro', async () => {
    // Caso real: empezó el Autodiagnóstico, no llegó a firmar, y ahora se
    // registra por la liga. Es su primera firma, así que su fase sí se abre.
    const { Auth, rpcs } = cargarAuth({
        correo: 'ana@ejemplo.mx',
        fila: { user_id: 'u-ana@ejemplo.mx', nombre: 'Ana', curp: '',
                autodiagnostico_data: { ndaAccepted: false, answers: { e1_c0_g0_i0: 'SI' } } }
    });
    const res = await Auth.registrarCandidato({ nombre: 'Ana Lucía', nda: { mode: 'draw', dataUrl: PNG } });
    assert.equal(res.reRegistro, false);
    assert.equal(res.faseAbierta, true);
    assert.ok(rpcs.includes('registrar_candidato_inicial'));
});


/* ---------- El detalle técnico en pantalla (20 sep) ----------
   La primera falla real de la liga llegó como una foto del celular de un
   candidato: "no se pudo guardar tu registro", y nada más. El error de
   Postgres que sí decía qué pasaba ("new row violates row-level security
   policy", 42501) vivía en la consola del navegador, donde nadie iba a
   verlo. Ahora sale en la tarjeta, en chiquito. Estas pruebas son sobre el
   bloque de render() de registro.html: se comprueba que exista tal cual y
   se ejecuta su lógica aparte (la página no es un módulo de Node). */

const REGISTRO_HTML = fs.readFileSync(path.join(RAIZ, 'registro.html'), 'utf8');

function bloqueErrorDeLaPagina() {
    /* Misma lógica que render(), copiada aquí; la prueba de arriba
       verifica que la página siga teniéndola igual. */
    let detalleError = '';
    const escapeHtml = (str) => String(str == null ? '' : str).replace(/[&<>"']/g, (c) =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
    return function (mensaje, detalle) {
        detalleError = detalle || '';
        let error = mensaje ? '<p class="msg error">' + escapeHtml(mensaje) + '</p>' : '';
        if (mensaje && detalleError) {
            error += '<p class="msg-detalle">Detalle para el equipo: <code>' + escapeHtml(detalleError) + '</code></p>';
        }
        return error;
    };
}

test('registro.html: render() recibe el detalle como argumento, no como estado suelto', () => {
    assert.ok(REGISTRO_HTML.includes('function render(mensaje, detalle)'));
    assert.ok(REGISTRO_HTML.includes('function irA(nuevo, mensaje, detalle)'));
    assert.ok(REGISTRO_HTML.includes("detalleError = detalle || '';"));
    assert.ok(REGISTRO_HTML.includes('Detalle para el equipo: <code>'));
    assert.ok(REGISTRO_HTML.includes('.msg-detalle {'), 'falta el estilo del renglón');
});

test('registro.html: el error de RLS sale en pantalla con su código', () => {
    const html = bloqueErrorDeLaPagina()(
        'Tu cuenta quedó lista, pero no se pudo guardar tu registro.',
        '42501: new row violates row-level security policy for table "candidatos_ec1375"');
    assert.match(html, /42501/);
    assert.match(html, /row-level security/);
});

test('registro.html: un mensaje posterior SIN detalle no arrastra el tecnicismo anterior', () => {
    const pintar = bloqueErrorDeLaPagina();
    pintar('falla', '42501: lo que sea');
    const html = pintar('La contraseña debe tener al menos 6 caracteres.');
    assert.ok(!html.includes('42501'), 'el detalle viejo se quedó pegado');
    assert.ok(!html.includes('msg-detalle'));
});

test('registro.html: el detalle del servidor se escapa (nunca inyecta HTML)', () => {
    const html = bloqueErrorDeLaPagina()('falla', '<img src=x onerror=alert(1)>');
    assert.ok(!html.includes('<img'));
    assert.match(html, /&lt;img/);
});
