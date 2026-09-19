/* lib/zoom.js — API de Zoom (app Server-to-Server OAuth) para la sala de
   evidencias (18 sep). Solo lee grabaciones y las manda a la papelera.
   Variables: ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET.
   Guía: docs/guias/2026-09-18-zoom-sala-evidencias.md */
const GZ = require('../grabacion-zoom.js');
const API = 'https://api.zoom.us/v2';
let cache = null;

function error(msg, status) { return Object.assign(new Error(msg), { status: status || 502 }); }
function soloDigitos(s) { return String(s === undefined || s === null ? '' : s).replace(/\D/g, ''); }
function uuidEnRuta(uuid) {
    const u = String(uuid);
    return (u.charAt(0) === '/' || u.indexOf('//') >= 0) ? encodeURIComponent(encodeURIComponent(u)) : encodeURIComponent(u);
}

async function token() {
    const id = process.env.ZOOM_ACCOUNT_ID, cid = process.env.ZOOM_CLIENT_ID, sec = process.env.ZOOM_CLIENT_SECRET;
    if (!id || !cid || !sec) throw error('Zoom no está configurado (faltan ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID o ZOOM_CLIENT_SECRET en Vercel)', 500);
    if (cache && cache.vence > Date.now() + 60000) return cache.token;
    const r = await fetch('https://zoom.us/oauth/token?grant_type=account_credentials&account_id=' + encodeURIComponent(id), {
        method: 'POST', headers: { Authorization: 'Basic ' + Buffer.from(cid + ':' + sec).toString('base64') }, signal: AbortSignal.timeout(20000)
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.access_token) throw error('Zoom rechazó las credenciales (' + r.status + ')');
    cache = { token: j.access_token, vence: Date.now() + (Number(j.expires_in) || 3600) * 1000 };
    return cache.token;
}
async function get(ruta) {
    const r = await fetch(API + ruta, { headers: { Authorization: 'Bearer ' + await token() }, signal: AbortSignal.timeout(20000) });
    if (r.status === 404) throw error('Zoom no encontró ' + ruta.split('?')[0], 404);
    if (!r.ok) throw error('Zoom respondió ' + r.status + ' en ' + ruta.split('?')[0]);
    return r.json();
}

/* Solo la sala (por ID), dentro de [desdeMs, hastaMs], y de cada
   grabación solo los MP4 ya procesados. */
function filtrarGrabaciones(meetings, zoomId, desdeMs, hastaMs) {
    const id = soloDigitos(zoomId);
    return (meetings || []).filter(m => soloDigitos(m.id) === id).map(m => ({
        uuid: m.uuid, inicio: m.start_time, duracion: Number(m.duration) || 0,
        share_url: m.share_url || null, clave: m.recording_play_passcode || m.password || '',
        archivos: (m.recording_files || [])
            .filter(f => f.file_type === 'MP4' && f.status !== 'processing' && Number(f.file_size) > 0)
            .map(f => ({ id: f.id, bytes: Number(f.file_size), tipo: f.recording_type || '', inicio: f.recording_start || m.start_time, fin: f.recording_end || null }))
    })).filter(m => { const t = Date.parse(m.inicio); return t >= desdeMs && t <= hastaMs && m.archivos.length; })
      .sort((a, b) => Date.parse(a.inicio) - Date.parse(b.inicio));
}

/* Las grabaciones de una reunión recurrente comparten ID; se listan las del
   anfitrión de la sala en el rango y se filtran por ID. */
async function buscar(zoomId, desdeISO, hastaISO) {
    const reunion = await get('/meetings/' + soloDigitos(zoomId));
    const desde = Date.parse(desdeISO), hasta = Date.parse(hastaISO);
    const from = new Date(desde - 86400000).toISOString().slice(0, 10), to = new Date(hasta + 86400000).toISOString().slice(0, 10);
    let todas = [], next = '';
    for (let i = 0; i < 10; i++) {
        const j = await get('/users/' + encodeURIComponent(reunion.host_id) + '/recordings?page_size=300&from=' + from + '&to=' + to + (next ? '&next_page_token=' + encodeURIComponent(next) : ''));
        todas = todas.concat(j.meetings || []);
        next = j.next_page_token || '';
        if (!next) break;
    }
    return filtrarGrabaciones(todas, zoomId, desde, hasta);
}

function validarTrozo(b) {
    if (!b || typeof b.uuid !== 'string' || !b.uuid || b.uuid.length > 200) return 'Falta la grabación (uuid)';
    if (typeof b.fileId !== 'string' || !b.fileId || b.fileId.length > 200) return 'Falta el archivo (fileId)';
    if (!GZ.esIdSubida(b.uploadId)) return 'Identificador de subida inválido';
    if (!Number.isInteger(b.n) || b.n < 1 || b.n > 10000) return 'Número de trozo inválido';
    if (!Number.isInteger(b.desde) || !Number.isInteger(b.hasta) || b.desde < 0 || b.hasta < b.desde) return 'Rango inválido';
    if (b.hasta - b.desde + 1 > GZ.TROZO) return 'Cada trozo es de 32 MB como máximo';
    return null;
}

/* Un rango del MP4. El download_url se pide cada vez (caduca). */
async function trozo(uuid, fileId, desde, hasta) {
    const j = await get('/meetings/' + uuidEnRuta(uuid) + '/recordings');
    const f = (j.recording_files || []).find(x => x.id === fileId);
    if (!f || !f.download_url) throw error('Ese archivo ya no está en Zoom', 404);
    const total = Number(f.file_size);
    if (desde >= total) throw error('Rango fuera del archivo', 416);
    const fin = Math.min(hasta, total - 1);
    const r = await fetch(f.download_url, { headers: { Authorization: 'Bearer ' + await token(), Range: `bytes=${desde}-${fin}` }, redirect: 'follow', signal: AbortSignal.timeout(120000) });
    if (r.status === 200 && !(desde === 0 && fin === total - 1)) {
        try { await r.body.cancel(); } catch (e) { /* nada */ }
        throw error('Zoom no respetó el rango pedido');
    }
    if (r.status !== 206 && r.status !== 200) throw error('Zoom respondió ' + r.status + ' al descargar');
    const buffer = Buffer.from(await r.arrayBuffer());
    if (buffer.length !== fin - desde + 1) throw error('Trozo incompleto desde Zoom (' + buffer.length + ' bytes)');
    return { buffer, total };
}

async function aPapelera(uuid) {
    const r = await fetch(API + '/meetings/' + uuidEnRuta(uuid) + '/recordings?action=trash', { method: 'DELETE', headers: { Authorization: 'Bearer ' + await token() }, signal: AbortSignal.timeout(20000) });
    if (r.status !== 204 && r.status !== 200) throw error('Zoom respondió ' + r.status + ' al borrar');
}

module.exports = { uuidEnRuta, filtrarGrabaciones, buscar, validarTrozo, trozo, aPapelera, soloDigitos };
