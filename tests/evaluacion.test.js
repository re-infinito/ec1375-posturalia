// tests/evaluacion.test.js — correr con: node --test tests/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../evaluacion.js');

const publicada = (juicio, extra) => Object.assign({
    evaluadora: 'Evaluadora Prueba', fecha: '2026-09-20', juicio, mejoresPracticas: 'a', areasOportunidad: 'b',
    criteriosNoCubiertos: '', recomendaciones: 'c', observaciones: '', borrador: false,
    publicada_at: '2026-09-20T18:00:00.000Z', firmaEvaluador: { mode: 'type', typedName: 'Evaluadora Prueba', nombre: 'Evaluadora Prueba' }
}, extra || {});

test('ETAPAS: las 9 del diseño, en orden', () => {
    assert.deepEqual(E.ETAPAS.map(e => e.clave), ['evidencias', 'revision', 'registro_sep', 'dictamen', 'pago_entrega', 'portafolio_sep', 'tramite', 'recibido', 'entregado']);
    assert.deepEqual(E.ETAPAS.filter(e => e.manual).map(e => e.clave), ['revision', 'registro_sep', 'portafolio_sep', 'tramite', 'recibido', 'entregado']);
});

test('lineaDeTiempo: con Evidencias hechas y sin evaluación, la actual es "En revisión"', () => {
    const t = E.lineaDeTiempo({ evaluacion: null, evidenciasHechas: true, entregaPagada: false });
    assert.equal(t.etapas[0].hecha, true);
    assert.equal(t.actual, 'revision');
    assert.equal(t.dictamen, null);
});

test('lineaDeTiempo: sin Evidencias, nada está hecho y la actual es Evidencias', () => {
    const t = E.lineaDeTiempo({ evaluacion: null, evidenciasHechas: false });
    assert.ok(t.etapas.every(e => !e.hecha));
    assert.equal(t.actual, 'evidencias');
});

test('lineaDeTiempo: el dictamen sale de la Cédula publicada, no del borrador', () => {
    const base = { etapas: { revision: { fecha: '2026-09-19T10:00:00Z', por: 'x' } } };
    let t = E.lineaDeTiempo({ evaluacion: Object.assign({}, base, { cedula: publicada('COMPETENTE', { borrador: true }) }), evidenciasHechas: true });
    assert.equal(t.dictamen, null);
    t = E.lineaDeTiempo({ evaluacion: Object.assign({}, base, { cedula: publicada('COMPETENTE') }), evidenciasHechas: true });
    assert.equal(t.dictamen, 'competente');
    const d = t.etapas.find(e => e.clave === 'dictamen');
    assert.equal(d.hecha, true);
    assert.equal(d.fecha, '2026-09-20T18:00:00.000Z');
    assert.equal(t.actual, 'registro_sep');
});

test('lineaDeTiempo: Entrega pagada marca su etapa; las manuales guardan fecha', () => {
    const ev = { etapas: { revision: { fecha: 'f1' }, registro_sep: { fecha: 'f2' }, portafolio_sep: { fecha: 'f3' } }, cedula: publicada('COMPETENTE') };
    const t = E.lineaDeTiempo({ evaluacion: ev, evidenciasHechas: true, entregaPagada: true });
    assert.equal(t.etapas.find(e => e.clave === 'pago_entrega').hecha, true);
    assert.equal(t.etapas.find(e => e.clave === 'registro_sep').fecha, 'f2');
    assert.equal(t.actual, 'tramite');
});

test('lineaDeTiempo: no competente bloquea las etapas posteriores al dictamen', () => {
    const t = E.lineaDeTiempo({ evaluacion: { etapas: {}, cedula: publicada('NO COMPETENTE') }, evidenciasHechas: true });
    assert.equal(t.dictamen, 'no_competente');
    const despues = t.etapas.slice(t.etapas.findIndex(e => e.clave === 'dictamen') + 1);
    assert.ok(despues.every(e => e.bloqueada && !e.hecha));
    assert.equal(t.actual, 'dictamen');
});

