// tests/crm-shell.test.js — correr con: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const CrmShell = require('../crm-shell.js');
const H = CrmShell._helpers;

test('estadoDocumento distingue subido / descargado / formulario / pendiente', () => {
    assert.equal(H.estadoDocumento(null, 'x'), 'pendiente');
    assert.equal(H.estadoDocumento({ documentosNextcloud: { x: 'Portafolios/a/b.pdf' } }, 'x'), 'subido');
    assert.equal(H.estadoDocumento({ documentosNextcloud: { x: ['Portafolios/a/b.pdf'] } }, 'x'), 'subido');
    assert.equal(H.estadoDocumento({ documentosNextcloud: { x: [] } }, 'x'), 'pendiente');
    assert.equal(H.estadoDocumento({ documentosNextcloud: { x: ['MANUAL_FORM_FALLBACK'] } }, 'x'), 'formulario');
    assert.equal(H.estadoDocumento({ documentosNextcloud: {}, documentosDescargados: { x: true } }, 'x'), 'descargado');
});

test('contarDocumentos cuenta subidos y descargados sobre las 15 claves oficiales', () => {
    const row = {
        autodiagnostico_data: { documentosNextcloud: { autodiagnostico: 'a', fichaRegistro: 'b', acuseTriptico: 'c', acuseNda: 'd' } },
        plan_evaluacion_data: { documentosNextcloud: { planEvaluacion: 'e' }, documentosDescargados: { acusePlanEvaluacion: true } },
        documentos_sesion_data: null,
        encuesta_data: { documentosNextcloud: { encuesta: ['MANUAL_FORM_FALLBACK'] } },
        evidencias_data: { documentosNextcloud: { zoom: ['z1', 'z2'], ine: 'i' } }
    };
    assert.deepEqual(H.contarDocumentos(row), { completos: 9, total: 15 }); // 4 registro + 2 plan + 0 sesión + 1 encuesta + 2 evidencias
    assert.deepEqual(H.contarDocumentos(null), { completos: 0, total: 15 });
});

test('pendientesDelPaso cuenta las claves no completas del grupo de ese paso', () => {
    const row = { evidencias_data: { documentosNextcloud: { zoom: ['z'], ine: 'i' } } };
    assert.equal(H.pendientesDelPaso(row, 'evidencias'), 2);
    assert.equal(H.pendientesDelPaso(row, 'autodiagnostico'), 4);
    assert.equal(H.pendientesDelPaso(row, 'examen'), 0);   // paso sin documentos
    assert.equal(H.pendientesDelPaso(null, 'encuesta'), 1);
});

test('faseMasAlta regresa la fase pagada más avanzada', () => {
    assert.equal(H.faseMasAlta({ registro: true, alineacion: true, evaluacion: false, entrega: false }), 'Alineación');
    assert.equal(H.faseMasAlta({ registro: true, alineacion: false, evaluacion: true, entrega: false }), 'Evaluación');
    assert.equal(H.faseMasAlta({ registro: false, alineacion: false, evaluacion: false, entrega: false }), 'Sin pago');
    assert.equal(H.faseMasAlta({ registro: true, alineacion: true, evaluacion: true, entrega: true }), 'Entrega');
});

test('tiempoRelativo en español', () => {
    const now = new Date('2026-09-15T12:00:00Z');
    assert.equal(H.tiempoRelativo('2026-09-15T11:59:40Z', now), 'hace un momento');
    assert.equal(H.tiempoRelativo('2026-09-15T11:35:00Z', now), 'hace 25 min');
    assert.equal(H.tiempoRelativo('2026-09-15T09:00:00Z', now), 'hace 3 h');
    assert.equal(H.tiempoRelativo('2026-09-13T12:00:00Z', now), 'hace 2 días');
    assert.equal(H.tiempoRelativo(null, now), 'sin sincronizar');
    assert.equal(H.tiempoRelativo('no es fecha', now), 'sin sincronizar');
});

test('iniciales usa nombre y cae al correo', () => {
    assert.equal(H.iniciales('José Fernando Villarreal', 'x@y.com'), 'JF');
    assert.equal(H.iniciales('Ana', 'x@y.com'), 'A');
    assert.equal(H.iniciales('', 'diego@paideia.com'), 'D');
    assert.equal(H.iniciales(null, null), '?');
});

