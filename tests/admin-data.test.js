// tests/admin-data.test.js — correr con: node --test tests/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const AdminData = require('../admin-data.js');

function answers142() { const a = {}; for (let i = 0; i < 142; i++) a['k' + i] = 'SI'; return a; }
function datos() {
    return {
        precio: [
            { email: 'a@x.com', lote: 1, estado: 'activo', total_acordado: 14750, monto_registro: 2000, monto_alineacion: 4250, monto_evaluacion: 6000, monto_entrega: 2500 },
            { email: 'b@x.com', lote: 1, estado: 'desistió', total_acordado: 14750, monto_registro: 2000, monto_alineacion: 4250, monto_evaluacion: 6000, monto_entrega: 2500 },
            { email: 'c@x.com', lote: 2, estado: 'activo', total_acordado: 10000, monto_registro: 2000, monto_alineacion: 3000, monto_evaluacion: 3000, monto_entrega: 2000 },
            { email: 'paideia.tech@outlook.com', lote: 1, estado: 'administrador', total_acordado: 0 }
        ],
        pagos: [
            { email: 'a@x.com', fase: 'registro', monto: 2000, origen: 'mercadopago', autorizado_en: '2026-09-01T10:00:00Z' },
            { email: 'a@x.com', fase: 'alineacion', monto: 4250, origen: 'manual', autorizado_en: '2026-09-10T10:00:00Z' },
            { email: 'b@x.com', fase: 'registro', monto: 2000, origen: 'mercadopago', autorizado_en: '2026-08-20T10:00:00Z' },
            { email: 'c@x.com', fase: 'registro', monto: 2000, origen: 'manual', autorizado_en: '2026-09-12T10:00:00Z' }
        ],
        reparto: [{ lote: 1, incluir_chris: true, porcentaje_chris: 50, porcentaje_fernando: 16.67, porcentaje_lot: 16.67, porcentaje_diego: 16.66 }],
        utilidadesPagos: [{ lote: 1, socio: 'chris', monto: 1000 }, { lote: 1, socio: 'diego', monto: 200 }],
        nombres: [{ email: 'c@x.com', nombre: 'Carla' }],
        candidatosRows: [
            { email: 'a@x.com', nombre: 'Ana', updated_at: '2026-09-14T10:00:00Z', autodiagnostico_data: { answers: answers142(), ndaAccepted: true }, plan_evaluacion_data: { documentosNextcloud: { planEvaluacion: 'p', acusePlanEvaluacion: 'q' } } }
        ],
        sesiones: [{ id: 1, fecha: '2026-09-20', hora_inicio: '18:00', capacidad_maxima: 10, inscritos: 3, zoom_link: '' }]
    };
}

test('kpis: ingresos incluyen desistidos, proyectado solo activos, embudo', () => {
    const k = AdminData.kpis(datos());
    assert.equal(k.totalInscritos, 2);
    assert.equal(k.ingresosTotales, 2000 + 4250 + 2000 + 2000);
    assert.equal(k.proyectado, 14750 + 10000);
    assert.deepEqual(k.porFase, { registro: 2, alineacion: 1, evaluacion: 0, entrega: 0 });
    assert.equal(k.desistieron, 1);
    const k1 = AdminData.kpis(datos(), 1);
    assert.equal(k1.ingresosTotales, 2000 + 4250 + 2000);
});

test('utilidades por lote: a repartir, pagado y pendiente por socio', () => {
    const u = AdminData.utilidades(datos(), 1);
    assert.equal(u.ingresos, 8250);
    const chris = u.socios.find(s => s.id === 'chris');
    assert.equal(chris.aRepartir, Math.round(8250 * 0.5));
    assert.equal(chris.pagado, 1000);
    assert.equal(chris.pendiente, Math.round(8250 * 0.5) - 1000);
    assert.equal(u.pagado, 1200);
    const g = AdminData.utilidadesGlobal(datos());
    assert.deepEqual(g.porLote.map(x => x.lote), [1, 2]);
    assert.equal(g.pagado, 1200);
});