test('validarCedula: publicar exige evaluador(a), fecha, juicio válido, comentarios y firma', () => {
    assert.deepEqual(E.validarCedula(publicada('COMPETENTE')), []);
    const falta = E.validarCedula({ juicio: 'TAL VEZ' });
    assert.ok(falta.includes('Nombre del evaluador(a)'));
    assert.ok(falta.includes('Fecha'));
    assert.ok(falta.includes('Juicio (COMPETENTE / TODAVÍA NO COMPETENTE)'));
    assert.ok(falta.includes('Firma del evaluador(a)'));
    assert.ok(falta.includes('Al menos un comentario del resultado'));
    assert.deepEqual(E.validarCedula(publicada('NO COMPETENTE', { firmaEvaluador: { mode: 'draw', dataUrl: 'javascript:alert(1)' } })), ['Firma del evaluador(a)']);
});

test('publicarCedula: archiva la anterior publicada, borra la firma del candidato y fecha la nueva', () => {
    const antes = { cedula: publicada('NO COMPETENTE'), cedulas_anteriores: [], firma_candidato: { mode: 'type', typedName: 'Ana' } };
    const r = E.publicarCedula(antes, publicada('COMPETENTE', { publicada_at: undefined }), { por: 'eval@x.mx', ahora: '2026-10-01T00:00:00.000Z' });
    assert.equal(r.cedula.juicio, 'COMPETENTE');
    assert.equal(r.cedula.borrador, false);
    assert.equal(r.cedula.publicada_at, '2026-10-01T00:00:00.000Z');
    assert.equal(r.cedula.por, 'eval@x.mx');
    assert.equal(r.cedulas_anteriores.length, 1);
    assert.equal(r.cedulas_anteriores[0].juicio, 'NO COMPETENTE');
    assert.equal(r.cedulas_anteriores[0].firma_candidato.typedName, 'Ana');
    assert.equal(r.firma_candidato, null);
});

test('publicarCedula: un borrador anterior no se archiva; guardar borrador no toca la firma', () => {
    const antes = { cedula: publicada('COMPETENTE', { borrador: true }), cedulas_anteriores: [], firma_candidato: null };
    const r = E.publicarCedula(antes, publicada('COMPETENTE'), { por: 'x', ahora: 't' });
    assert.equal(r.cedulas_anteriores.length, 0);
    const b = E.guardarBorrador({ cedula: publicada('COMPETENTE'), firma_candidato: { mode: 'type' } }, { evaluadora: 'X' }, { por: 'x' });
    assert.equal(b.cedula.borrador, true);
    assert.equal(b.firma_candidato.mode, 'type');
});

const RUTA = (c, n) => 'Portafolios/Ana_Demo_CURP/' + c + '/' + n;
const fila = () => ({
    nombre: 'Ana Demo',
    autodiagnostico_data: { documentosNextcloud: { fichaRegistro: RUTA('01-Registro', 'Ficha.pdf'), autodiagnostico: RUTA('01-Registro', 'Auto.pdf'), acuseTriptico: RUTA('01-Registro', 'AcuseT.pdf') } },
    plan_evaluacion_data: { documentosNextcloud: { planEvaluacion: RUTA('02-Alineacion', 'Plan.pdf'), acusePlanEvaluacion: RUTA('02-Alineacion', 'AcuseP.pdf') } },
    documentos_sesion_data: { documentosNextcloud: { ficha: RUTA('03-Evaluacion', 'F.pdf'), consentimiento: RUTA('03-Evaluacion', 'C.pdf'), plan_sesion: RUTA('03-Evaluacion', 'PS.pdf'), plan_seguimiento: RUTA('03-Evaluacion', 'PSe.pdf') } },
    encuesta_data: { documentosNextcloud: { encuesta: RUTA('03-Evaluacion', 'E.pdf') } },
    evidencias_data: { planData: { videoLink: 'https://youtu.be/x' }, documentosNextcloud: { curp: [RUTA('04-Entrega', 'curp.pdf')], ine: [RUTA('04-Entrega', 'ine1.jpg'), RUTA('04-Entrega', 'ine2.jpg')], fotoDiploma: [RUTA('04-Entrega', 'foto.jpg')], certificados: [RUTA('04-Entrega', 'cert.pdf')] } }
});

