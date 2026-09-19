// tests/zoom-nextcloud.test.js — correr con: node --test tests/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const Nc = require('../lib/nextcloud.js');
const Z = require('../lib/zoom.js');

test('nextcloud: helpers movidos sin cambiar comportamiento', () => {
    assert.equal(Nc.normalizarNextcloudUrl('https://x.net/index.php/login/'), 'https://x.net');
    assert.equal(Nc.carpetaCandidato('José Ñúñez', 'ABCD900101HNLXXX09'), 'Jose_Nunez_ABCD900101HNLXXX09');
    assert.equal(Nc.carpetaCandidato('', ''), 'candidato_sin_identificar');
});

test('nextcloud: nombre de trozo ordenable y URL de archivo codificada', () => {
    assert.equal(Nc.nombreTrozo(1), '00001');
    assert.equal(Nc.nombreTrozo(123), '00123');
    const cx = { dav: 'https://nas/remote.php/dav', user: 'svc paideia', headers: {} };
    assert.equal(Nc.urlArchivo(cx, 'Portafolios/A B/03-Evaluacion/g.mp4'), 'https://nas/remote.php/dav/files/svc%20paideia/Portafolios/A%20B/03-Evaluacion/g.mp4');
    assert.equal(Nc.urlSubida(cx, 'sala-abc12345'), 'https://nas/remote.php/dav/uploads/svc%20paideia/sala-abc12345');
});

test('nextcloud: leerTamano del PROPFIND', () => {
    assert.equal(Nc.leerTamano('<d:multistatus><d:response><d:propstat><d:prop><d:getcontentlength>734003200</d:getcontentlength></d:prop></d:propstat></d:response></d:multistatus>'), 734003200);
    assert.equal(Nc.leerTamano('<x/>'), null);
});

test('zoom: uuid en la ruta (doble codificación si empieza con / o trae //)', () => {
    assert.equal(Z.uuidEnRuta('abc=='), 'abc%3D%3D');
    assert.equal(Z.uuidEnRuta('/abc=='), '%252Fabc%253D%253D');
    assert.equal(Z.uuidEnRuta('ab//c'), 'ab%252F%252Fc');
});

test('zoom: filtrarGrabaciones por ID de la sala y ventana; solo MP4 listos', () => {
    const meetings = [
        { id: 82757263451, uuid: 'u1', start_time: '2026-09-25T16:02:00Z', duration: 88, share_url: 'https://zoom.us/rec/share/a', recording_play_passcode: 'p1',
          recording_files: [
            { id: 'f1', file_type: 'MP4', file_size: 500, recording_type: 'shared_screen_with_speaker_view', status: 'completed' },
            { id: 'f2', file_type: 'M4A', file_size: 50, recording_type: 'audio_only', status: 'completed' }] },
        { id: 99999999999, uuid: 'otra', start_time: '2026-09-25T16:05:00Z', recording_files: [{ id: 'z', file_type: 'MP4', file_size: 5 }] },
        { id: 82757263451, uuid: 'u2', start_time: '2026-09-27T16:00:00Z', recording_files: [{ id: 'f3', file_type: 'MP4', file_size: 7 }] },
        { id: 82757263451, uuid: 'u3', start_time: '2026-09-25T16:50:00Z', recording_files: [{ id: 'f4', file_type: 'MP4', file_size: 9, status: 'processing' }] }
    ];
    const r = Z.filtrarGrabaciones(meetings, '827 5726 3451', Date.parse('2026-09-25T15:45:00Z'), Date.parse('2026-09-25T18:30:00Z'));
    assert.equal(r.length, 1);
    assert.equal(r[0].uuid, 'u1');
    assert.equal(r[0].clave, 'p1');
    assert.deepEqual(r[0].archivos.map(a => a.id), ['f1']);
});

test('zoom: validarTrozo', () => {
    const ok = { uuid: 'u1', fileId: 'f1', uploadId: 'sala-abc12345', n: 1, desde: 0, hasta: 32 * 1024 * 1024 - 1 };
    assert.equal(Z.validarTrozo(ok), null);
    assert.match(Z.validarTrozo(Object.assign({}, ok, { n: 0 })), /trozo/);
    assert.match(Z.validarTrozo(Object.assign({}, ok, { hasta: 32 * 1024 * 1024 })), /32 MB/);
    assert.match(Z.validarTrozo(Object.assign({}, ok, { uploadId: '../x' })), /subida/);
    assert.match(Z.validarTrozo(Object.assign({}, ok, { desde: 10, hasta: 5 })), /[Rr]ango/);
});