test('gastos: por certificado = monto × activos del lote, se descuenta antes de repartir', () => {
    const d = datos();
    d.gastos = [{ id: 1, lote: null, concepto: 'Centro Evaluador', tipo: 'por_certificado', monto: 1200 }];
    // Lote 1: solo 'a' está activo ('b' desistió, el administrador no cuenta) → 1 certificado
    const g1 = AdminData.gastosLote(d, 1);
    assert.equal(g1.certificados, 1);
    assert.equal(g1.total, 1200);
    const u1 = AdminData.utilidades(d, 1);
    assert.equal(u1.ingresos, 8250);
    assert.equal(u1.neto, 8250 - 1200);
    const chris = u1.socios.find(s => s.id === 'chris');
    assert.equal(chris.aRepartir, Math.round((8250 - 1200) * 0.5));
    // Lote 2: 'c' activo → otro certificado; el mismo gasto global aplica también ahí
    assert.equal(AdminData.gastosLote(d, 2).total, 1200);
});

test('gastos: el monto se puede editar, fijo y por lote, y aplican solo donde corresponde', () => {
    const d = datos();
    d.gastos = [
        { id: 1, lote: null, concepto: 'Centro Evaluador', tipo: 'por_certificado', monto: 1500 },
        { id: 2, lote: 1, concepto: 'Publicidad', tipo: 'fijo', monto: 500 }
    ];
    assert.equal(AdminData.gastosLote(d, 1).total, 1500 + 500);
    assert.equal(AdminData.gastosLote(d, 2).total, 1500);          // la publicidad es solo del lote 1
    assert.deepEqual(AdminData.gastosLote(d, 1).items.map(g => g.cantidad), [1, 1]);
});

test('gastos: si superan lo cobrado no se reparte nada (nunca negativo) y neto conserva el faltante', () => {
    const d = datos();
    d.gastos = [{ id: 1, lote: 1, concepto: 'Fijo grande', tipo: 'fijo', monto: 10000 }];
    const u = AdminData.utilidades(d, 1);
    assert.equal(u.neto, 8250 - 10000);
    assert.equal(u.aRepartir, 0);
    assert.ok(u.socios.every(s => s.aRepartir === 0 && s.pendiente === 0));
});

test('gastos: sin gastos el reparto no cambia (tabla vacía o aún sin crear)', () => {
    const conVacio = Object.assign(datos(), { gastos: [] });
    const sinClave = datos();
    assert.equal(AdminData.utilidades(conVacio, 1).aRepartir, AdminData.utilidades(sinClave, 1).aRepartir);
    assert.equal(AdminData.utilidades(sinClave, 1).gastos.total, 0);
});

// La hoja de Diego (18 sep): un candidato de $14,750 con las 4 fases pagadas.
function datosHoja(config) {
    return {
        precio: [{ email: 'a@x.com', lote: 1, estado: 'activo', total_acordado: 14750, monto_registro: 2000, monto_alineacion: 4250, monto_evaluacion: 6000, monto_entrega: 2500 }],
        pagos: ['registro', 'alineacion', 'evaluacion', 'entrega'].map(f => ({ email: 'a@x.com', fase: f })),
        reparto: [Object.assign({ lote: 1, incluir_chris: true, porcentaje_chris: 50, porcentaje_fernando: 16.67, porcentaje_lot: 16.67, porcentaje_diego: 16.66 }, config)],
        gastos: [
            { id: 1, lote: null, concepto: 'Centro Evaluador', tipo: 'por_certificado', monto: 1200, para: 'real' },
            { id: 2, lote: null, concepto: 'Centro 1', tipo: 'por_certificado', monto: 1250, para: 'chris' },
            { id: 3, lote: null, concepto: 'Centro 2', tipo: 'por_certificado', monto: 1250, para: 'chris' },
            { id: 4, lote: null, concepto: 'Certificación', tipo: 'por_certificado', monto: 1500, para: 'chris' }
        ],
        utilidadesPagos: [], nombres: [], candidatosRows: [], sesiones: []
    };
}

test('dos tablas de costos: Tabla Chris ($10,750 → Chris $5,375) vs real ($13,550), el diferencial es de los socios', () => {
    const u = AdminData.utilidades(datosHoja(), 1);
    const r = u.reparto;
    assert.equal(u.ingresos, 14750);
    assert.equal(u.neto, 13550);                    // Tabla Socios: 14,750 − 1,200
    assert.equal(r.costoChris, 4000);
    assert.equal(r.netoChris, 10750);               // Tabla Chris: 14,750 − 4,000
    assert.equal(r.chris, 5375);                    // 50% de 10,750
    assert.equal(r.pool, 8175);                     // 13,550 − 5,375
    assert.equal(r.diferencial, 2800);              // 4,000 − 1,200
    const porSocio = ['fernando', 'lot', 'diego'].map(id => u.socios.find(s => s.id === id).aRepartir);
    porSocio.forEach(m => assert.ok(Math.abs(m - 2725) <= 1, `cada socio ≈ 8,175 ÷ 3 = 2,725 (fue ${m})`));
    assert.ok(Math.abs(u.aRepartir - 13550) <= 2);  // Chris + socios = neto real
});