test('planPortafolio: el orden del formato oficial 2026, sin avisos si todo está', () => {
    const p = E.planPortafolio(fila());
    const id = p.items.map(i => i.tipo === 'nas' ? i.ruta.split('/').pop()
        : i.tipo === 'plantilla' ? 'IEC' : i.pagina === 'marca' ? '[' + i.texto + ']' : i.pagina);
    assert.deepEqual(id, ['portada', 'indice', 'sep1',
        '[FICHA REGISTRO SNC]', 'Ficha.pdf', '[CURP]', 'curp.pdf', '[INE]', 'ine1.jpg', 'ine2.jpg', 'Auto.pdf', 'triptico',
        'sep2', 'Plan.pdf', '[IEC]', 'IEC', '[PRODUCTOS]', 'F.pdf', 'C.pdf', 'PS.pdf', 'PSe.pdf', 'video',
        'sep3', 'cedula', 'E.pdf', 'cedula_servicio', 'verificacion', 'atencion_usuarios',
        'sep4', 'autorizacion_firma', 'AcuseT.pdf', 'AcuseP.pdf', '[FOTO Y CERTIFICADOS]', 'foto.jpg', 'cert.pdf', 'contraportada']);
    assert.deepEqual(p.avisos, []);
    assert.equal(p.videoLink, 'https://youtu.be/x');
    assert.equal(p.nombre, 'Ana Demo');
});

test('planPortafolio: las páginas marcadoras van pegadas al documento que anuncian', () => {
    const p = E.planPortafolio(fila());
    const id = p.items.map(i => i.pagina === 'marca' ? '[' + i.texto + ']' : (i.slot || i.pagina || i.tipo));
    [['[FICHA REGISTRO SNC]', 'ficha_registro_candidato'], ['[CURP]', 'curp'], ['[INE]', 'ine'], ['[IEC]', 'iec']]
        .forEach(([marca, slot]) => assert.equal(id[id.indexOf(marca) + 1], slot, marca));
    assert.equal(id[id.indexOf('[PRODUCTOS]') + 1], 'ficha_registro_paciente');
});

test('planPortafolio: distingue "no lo subió" del formulario alterno y avisa sin video', () => {
    const f = fila();
    f.evidencias_data = { planData: {}, documentosNextcloud: { curp: 'MANUAL_FORM_FALLBACK' } };
    delete f.encuesta_data;
    const p = E.planPortafolio(f);
    assert.ok(p.avisos.some(a => /Comprobante CURP/.test(a) && /formulario alterno/.test(a)));
    assert.ok(p.avisos.some(a => /Identificación oficial/.test(a) && /todavía no lo ha subido/.test(a)));
    assert.ok(p.avisos.some(a => /Encuesta de Satisfacción/.test(a)));
    assert.ok(p.avisos.some(a => /grabación de Zoom/.test(a)));
    assert.ok(!p.items.some(i => i.tipo === 'nas' && /MANUAL/.test(i.ruta)));
});

test('planPortafolio: los certificados son opcionales; la foto del diploma no', () => {
    const f = fila();
    delete f.evidencias_data.documentosNextcloud.certificados;
    const p = E.planPortafolio(f);
    assert.deepEqual(p.avisos, [], 'sin certificados no se avisa nada: en Evidencias son opcionales');
    assert.ok(p.items.some(i => i.slot === 'foto_diploma'));
    const g = fila();
    delete g.evidencias_data.documentosNextcloud.fotoDiploma;
    delete g.evidencias_data.documentosNextcloud.certificados;
    const q = E.planPortafolio(g);
    assert.ok(q.avisos.some(a => /Foto para el diploma/.test(a)), 'la foto sí es obligatoria');
    assert.ok(!q.items.some(i => i.pagina === 'marca' && i.texto === 'FOTO Y CERTIFICADOS'), 'sin nada que anexar no va la marcadora');
});

test('rutaNasPermitida: solo Portafolios/ o Plantillas/, sin salir de la carpeta', () => {
    assert.equal(E.rutaNasPermitida('Portafolios/Ana_X/01-Registro/a.pdf'), true);
    assert.equal(E.rutaNasPermitida('Plantillas/plantilla_IEC_blanco.pdf'), true);
    for (const mala of ['', 'Contenido/x.json', '/Portafolios/a.pdf', 'Portafolios/../x', 'Portafolios/a/../../b', 'Portafolios\\a', 'Portafolios//a', null])
        assert.equal(E.rutaNasPermitida(mala), false, String(mala));
});

test('mensajeWhatsApp: arma el aviso con el nombre y el enlace al panel', () => {
    const m = E.mensajeWhatsApp('dictamen', { nombre: 'Ana', dictamen: 'competente' });
    assert.ok(/Ana/.test(m) && /panel/.test(m) && /COMPETENTE/.test(m));
    assert.ok(/nueva evidencia/i.test(E.mensajeWhatsApp('dictamen', { nombre: 'Ana', dictamen: 'no_competente' })));
    assert.equal(E.telefonoWhatsApp('81 1234-5678'), '528112345678');
    assert.equal(E.telefonoWhatsApp('+52 1 81 1234 5678'), '5218112345678');
    assert.equal(E.telefonoWhatsApp(''), null);
});

