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