test('dos tablas de costos: lote sin Chris reparte el neto real entre los 3 socios', () => {
    const u = AdminData.utilidades(datosHoja({ incluir_chris: false, porcentaje_chris: 0, porcentaje_fernando: 33.33, porcentaje_lot: 33.33, porcentaje_diego: 33.34 }), 1);
    assert.equal(u.socios.length, 3);
    assert.equal(u.aRepartir >= 13549 && u.aRepartir <= 13551, true);
    u.socios.forEach(s => assert.ok(Math.abs(s.aRepartir - 4517) <= 1));
    assert.equal(u.reparto.diferencial, 0);
});

test('dos tablas de costos: sin costos propios de Chris se le descuentan los reales', () => {
    const d = datosHoja();
    d.gastos = d.gastos.filter(g => g.para === 'real');
    const r = AdminData.utilidades(d, 1).reparto;
    assert.equal(r.chris, Math.round(13550 * 0.5));
    assert.equal(r.diferencial, 0);
    assert.equal(r.propiosChris, false);
});

test('fichaCandidato: las dos tablas por candidato coinciden con la hoja', () => {
    const f = AdminData.fichaCandidato(datosHoja(), 1);
    assert.equal(f.precio, 14750);
    assert.deepEqual(f.fases, { registro: 2000, alineacion: 4250, evaluacion: 6000, entrega: 2500 });
    assert.equal(f.real.total, 1200);
    assert.equal(f.real.neto, 13550);
    assert.equal(f.chris.total, 4000);
    assert.equal(f.chris.neto, 10750);
    assert.equal(f.reparto.chris, 5375);
    assert.equal(f.reparto.pool, 8175);
    assert.equal(f.reparto.diferencial, 2800);
});

// Hoja actualizada (18 sep): cada costo se genera en su fase.
function datosFases(pagadas, extra) {
    const d = datosHoja();
    d.gastos = [
        { id: 1, lote: null, concepto: 'Certificado (Centro Evaluador)', tipo: 'por_certificado', monto: 1200, para: 'real', fase: 'entrega' },
        { id: 2, lote: null, concepto: 'Centro 1', tipo: 'por_certificado', monto: 1250, para: 'chris', fase: 'alineacion' },
        { id: 3, lote: null, concepto: 'Centro 2', tipo: 'por_certificado', monto: 1250, para: 'chris', fase: 'evaluacion' },
        { id: 4, lote: null, concepto: 'Certificado', tipo: 'por_certificado', monto: 1500, para: 'chris', fase: 'entrega' }
    ];
    d.pagos = pagadas.map(f => ({ email: 'a@x.com', fase: f }));
    return Object.assign(d, extra || {});
}

test('costos por fase: con todo pagado da la hoja (Chris 5,375, socios 8,175, 2,725 c/u)', () => {
    const d = datosFases(['registro', 'alineacion', 'evaluacion', 'entrega']);
    d.reparto[0].porcentaje_diego = 16.67;
    const u = AdminData.utilidades(d, 1);
    assert.equal(u.neto, 13550);
    assert.equal(u.reparto.chris, 5375);
    assert.equal(u.reparto.pool, 8175);
    assert.deepEqual(['fernando', 'lot', 'diego'].map(id => u.reparto.montos[id]), [2725, 2725, 2725]);
});

test('costos por fase: solo se descuenta lo de las fases ya pagadas', () => {
    // Pagó Apartado y Alineación: entra Centro 1 (Chris); el certificado todavía no.
    const u = AdminData.utilidades(datosFases(['registro', 'alineacion']), 1);
    assert.equal(u.ingresos, 6250);
    assert.equal(u.gastos.total, 0);
    assert.equal(u.gastos.chris.total, 1250);
    assert.equal(u.reparto.chris, Math.round((6250 - 1250) * 0.5));
    assert.equal(u.reparto.pool, 6250 - 2500);
    // Solo Apartado: ningún costo todavía.
    const u2 = AdminData.utilidades(datosFases(['registro']), 1);
    assert.equal(u2.gastos.total + u2.gastos.chris.total, 0);
    assert.equal(u2.reparto.chris, 1000);
});