test('ligaVideo: la grabación de Zoom que ligó el equipo gana sobre la liga del candidato', () => {
    const ev = { video: { partes: [{ zoom: { share_url: 'https://zoom.us/rec/share/abc', clave: 'x1' } }] } };
    assert.equal(E.ligaVideo(ev, fila()), 'https://zoom.us/rec/share/abc (clave: x1)');
    const p = E.planPortafolio(fila(), ev);
    assert.equal(p.videoLink, 'https://zoom.us/rec/share/abc (clave: x1)');
});

test('ligaVideo: varias partes se enumeran; sin grabación usa la liga de Evidencias', () => {
    const ev = { video: { partes: [{ zoom: { share_url: 'https://zoom.us/rec/share/a' } }, { zoom: { share_url: 'https://zoom.us/rec/share/b' } }] } };
    assert.equal(E.ligaVideo(ev, null), 'Parte 1: https://zoom.us/rec/share/a  ·  Parte 2: https://zoom.us/rec/share/b');
    assert.equal(E.ligaVideo(null, fila()), 'https://youtu.be/x');
    assert.equal(E.ligaVideo({ video: { partes: [] } }, { evidencias_data: {} }), null);
});

test('Centro de Evaluación y evaluador del expediente (confirmados por Diego el 19 sep)', () => {
    assert.equal(E.CENTRO_EVALUACION.clave, 'CE1399-OC063-18');
    assert.equal(E.CENTRO_EVALUACION.nombre, 'COLEGIO ILUSTRE DE CIENCIAS FORENSES DE MÉXICO AC CE1399-OC063-18');
    assert.equal(E.EVALUADOR_PREDETERMINADO, 'HUMBERTO LOT NAVARRO NAVARRO');
});

test('fechaLarga: como la "Fecha de Aplicación" del IEC de referencia ("agosto 23 2025")', () => {
    assert.equal(E.fechaLarga('2025-08-23'), 'agosto 23 2025');
    assert.equal(E.fechaLarga('2026-09-07'), 'septiembre 7 2026');
    assert.equal(E.fechaLarga('17/09/2026'), '');
    assert.equal(E.fechaLarga(null), '');
});

test('planPortafolio: cada archivo lleva su slot (para saber qué sellar)', () => {
    const p = E.planPortafolio(fila());
    const slots = p.items.filter(i => i.tipo !== 'generado').map(i => i.slot);
    assert.ok(slots.includes('pdf_plan_evaluacion') && slots.includes('acuse_triptico') && slots.includes('acuse_plan_evaluacion') && slots.includes('iec'));
});

const firmaDibujada = { mode: 'draw', dataUrl: 'data:image/png;base64,AAAA', fecha: '2026-09-19T10:00:00Z' };
test('sellosPortafolio: evaluador de la Cédula, Centro, fecha del Plan y firmas por documento', () => {
    const f = fila();
    f.plan_evaluacion_data.planData = { fechaEvaluacion: '2026-09-17' };
    const ev = { cedula: publicada('COMPETENTE', { evaluadora: 'Humberto Lot Navarro Navarro' }), firma_candidato: firmaDibujada,
        firmas_evaluador: { plan: firmaDibujada, iec: { mode: 'type', typedName: 'H. Lot' } } };
    const s = E.sellosPortafolio(f, ev, { lote: 2 });
    assert.equal(s.evaluador, 'Humberto Lot Navarro Navarro');
    assert.equal(s.evaluadorMayus, 'HUMBERTO LOT NAVARRO NAVARRO');
    assert.equal(s.candidatoMayus, 'ANA DEMO');
    assert.equal(s.ceClave, 'CE1399-OC063-18');
    assert.equal(s.ceNombre, E.CENTRO_EVALUACION.nombre);
    assert.equal(s.fechaAplicacion, 'septiembre 17 2026');
    assert.equal(s.firmaPlan, firmaDibujada);
    assert.equal(s.firmaIec.typedName, 'H. Lot');
    assert.equal(s.firmaCandidato, firmaDibujada);
    assert.equal(s.fechaPortada, '2026-09-17');
    assert.equal(s.lote, '2');
    assert.ok(s.avisos.some(a => /\(IEC\) va en blanco/.test(a)));
    assert.ok(s.avisos.some(a => /hojas de opinión del candidato van en blanco/.test(a)));
    assert.ok(s.avisos.some(a => /Verificación Interna va en blanco/.test(a)));
    assert.ok(s.avisos.some(a => /firma del evaluador en la Verificación Interna/.test(a)));
    // con el IEC, las dos hojas del candidato, la Verificación y las firmas no queda aviso
    f.encuesta_data.cierreCandidato = { servicio: { medio: 'Promoción directa' }, atencion: {} };
    const completo = Object.assign({}, ev, {
        iec: { respuestas: { 1: 'si' }, completo: true },
        cierre: { verificacion: { items: {} }, completo: true },
        firmas_evaluador: Object.assign({}, ev.firmas_evaluador, { cierre: firmaDibujada })
    });
    const conTodo = E.sellosPortafolio(f, completo, { lote: 2 });
    assert.deepEqual(conTodo.avisos, []);
    assert.equal(conTodo.iec.completo, true);
    assert.equal(conTodo.firmaCierre, firmaDibujada);
    // lo que va a medias se avisa aparte
    const medio = E.sellosPortafolio(f, Object.assign({}, ev, { iec: { respuestas: { 1: 'si' }, completo: false }, cierre: { verificacion: { items: {} }, completo: false } }), { lote: 2 });
    assert.ok(medio.avisos.some(a => /IEC está incompleto/.test(a)));
    assert.ok(medio.avisos.some(a => /Verificación Interna está incompleta/.test(a)));
});

