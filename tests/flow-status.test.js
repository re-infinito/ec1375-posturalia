// tests/flow-status.test.js — correr con: node --test tests/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const FlowStatus = require('../flow-status.js');

function answers142() { const a = {}; for (let i = 0; i < 142; i++) a['k' + i] = 'SI'; return a; }
const docs = (keys) => ({ documentosNextcloud: Object.fromEntries(keys.map(k => [k, 'p/' + k + '.pdf'])) });

test('fila vacía: Autodiagnóstico es current, el resto bloqueado, Entrega espera al evaluador', () => {
    const s = FlowStatus.computeSteps({ row: null });
    assert.equal(s[0].current, true);
    assert.equal(s.filter(x => x.locked).length, 9);
    assert.equal(s[9].reason, 'esperando_evaluador');
    assert.equal(s.filter(x => x.done).length, 0);
});

test('fila completa: 9 hechos, Entrega bloqueada sin current', () => {
    const row = {
        autodiagnostico_data: { answers: answers142(), ndaAccepted: true },
        ruta_estudio_data: { diagnostic: { approved: true }, practice: { completed: true } },
        plan_evaluacion_data: docs(['planEvaluacion', 'acusePlanEvaluacion']),
        documentos_sesion_data: docs(['ficha', 'consentimiento', 'plan_sesion', 'plan_seguimiento']),
        examen_conocimientos_data: { submitted: true },
        encuesta_data: docs(['encuesta']),
        evidencias_data: docs(['zoom', 'ine', 'curp', 'fotoDiploma'])
    };
    const s = FlowStatus.computeSteps({ row, alineacionAuth: true, entregaAuth: false });
    assert.equal(s.filter(x => x.done).length, 9);
    assert.equal(s.find(x => x.current), undefined);
    assert.equal(s[9].locked, true);
    const s2 = FlowStatus.computeSteps({ row, alineacionAuth: true, entregaAuth: true });
    assert.equal(s2[9].done, true);
});

test('localAuto manda sobre la fila para Autodiagnóstico; descargado cuenta como completo', () => {
    const row = { plan_evaluacion_data: { documentosNextcloud: {}, documentosDescargados: { planEvaluacion: true, acusePlanEvaluacion: true } } };
    const s = FlowStatus.computeSteps({ row, localAuto: { answers: answers142(), ndaAccepted: true }, alineacionAuth: true });
    assert.equal(s[0].done, true);
    assert.equal(s[1].current, true);           // reforzamiento
    assert.equal(s[3].done, true);              // plan-evaluacion por descargados
});

test('bypass: nada bloqueado y Entrega nunca done', () => {
    const s = FlowStatus.computeSteps({ row: null, entregaAuth: true, esBypass: true });
    assert.equal(s.filter(x => x.locked).length, 0);
    assert.equal(s[9].done, false);
    assert.equal(s[9].reason, 'esperando_evaluador');
});

test('renderNextStepCTA: sin contenedor (la página ya se volvió a pintar) no truena', () => {
    const steps = FlowStatus.computeSteps({ row: null });
    assert.doesNotThrow(() => FlowStatus.renderNextStepCTA(steps, 'autodiagnostico', null));
    assert.doesNotThrow(() => FlowStatus.renderNextStepCTA(steps, 'autodiagnostico', undefined));
});