test('costos por fase: quien desistió después de pagar una fase sí genera su costo', () => {
    const d = datosFases(['registro', 'alineacion']);
    d.precio[0].estado = 'desistió';
    const g = AdminData.gastosLote(d, 1);
    assert.equal(g.pagaron.alineacion, 1);
    assert.equal(g.chris.total, 1250);
});

test('porFaseLote: candidatos que pagaron, ingresos y costos de cada fase', () => {
    const p = AdminData.porFaseLote(datosFases(['registro', 'alineacion', 'evaluacion', 'entrega']), 1);
    assert.deepEqual(p.fases.map(f => [f.pagaron, f.ingresos, f.costoReal, f.costoChris]),
        [[1, 2000, 0, 0], [1, 4250, 0, 1250], [1, 6000, 0, 1250], [1, 2500, 1200, 1500]]);
    assert.equal(p.otrosReal + p.otrosChris, 0);
});

test('fichaCandidato: desglose por fase como la hoja y participación efectiva', () => {
    const d = datosFases(['registro']);
    d.reparto[0].porcentaje_diego = 16.67;
    const f = AdminData.fichaCandidato(d, 1);
    assert.deepEqual(f.porFase.map(x => x.baseChris), [2000, 3000, 4750, 1000]);   // suma 10,750
    assert.deepEqual(f.porFase.map(x => x.neto), [2000, 4250, 6000, 1300]);        // suma 13,550
    assert.deepEqual(f.porFase.map(x => x.chris), [1000, 1500, 2375, 500]);        // suma 5,375
    assert.deepEqual(f.porFase.map(x => x.socios), [1000, 2750, 3625, 800]);       // suma 8,175
    assert.equal(f.reparto.chris, 5375);
    assert.equal(Math.round(f.participacion.chris), 40);
    assert.equal(Math.round(f.participacion.fernando), 20);
});

test('cortePorCandidato: precio real de cada uno, solo lo cobrado, y cuadra con el reparto del lote', () => {
    const d = datosFases([]);
    d.reparto[0].porcentaje_diego = 16.67;
    d.precio = [
        { email: 'a@x.com', nombre: 'Ana', lote: 1, estado: 'activo', total_acordado: 14750, monto_registro: 2000, monto_alineacion: 4250, monto_evaluacion: 6000, monto_entrega: 2500 },
        { email: 'b@x.com', nombre: 'Beto', lote: 1, estado: 'activo', total_acordado: 12000, monto_registro: 2000, monto_alineacion: 3500, monto_evaluacion: 5000, monto_entrega: 1500 },
        { email: 'y@x.com', nombre: 'Yusel', lote: 1, estado: 'desistió', total_acordado: 14750, monto_registro: 2000, monto_alineacion: 4250 },
        { email: 'adm@x.com', lote: 1, estado: 'administrador', total_acordado: 99999, monto_registro: 99999 }
    ];
    d.pagos = [
        ...['registro', 'alineacion', 'evaluacion', 'entrega'].map(f => ({ email: 'a@x.com', fase: f })),
        ...['registro', 'alineacion'].map(f => ({ email: 'b@x.com', fase: f })),
        { email: 'y@x.com', fase: 'registro' }, { email: 'adm@x.com', fase: 'registro' }
    ];
    const c = AdminData.cortePorCandidato(d, 1);
    assert.equal(c.filas.length, 3);                                 // el administrador no aparece
    const ana = c.filas.find(f => f.email === 'a@x.com');
    assert.equal(ana.chris, 5375); assert.equal(ana.socios, 8175);    // la hoja
    const beto = c.filas.find(f => f.email === 'b@x.com');
    assert.equal(beto.totalRecibido, 5500);                           // su precio, no el promedio
    assert.equal(beto.costoChris, 1250);                              // solo Centro 1 (pagó Alineación)
    assert.equal(beto.costoReal, 0);
    assert.equal(beto.chris, (5500 - 1250) / 2);
    assert.equal(beto.pendientePorCobrar, 12000 - 5500);
    const yusel = c.filas.find(f => f.email === 'y@x.com');
    assert.equal(yusel.totalRecibido, 2000);                          // desistió: cuenta lo que pagó
    assert.equal(yusel.chris, 1000);
    const u = AdminData.utilidades(d, 1);
    assert.equal(c.subtotal.recibido, u.ingresos);
    assert.equal(Math.round(c.subtotal.chris), u.reparto.chris);
    assert.equal(Math.round(c.subtotal.socios), u.reparto.pool);
});

