/* lib/nextcloud.js — WebDAV del NAS (Nextcloud de Humberto, detrás de
   Cloudflare Tunnel + Access). Movido de api/subir-portafolio.js el 18 sep
   para compartirlo con la copia de grabaciones de Zoom. Fuera de api/ a
   propósito: no cuenta contra el límite de 12 funciones de Vercel. */

function normalizarNextcloudUrl(url) {
    let normalized = (url || '').trim().replace(/\/+$/, '');
    normalized = normalized.replace(/\/index\.php\/login$/i, '').replace(/\/login$/i, '');
    return normalized;
}
function slugify(text) {
    return (text || '')
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-zA-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
}
function carpetaCandidato(nombre, curp) {
    const partes = [slugify(nombre), slugify(curp)].filter(Boolean);
    return partes.join('_') || 'candidato_sin_identificar';
}
function cloudflareAccessHeaders() {
    const clientId = process.env.CF_ACCESS_CLIENT_ID;
    const clientSecret = process.env.CF_ACCESS_CLIENT_SECRET;
    if (!clientId || !clientSecret) return {};
    return { 'CF-Access-Client-Id': clientId, 'CF-Access-Client-Secret': clientSecret };
}
async function ensureFolder(baseWebdavUrl, baseHeaders, folderPath) {
    const partes = folderPath.split('/').filter(Boolean);
    let acumulado = '';
    for (const parte of partes) {
        acumulado += `/${encodeURIComponent(parte)}`;
        const resp = await fetch(`${baseWebdavUrl}${acumulado}`, { method: 'MKCOL', headers: baseHeaders });
        // 201 = creada. 405 = ya existía. Cualquier otra cosa es un error real.
        if (resp.status !== 201 && resp.status !== 405) {
            throw new Error(`No se pudo crear la carpeta ${acumulado} (status ${resp.status})`);
        }
    }
}

/* Conexión desde las variables de entorno, o null si faltan. */
function conexion() {
    const url = normalizarNextcloudUrl(process.env.NEXTCLOUD_URL);
    const user = process.env.NEXTCLOUD_USERNAME, pass = process.env.NEXTCLOUD_APP_PASSWORD;
    if (!url || !user || !pass) return null;
    return { dav: `${url}/remote.php/dav`, user, headers: { Authorization: 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64'), ...cloudflareAccessHeaders() } };
}
function baseArchivos(cx) { return `${cx.dav}/files/${encodeURIComponent(cx.user)}`; }
function urlArchivo(cx, ruta) { return `${baseArchivos(cx)}/${ruta.split('/').map(encodeURIComponent).join('/')}`; }
function urlSubida(cx, uploadId) { return `${cx.dav}/uploads/${encodeURIComponent(cx.user)}/${uploadId}`; }
function nombreTrozo(n) { return String(n).padStart(5, '0'); }
function leerTamano(xml) { const m = /<[a-z]*:?getcontentlength>(\d+)</i.exec(xml || ''); return m ? Number(m[1]) : null; }

/* Un trozo de la carga por trozos (formato clásico). Reintenta ante
   423/429/5xx/sin respuesta, igual que la subida normal. */
async function subirTrozo(cx, uploadId, n, buffer) {
    const dir = urlSubida(cx, uploadId);
    if (n === 1) {
        const m = await fetch(dir, { method: 'MKCOL', headers: cx.headers, signal: AbortSignal.timeout(30000) });
        if (m.status !== 201 && m.status !== 405) throw Object.assign(new Error(`El NAS no abrió la carga por trozos (status ${m.status})`), { status: 502 });
    }
    let st = 0;
    for (let intento = 1; intento <= 3; intento++) {
        try {
            const r = await fetch(`${dir}/${nombreTrozo(n)}`, { method: 'PUT', headers: { ...cx.headers, 'Content-Type': 'application/octet-stream' }, body: buffer, signal: AbortSignal.timeout(180000) });
            st = r.status;
        } catch (e) { st = 0; }
        if (st === 201 || st === 204) return;
        if (!(st === 0 || st === 423 || st === 429 || st >= 500) || intento === 3) break;
        await new Promise(r => setTimeout(r, 1500 * intento));
    }
    throw Object.assign(new Error(`El NAS rechazó el trozo ${n} (status ${st || 'sin respuesta'})`), { status: 502 });
}

/* Arma el archivo final. Cloudflare corta a los ~100 s aunque el NAS siga
   armando un archivo grande: en ese caso regresa { pendiente: true } y el
   equipo verifica después con tamano(). */
async function ensamblar(cx, uploadId, ruta) {
    let st = 0;
    try {
        const r = await fetch(`${urlSubida(cx, uploadId)}/.file`, { method: 'MOVE', headers: { ...cx.headers, Destination: urlArchivo(cx, ruta), Overwrite: 'T' }, signal: AbortSignal.timeout(250000) });
        st = r.status;
    } catch (e) { st = 0; }
    if (st === 201 || st === 204) return { pendiente: false };
    if (st === 0 || st === 502 || st === 504 || st === 524) return { pendiente: true };
    throw Object.assign(new Error(`El NAS no pudo armar el archivo (status ${st})`), { status: 502 });
}
async function tamano(cx, ruta) {
    const r = await fetch(urlArchivo(cx, ruta), {
        method: 'PROPFIND', headers: { ...cx.headers, Depth: '0', 'Content-Type': 'application/xml' },
        body: '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:getcontentlength/></d:prop></d:propfind>',
        signal: AbortSignal.timeout(30000)
    });
    if (r.status === 404) return null;
    if (r.status !== 207) throw Object.assign(new Error(`El NAS respondió ${r.status} al consultar el archivo`), { status: 502 });
    return leerTamano(await r.text());
}

module.exports = {
    normalizarNextcloudUrl, slugify, carpetaCandidato, cloudflareAccessHeaders, ensureFolder,
    conexion, baseArchivos, urlArchivo, urlSubida, nombreTrozo, leerTamano, subirTrozo, ensamblar, tamano
};
