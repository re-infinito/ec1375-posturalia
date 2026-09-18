// tests/formatos-consultorio.test.js — correr con: node --test tests/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../formatos-consultorio.js');

const R = { responsable: 'Ana Prueba López', domicilio: 'Calle 5 #20, San Pedro, N.L.', contacto: '81 1234 5678 · ana@correo.com' };
const texto = bloques => JSON.stringify(bloques);

test('avisoPrivacidadBloques: usa los datos del responsable y marca los faltantes', () => {
    const b = F.avisoPrivacidadBloques(R);
    assert.equal(b[0].t, 'titulo');
    assert.ok(texto(b).includes('Ana Prueba López, con domicilio en Calle 5 #20, San Pedro, N.L.'));
    assert.ok(texto(b).includes('81 1234 5678 · ana@correo.com'));
    const vacio = F.avisoPrivacidadBloques({});
    assert.ok(texto(vacio).includes(F.FALTANTE + ', con domicilio en ' + F.FALTANTE));
});

test('FORMATOS: los 4 del toolkit, en orden, con título y descripción', () => {
    assert.deepEqual(F.FORMATOS.map(f => f.id), ['aviso', 'consentimiento', 'plan-sesion', 'plan-seguimiento']);
    assert.ok(F.FORMATOS.every(f => f.titulo && f.desc));
});

test('bloques: cada formato abre con su título, trae al responsable y cierra con el pie', () => {
    for (const f of F.FORMATOS) {
        const b = F.bloques(f.id, R);
        assert.equal(b[0].t, 'titulo', f.id);
        assert.ok(texto(b).includes('Ana Prueba López'), f.id + ' sin responsable');
        assert.equal(b[b.length - 1].t, 'pie', f.id);
        assert.ok(b.some(x => x.t === 'firmas'), f.id + ' sin firmas');
    }
});

test('bloques: el Consentimiento contiene el Aviso de Privacidad (lo exige el EC1375) y el texto de consentimiento', () => {
    const b = F.bloques('consentimiento', R);
    assert.ok(b.some(x => x.t === 'h' && /Aviso de Privacidad/.test(x.x)));
    assert.ok(texto(b).includes('derechos ARCO'));
    assert.ok(b.some(x => x.t === 'p' && /expreso mi libre voluntad/.test(x.x)));
    const campos = b.find(x => x.t === 'campos');
    assert.ok(campos.filas.includes('Nombre del usuario') && campos.filas.includes('Familiar o responsable a avisar'));
});

test('bloques: Plan de Sesión trae signos vitales y Plan de Seguimiento su tabla de sesiones en blanco', () => {
    const ps = F.bloques('plan-sesion', R);
    const signos = ps.find(x => x.t === 'tabla');
    assert.deepEqual(signos.filas.map(f => f[0]), ['Presión arterial', 'Pulso', 'Temperatura', 'Oxigenación (SpO2)', 'Frecuencia respiratoria']);
    const seg = F.bloques('plan-seguimiento', R);
    const tabla = seg.find(x => x.t === 'tabla');
    assert.deepEqual(tabla.cols, ['Sesión No.', 'Fecha', 'Hora', 'Frecuencia', 'Duración']);
    assert.ok(tabla.filas.length >= 5 && tabla.filas.every(f => f.slice(1).every(c => c === '')));
});

test('bloques: formato desconocido lanza error', () => {
    assert.throws(() => F.bloques('no-existe', R), /Formato desconocido/);
});

test('nombreArchivo: sin acentos ni espacios, con la extensión pedida', () => {
    assert.equal(F.nombreArchivo('aviso', R, 'pdf'), 'Aviso_de_Privacidad_Ana_Prueba_Lopez.pdf');
    assert.equal(F.nombreArchivo('plan-seguimiento', {}, 'docx'), 'Plan_de_Seguimiento.docx');
});