test('candidatos: paso real con computeSteps, docs, nombre y fase pagada', () => {
    const lista = AdminData.candidatos(datos());
    const a = lista.find(c => c.email === 'a@x.com');
    assert.equal(a.nombre, 'Ana');
    assert.equal(a.fasePagada, 'Alineación');
    assert.equal(a.paso.id, 'reforzamiento');          // autodiagnóstico hecho, reforzamiento current
    assert.equal(a.docs.completos, 2);
    assert.equal(a.hechos, 3);                          // autodiagnóstico, alineación (pagada), plan-evaluación
    const c = lista.find(c => c.email === 'c@x.com');
    assert.equal(c.paso.id, 'sin_iniciar');
    assert.equal(c.nombre, 'Carla');
    assert.equal(c.fasePagada, 'Registro');
    const pp = AdminData.porPaso(lista);
    assert.equal(pp.find(p => p.id === 'reforzamiento').n, 1);
    assert.equal(pp.find(p => p.id === 'sin_iniciar').n, 1);
});

test('ultimosPagos ordena por fecha y atencion detecta sin iniciar, inactivos y sesión sin Zoom', () => {
    const up = AdminData.ultimosPagos(datos(), 2);
    assert.equal(up[0].email, 'c@x.com');
    assert.equal(up[1].faseLabel, 'Alineación');
    const lista = AdminData.candidatos(datos());
    const at = AdminData.atencion(datos(), lista, new Date('2026-10-20T00:00:00Z'));
    assert.ok(at.some(i => i.tipo === 'sin_iniciar' && i.email === 'c@x.com'));
    assert.ok(at.some(i => i.tipo === 'inactivo' && i.email === 'a@x.com'));
    assert.ok(at.some(i => i.tipo === 'sesion'));
});

test('declaraciones: fecha de cada una o null, desde Plan y Evidencias', () => {
    const row = {
        plan_evaluacion_data: { planData: { declaraciones: { version: '2026-09-17', requisitos: '2026-09-17T15:00:00Z', material: '2026-09-17T15:01:00Z' } } },
        evidencias_data: { planData: { declaracionAutenticidad: { version: '2026-09-17', fecha: '2026-09-18T10:00:00Z' } } }
    };
    const d = AdminData.declaraciones(row);
    assert.deepEqual(d.map(x => x.id), ['requisitos', 'material', 'sinReembolsos', 'autenticidad']);
    assert.deepEqual(d.map(x => x.fecha), ['2026-09-17T15:00:00Z', '2026-09-17T15:01:00Z', null, '2026-09-18T10:00:00Z']);
    assert.ok(d.every(x => typeof x.label === 'string' && x.label.length > 5));
});

test('declaraciones: sin fila, sin datos o con valores raros → todas pendientes', () => {
    for (const row of [null, {}, { plan_evaluacion_data: null }, { plan_evaluacion_data: { planData: { declaraciones: { requisitos: true } } } }]) {
        assert.deepEqual(AdminData.declaraciones(row).map(x => x.fecha), [null, null, null, null]);
    }
});

test('declaraciones: una "fecha" que no es fecha válida cuenta como pendiente (no llega HTML al panel)', () => {
    const row = { plan_evaluacion_data: { planData: { declaraciones: { requisitos: '<textarea>', material: 'mañana', sinReembolsos: '2026-09-17T15:02:00Z' } } } };
    assert.deepEqual(AdminData.declaraciones(row).map(x => x.fecha), [null, null, '2026-09-17T15:02:00Z', null]);
});

test('candidatos: un evaluador (sin precios ni pagos) ve la lista de las filas, con las fases del RPC', () => {
    const datos = { precio: [], pagos: [], reparto: [], utilidadesPagos: [], nombres: [], errores: {},
        candidatosRows: [{ email: 'Ana@Ejemplo.com', nombre: 'Ana', updated_at: '2026-09-18T00:00:00Z', fases_pagadas: ['registro', 'alineacion', 'evaluacion', 'entrega'] }] };
    const l = AdminData.candidatos(datos);
    assert.equal(l.length, 1);
    assert.equal(l[0].email, 'ana@ejemplo.com');
    assert.equal(l[0].nombre, 'Ana');
    assert.equal(l[0].fases.entrega, true);
    assert.equal(l[0].fasePagada, 'Entrega');
});