test('sellosPortafolio: sin Cédula usa el evaluador predeterminado y avisa lo que falta firmar', () => {
    const s = E.sellosPortafolio(fila(), { firmas_evaluador: { plan: { mode: 'draw', dataUrl: 'javascript:x' } } });
    assert.equal(s.evaluador, E.EVALUADOR_PREDETERMINADO);
    assert.equal(s.firmaPlan, null);
    assert.equal(s.firmaCandidato, null);
    assert.ok(s.avisos.some(a => /firma del evaluador en el Plan/.test(a)));
    assert.ok(s.avisos.some(a => /rúbrica del evaluador en el IEC/.test(a)));
    assert.ok(s.avisos.some(a => /Fecha de Aplicación/.test(a)));
    assert.ok(s.avisos.some(a => /sin lote/.test(a)));
    assert.equal(s.lote, '');
    assert.equal(s.iec, null);
});

test('CAMPOS_CEDULA: el formato 2026 agrega Incidencias, antes de Recomendaciones', () => {
    assert.deepEqual(E.CAMPOS_CEDULA.map(c => c.id),
        ['mejoresPracticas', 'areasOportunidad', 'criteriosNoCubiertos', 'incidencias', 'recomendaciones']);
});

test('una Cédula publicada con el texto viejo sigue contando como publicada', () => {
    // Antes del 23 sep el juicio se guardaba como 'NO COMPETENTE'; el instrumento
    // imprime 'TODAVÍA NO COMPETENTE' y es lo que se escribe desde entonces.
    assert.ok(E.cedulaPublicada({ cedula: publicada('NO COMPETENTE') }));
    assert.ok(E.cedulaPublicada({ cedula: publicada('TODAVÍA NO COMPETENTE') }));
    assert.deepEqual(E.validarCedula(publicada('NO COMPETENTE')), []);
    assert.equal(E.JUICIOS.indexOf('NO COMPETENTE'), -1);   // ya no se ofrece
});

test('videoEsExterno: solo la liga pegada por el candidato, sin grabación de la sala, cuenta como externa (24 sep)', () => {
    const conLiga = { evidencias_data: { planData: { videoLink: 'https://youtu.be/x' } } };
    const sala = { video: { partes: [{ zoom: { share_url: 'https://zoom.us/rec/share/abc' } }] } };
    assert.equal(E.videoEsExterno(null, conLiga), true);
    assert.equal(E.videoEsExterno(sala, conLiga), false, 'la sala manda aunque haya liga');
    assert.equal(E.videoEsExterno(sala, {}), false);
    assert.equal(E.videoEsExterno(null, {}), false, 'sin video no es "externo": ya lo avisa planPortafolio');
    assert.equal(E.planPortafolio(conLiga, null).videoExterno, true);
    assert.ok(!E.planPortafolio(conLiga, null).avisos.some(a => /externa|sala de Paideia/.test(a)), 'no entra a los avisos: esos se imprimen en el Índice');
});