test('proximaInscripcion elige la confirmada más cercana en el futuro', () => {
    const now = new Date('2026-09-15T12:00:00-06:00');
    const lista = [
        { estado: 'confirmada', sesion: { fecha: '2026-09-10', hora_inicio: '10:00', zoom_link: 'a' } },
        { estado: 'confirmada', sesion: { fecha: '2026-09-20', hora_inicio: '18:00', zoom_link: 'b' } },
        { estado: 'confirmada', sesion: { fecha: '2026-09-17', hora_inicio: '18:00', zoom_link: 'c' } },
        { estado: 'cancelada', sesion: { fecha: '2026-09-16', hora_inicio: '18:00', zoom_link: 'd' } },
        { estado: 'confirmada', sesion: null }
    ];
    assert.equal(H.proximaInscripcion(lista, now).sesion.zoom_link, 'c');
    assert.equal(H.proximaInscripcion([], now), null);
    assert.equal(H.proximaInscripcion(null, now), null);
});

test('formatoSesion produce fecha larga en español y rango de horas', () => {
    const txt = H.formatoSesion({ fecha: '2026-09-17', hora_inicio: '18:00:00', hora_fin: '19:00:00' });
    assert.match(txt, /jueves/i);
    assert.match(txt, /17/);
    assert.match(txt, /18:00/);
    assert.match(txt, /19:00/);
});

test('itemsAtencion deriva pendientes en orden: documentos (de pasos abiertos), pago, sesión', () => {
    const steps = [
        { id: 'autodiagnostico', label: 'Autodiagnóstico', href: 'autodiagnostico.html', done: true },
        { id: 'reforzamiento', label: 'Reforzamiento', href: 'reforzamiento.html', done: true },
        { id: 'alineacion', label: 'Alineación', href: 'alineacion.html', done: false, current: true },
        { id: 'plan-evaluacion', label: 'Plan de Evaluación', href: 'plan-evaluacion.html', done: false, locked: true }
    ];
    const row = { autodiagnostico_data: { documentosNextcloud: { autodiagnostico: 'a', fichaRegistro: 'b', acuseTriptico: 'c' } } };
    const fases = { registro: true, alineacion: false, evaluacion: false, entrega: false };
    const items = H.itemsAtencion({ steps, row, fases, inscripcion: null, inscripcionesOk: true });
    assert.equal(items.length, 2);
    assert.match(items[0].texto, /Acuerdo de Confidencialidad/);
    assert.equal(items[0].href, 'autodiagnostico.html');
    assert.match(items[1].texto, /Alineación/);
    assert.equal(items[1].href, 'alineacion.html');

    const fases2 = { registro: true, alineacion: true, evaluacion: false, entrega: false };
    const items2 = H.itemsAtencion({ steps, row, fases: fases2, inscripcion: null, inscripcionesOk: true });
    assert.match(items2[items2.length - 1].texto, /sesión/i);

    const items3 = H.itemsAtencion({ steps: [], row: null, fases: fases2, inscripcion: { sesion: {} }, inscripcionesOk: true });
    assert.equal(items3.length, 0);
});

test('escapeHtml neutraliza etiquetas', () => {
    assert.equal(H.escapeHtml('<b>&"'), '&lt;b&gt;&amp;&quot;');
    assert.equal(H.escapeHtml(null), '');
});

test('tutorialDePagina: cada paso del flujo tiene su tutorial y los ids son únicos', () => {
    const pasos = ['panel', 'autodiagnostico', 'reforzamiento', 'alineacion', 'biblioteca', 'plan-evaluacion',
        'documentos-sesion', 'practica', 'examen', 'encuesta', 'evidencias', 'entrega'];
    for (const p of pasos) assert.ok(H.tutorialDePagina(p), 'sin tutorial: ' + p);
    assert.equal(H.tutorialDePagina('recursos'), null);
    assert.equal(H.tutorialDePagina('admin-panel'), null);
    const ids = CrmShell.TUTORIALES.map(t => t.id);
    assert.equal(new Set(ids).size, ids.length);
    assert.ok(CrmShell.TUTORIALES.every(t => t.titulo && t.desc && /^[a-z-]+$/.test(t.id)));
});

test('duracionTexto: minutos y segundos con dos dígitos', () => {
    assert.equal(H.duracionTexto(51), '0:51');
    assert.equal(H.duracionTexto(88), '1:28');
    assert.equal(H.duracionTexto(60), '1:00');
    assert.equal(H.duracionTexto(undefined), '0:00');
});