test('atencionSala: plazo vencido, por vencer y sesión grabada sin copiar al NAS', () => {
    const d = datos();
    d.pagos.push({ email: 'c@x.com', fase: 'alineacion', monto: 3000, origen: 'manual', autorizado_en: '2026-09-15T16:00:00Z' });
    d.salaConfig = { dias_limite: 30 };
    d.evalSala = [{ email: 'c@x.com', limite_evidencia: null, video: null }];
    d.reservasSala = [{ email: 'a@x.com', estado: 'asistio', horarios_evidencia: { inicio: '2026-09-20T16:00:00Z', fin: '2026-09-20T17:30:00Z' } }];
    const lista = AdminData.candidatos(d);
    // a@x.com: Alineación el 10 sep → límite 10 oct. c@x.com: 15 sep → 15 oct.
    const it = AdminData.atencionSala(d, lista, new Date('2026-10-12T18:00:00Z'));
    assert.ok(it.some(i => i.tipo === 'plazo_vencido' && i.email === 'a@x.com'));
    assert.ok(it.some(i => i.tipo === 'plazo_pronto' && i.email === 'c@x.com' && /3 días/.test(i.texto)));
    assert.ok(it.some(i => i.tipo === 'sin_grabacion' && i.email === 'a@x.com'));
    d.evalSala.push({ email: 'a@x.com', limite_evidencia: '2026-11-30', video: { partes: [{ nas: { ruta: 'Portafolios/x/03-Evaluacion/g.mp4' } }] } });
    const it2 = AdminData.atencionSala(d, AdminData.candidatos(d), new Date('2026-10-12T18:00:00Z'));
    assert.ok(!it2.some(i => i.email === 'a@x.com'));
});

test('atencionSala: sin el SQL de la sala no avisa nada', () => {
    const d = datos(); d.errores = { salaConfig: 'relation does not exist' };
    assert.deepEqual(AdminData.atencionSala(d, AdminData.candidatos(d), new Date('2026-10-12T18:00:00Z')), []);
});

/* ---------- Auto-registrados (registro.html, 20 sep) ----------
   Quien firma su NDA por la liga existe en candidatos_ec1375 pero todavía no
   en candidatos_precio. Antes desaparecía del panel del equipo; ahora sale
   como 'prospecto' para que un admin le capture lote y montos. Lo que estas
   pruebas cuidan es que aparecer en la lista NO mueva un solo peso: todo el
   cálculo financiero pasa por visibles(), que lee candidatos_precio. */

function conProspecto() {
    const d = datos();
    d.candidatosRows.push({
        email: 'Nueva@Ejemplo.MX', nombre: 'Nueva Candidata', updated_at: '2026-09-20T12:00:00Z',
        autodiagnostico_data: { ndaAccepted: true, ndaSignedAt: '2026-09-20T12:00:00Z', answers: {} }
    });
    return d;
}

test('auto-registrado: aparece en la lista como prospecto, con lote y montos SIN capturar', () => {
    const lista = AdminData.candidatos(conProspecto());
    const p = lista.find(c => c.email === 'nueva@ejemplo.mx');
    assert.ok(p, 'el que se registró por la liga debe salir en el panel');
    assert.equal(p.estado, AdminData.ESTADO_PROSPECTO);
    assert.equal(p.tieneAlta, false);
    // sin capturar es null, no 1 ni 0: la UI tiene que poder decir "—"
    assert.equal(p.lote, null);
    assert.equal(p.totalAcordado, null);
    assert.equal(p.nombre, 'Nueva Candidata');
    assert.equal(p.tieneFila, true);
    assert.equal(p.fasePagada, 'Sin pago');
    // y los que sí están dados de alta siguen igual
    const a = lista.find(c => c.email === 'a@x.com');
    assert.equal(a.tieneAlta, true);
    assert.equal(a.lote, 1);
    assert.equal(a.totalAcordado, 14750);
});

test('auto-registrado: no mueve NI UN PESO de KPIs, ingresos, gastos ni reparto', () => {
    const antes = datos(), despues = conProspecto();
    assert.deepEqual(AdminData.kpis(despues), AdminData.kpis(antes));
    for (const lote of [1, 2]) {
        assert.deepEqual(AdminData.utilidades(despues, lote), AdminData.utilidades(antes, lote));
        assert.deepEqual(AdminData.gastosLote(despues, lote), AdminData.gastosLote(antes, lote));
        assert.deepEqual(AdminData.porFaseLote(despues, lote), AdminData.porFaseLote(antes, lote));
        assert.deepEqual(AdminData.cortePorCandidato(despues, lote), AdminData.cortePorCandidato(antes, lote));
    }
    assert.deepEqual(AdminData.lotes(despues), AdminData.lotes(antes));
    assert.deepEqual(AdminData.utilidadesGlobal(despues), AdminData.utilidadesGlobal(antes));
});

test('auto-registrado: no cuenta como activo en el embudo por paso', () => {
    const lista = AdminData.candidatos(conProspecto());
    assert.deepEqual(AdminData.porPaso(lista), AdminData.porPaso(AdminData.candidatos(datos())));
});

test('auto-registrado: sale en "Requieren atención" con la liga para darlo de alta', () => {
    const d = conProspecto();
    const at = AdminData.atencion(d, AdminData.candidatos(d), new Date('2026-09-21T00:00:00Z'));
    const it = at.find(i => i.tipo === 'sin_alta');
    assert.ok(it, 'el equipo se entera por aquí de que hay alguien sin datos financieros');
    assert.equal(it.email, 'nueva@ejemplo.mx');
    assert.ok(it.href.startsWith('admin-precios.html?alta='));
    assert.ok(it.href.includes(encodeURIComponent('nueva@ejemplo.mx')));
    assert.ok(/se registró/.test(it.texto) && /Nueva Candidata/.test(it.texto));
});

test('auto-registrado: darlo de alta lo saca de prospectos sin duplicarlo', () => {
    const d = conProspecto();
    d.precio.push({ email: 'nueva@ejemplo.mx', lote: 2, estado: 'activo', total_acordado: 14750, monto_registro: 2000 });
    const lista = AdminData.candidatos(d);
    assert.equal(lista.filter(c => c.email === 'nueva@ejemplo.mx').length, 1);
    const p = lista.find(c => c.email === 'nueva@ejemplo.mx');
    assert.equal(p.estado, 'activo');
    assert.equal(p.tieneAlta, true);
    assert.equal(p.lote, 2);
    assert.equal(p.totalAcordado, 14750);
    assert.equal(AdminData.atencion(d, lista, new Date('2026-09-21T00:00:00Z')).filter(i => i.tipo === 'sin_alta').length, 0);
});

test('auto-registrado: el correo se compara sin importar mayúsculas (no se duplica)', () => {
    const d = datos();
    d.candidatosRows.push({ email: 'A@X.com', nombre: 'Ana Otra Vez', updated_at: '2026-09-20T12:00:00Z' });
    const lista = AdminData.candidatos(d);
    assert.equal(lista.filter(c => c.email.toLowerCase() === 'a@x.com').length, 1);
    assert.equal(lista.find(c => c.email === 'a@x.com').tieneAlta, true);
});

test('auto-registrado: la cuenta demo nunca entra como prospecto', () => {
    const d = datos();
    d.candidatosRows.push({ email: 'paideia.tech@outlook.com', nombre: 'Ana Sofía Demo Ramírez', updated_at: '2026-09-20T12:00:00Z' });
    const lista = AdminData.candidatos(d);
    assert.equal(lista.filter(c => c.email.toLowerCase() === 'paideia.tech@outlook.com').length, 1);
    assert.equal(lista.find(c => c.email === 'paideia.tech@outlook.com').estado, 'administrador');
});

test('auto-registrado: un evaluador (sin acceso a precios) sigue viendo su lista igual', () => {
    const d = { precio: [], pagos: [], reparto: [], utilidadesPagos: [], nombres: [], errores: {},
        candidatosRows: [{ email: 'ana@ejemplo.com', nombre: 'Ana', updated_at: '2026-09-18T00:00:00Z', fases_pagadas: ['registro'] }] };
    const l = AdminData.candidatos(d);
    assert.equal(l.length, 1);
    assert.equal(l[0].estado, 'activo');   // no 'prospecto': el evaluador no ve precios por diseño
    assert.equal(l[0].lote, 1);
});

/* ---------- Ingresos: lo COBRADO, no el precio de lista (20 sep) ----------
   Las personas dejan el 50% del registro al registrarse. Hasta hoy todos los
   ingresos se calculaban con candidatos_precio.monto_<fase>, así que un
   anticipo se contaba como pago completo: $2,000 reportados de $1,000 que
   entraron, y el reparto entre socios sobre dinero que no estaba en la cuenta.
   Ahora manda candidatos_fase_pagos.monto, con el precio de lista de respaldo
   para las liberaciones a mano que no capturan monto. */

function conPago(pagos) {
    return {
        precio: [{ email: 'media@x.com', lote: 1, estado: 'activo', total_acordado: 14750,
                   monto_registro: 2000, monto_alineacion: 4250, monto_evaluacion: 6000, monto_entrega: 2500 }],
        pagos: pagos,
        reparto: [{ lote: 1, incluir_chris: false, porcentaje_fernando: 33.34, porcentaje_lot: 33.33, porcentaje_diego: 33.33 }],
        utilidadesPagos: [], gastos: [], nombres: [], candidatosRows: [], evaluaciones: [], sesiones: [], errores: {}
    };
}

test('ingresos: un anticipo cuenta por lo que entró, no por el precio de lista', () => {
    const d = conPago([{ email: 'media@x.com', fase: 'registro', monto: 1000, origen: 'manual' }]);
    assert.equal(AdminData.kpis(d).ingresosTotales, 1000);
    assert.equal(AdminData.utilidades(d, 1).ingresos, 1000);
    assert.equal(AdminData.porFaseLote(d, 1).fases.find(f => f.id === 'registro').ingresos, 1000);
    assert.equal(AdminData.cortePorCandidato(d, 1).filas[0].recibido.registro, 1000);
});

test('ingresos: el reparto entre socios sale del dinero que SÍ entró', () => {
    const conAnticipo = AdminData.utilidades(conPago([{ email: 'media@x.com', fase: 'registro', monto: 1000, origen: 'manual' }]), 1);
    const completo = AdminData.utilidades(conPago([{ email: 'media@x.com', fase: 'registro', monto: 2000, origen: 'manual' }]), 1);
    assert.equal(Math.round(conAnticipo.socios[0].aRepartir), 333);
    assert.equal(Math.round(completo.socios[0].aRepartir), 667);
});

test('ingresos: liberar a mano sin capturar monto sigue usando el precio de lista', () => {
    // toggleFase() de admin-precios.html inserta {email, fase, origen} sin monto:
    // ese caso no debe volverse $0 de la noche a la mañana.
    for (const monto of [null, undefined, '']) {
        const d = conPago([{ email: 'media@x.com', fase: 'registro', monto: monto, origen: 'manual' }]);
        assert.equal(AdminData.kpis(d).ingresosTotales, 2000, 'monto ' + JSON.stringify(monto));
    }
    const sinCampo = conPago([{ email: 'media@x.com', fase: 'registro', origen: 'manual' }]);
    assert.equal(AdminData.kpis(sinCampo).ingresosTotales, 2000);
});

test('ingresos: un monto 0 capturado a propósito (cortesía) cuenta como 0, no como el precio', () => {
    const d = conPago([{ email: 'media@x.com', fase: 'registro', monto: 0, origen: 'manual' }]);
    assert.equal(AdminData.kpis(d).ingresosTotales, 0);
});

test('ingresos: una fase sin pagar sigue sin sumar nada', () => {
    const d = conPago([]);
    assert.equal(AdminData.kpis(d).ingresosTotales, 0);
    assert.equal(AdminData.utilidades(d, 1).ingresos, 0);
});

test('ingresos: el precio de lista sigue siendo el proyectado (lo que falta por cobrar)', () => {
    const d = conPago([{ email: 'media@x.com', fase: 'registro', monto: 1000, origen: 'manual' }]);
    const k = AdminData.kpis(d);
    assert.equal(k.ingresosTotales, 1000);      // cobrado
    assert.equal(k.proyectado, 14750);          // lo acordado, no cambia
});

test('ingresos: la fase abierta por la liga (anticipo) cuenta $0, NUNCA el precio de lista', () => {
    // autorizar_registro_inicial() inserta sin monto: sabemos que dejaron un
    // anticipo pero no cuánto. Contarlo al precio de lista sería justo el error
    // que se acaba de corregir — dar por cobrada una fase pagada a medias.
    const d = conPago([{ email: 'media@x.com', fase: 'registro', monto: null, origen: AdminData.ORIGEN_ANTICIPO }]);
    assert.equal(AdminData.kpis(d).ingresosTotales, 0);
    assert.equal(AdminData.utilidades(d, 1).ingresos, 0);
    // ...pero la fase SÍ cuenta como pagada: de eso depende que vea su contenido
    assert.equal(AdminData.kpis(d).porFase.registro, 1);
    assert.equal(AdminData.candidatos(d)[0].fases.registro, true);
    assert.equal(AdminData.candidatos(d)[0].fasePagada, 'Registro');
});

test('ingresos: en cuanto el equipo captura el monto del anticipo, ya cuenta', () => {
    const d = conPago([{ email: 'media@x.com', fase: 'registro', monto: 1000, origen: AdminData.ORIGEN_ANTICIPO }]);
    assert.equal(AdminData.kpis(d).ingresosTotales, 1000);
});
