/**
 * GET /api/subir-portafolio?ruta=…&desde=…&hasta=…  (18 sep, circuito del
 * Centro Evaluador): descarga un archivo del NAS para armar el portafolio en
 * el navegador del equipo. Solo admins/evaluadores; solo rutas bajo
 * Portafolios/ o Plantillas/ (Evaluacion.rutaNasPermitida). Responde en
 * trozos de hasta 3.5 MB (límite de respuesta de Vercel: 4.5 MB) con el
 * tamaño total en X-Total-Size. Vive aquí porque ya hay 12 funciones.
 *
 * POST /api/subir-portafolio
 * Sube un archivo (PDF generado por el sitio, o evidencia subida por el
 * candidato) al Nextcloud de almacenamiento (servidor de Humberto, WebDAV
 * vía Cloudflare Tunnel), organizado por candidato y fase.
 *
 * Body: { email, fase, nombre, curp, filename, fileBase64 }
 * Header: Authorization: Bearer <access_token de la sesión real de Supabase>
 * Retorna: { success: true, path } o { success: false, error }
 *
 * Variables de entorno requeridas: NEXTCLOUD_URL, NEXTCLOUD_USERNAME,
 * NEXTCLOUD_APP_PASSWORD, CF_ACCESS_CLIENT_ID, CF_ACCESS_CLIENT_SECRET
 * (ya configuradas en Vercel).
 *
 * El Nextcloud está detrás de Cloudflare Access (Zero Trust) además del
 * Cloudflare Tunnel — sin las 2 credenciales de Service Token de arriba,
 * toda petición (incluida esta, servidor-a-servidor) queda atrapada en la
 * pantalla de login por correo de Access antes de llegar a Nextcloud.
 */

const { createClient } = require('@supabase/supabase-js');
const { rutaNasPermitida } = require('../evaluacion.js');
const Nc = require('../lib/nextcloud.js');
const Zoom = require('../lib/zoom.js');
const GZ = require('../grabacion-zoom.js');
const { normalizarNextcloudUrl, slugify, carpetaCandidato, cloudflareAccessHeaders, ensureFolder } = Nc;

const SUPABASE_URL = 'https://numsuiuwrvpprhnxovmh.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im51bXN1aXV3cnZwcHJobnhvdm1oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc2OTg3MDAsImV4cCI6MjEwMzI3NDcwMH0.LA_MJzLcJyVtysxsJAmWwWzKwgynNm-f6ejGEaEpG1Y';

const FASE_CARPETA = {
    registro: '01-Registro',
    alineacion: '02-Alineacion',
    evaluacion: '03-Evaluacion',
    entrega: '04-Entrega'
};

const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15MB

const TROZO_MAX = 3.5 * 1024 * 1024;

/* desde/hasta del query → rango válido de a lo más TROZO_MAX bytes, o null. */
function rangoPedido(desde, hasta) {
    const a = desde === undefined || desde === '' ? 0 : Number(desde);
    const b = hasta === undefined || hasta === '' ? a + TROZO_MAX - 1 : Number(hasta);
    if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < a) return null;
    return { desde: a, hasta: Math.min(b, a + TROZO_MAX - 1) };
}

/* ¿La sesión es del equipo? is_admin() ya existe; puede_evaluar() llega con
   2026-09-18-centro-evaluador.sql (evaluadores). Falla cerrado. */
async function esDelEquipo(token, email) {
    const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const adm = await anon.rpc('is_admin', { check_email: email });
    if (!adm.error && adm.data === true) return true;
    const conSesion = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: 'Bearer ' + token } } });
    const ev = await conSesion.rpc('puede_evaluar');
    return !ev.error && ev.data === true;
}

async function handleDescarga(req, res) {
    const q = req.query || {};
    const ruta = typeof q.ruta === 'string' ? q.ruta : '';
    if (!rutaNasPermitida(ruta)) return res.status(400).json({ success: false, error: 'Ruta no permitida' });
    const rango = rangoPedido(q.desde, q.hasta);
    if (!rango) return res.status(400).json({ success: false, error: 'Rango inválido' });

    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) return res.status(401).json({ success: false, error: 'Falta el token de sesión' });
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData || !userData.user) return res.status(401).json({ success: false, error: 'Sesión inválida o expirada' });
    if (!(await esDelEquipo(token, userData.user.email))) return res.status(403).json({ success: false, error: 'Solo el equipo evaluador puede descargar del NAS' });

    const nextcloudUrl = normalizarNextcloudUrl(process.env.NEXTCLOUD_URL);
    const nextcloudUser = process.env.NEXTCLOUD_USERNAME;
    const nextcloudPass = process.env.NEXTCLOUD_APP_PASSWORD;
    if (!nextcloudUrl || !nextcloudUser || !nextcloudPass) return res.status(500).json({ success: false, error: 'Almacenamiento no configurado' });
    const url = `${nextcloudUrl}/remote.php/dav/files/${encodeURIComponent(nextcloudUser)}/${ruta.split('/').map(encodeURIComponent).join('/')}`;
    const headers = {
        Authorization: 'Basic ' + Buffer.from(`${nextcloudUser}:${nextcloudPass}`).toString('base64'),
        ...cloudflareAccessHeaders(),
        Range: `bytes=${rango.desde}-${rango.hasta}`
    };
    let resp;
    try { resp = await fetch(url, { headers, signal: AbortSignal.timeout(45000) }); }
    catch (e) { return res.status(502).json({ success: false, error: 'El NAS no respondió' }); }
    if (resp.status === 404) return res.status(404).json({ success: false, error: 'No existe en el NAS: ' + ruta });
    if (resp.status === 416) return res.status(416).json({ success: false, error: 'Rango fuera del archivo' });
    if (resp.status !== 206 && resp.status !== 200) return res.status(502).json({ success: false, error: `Nextcloud respondió con status ${resp.status}` });

    let cuerpo = Buffer.from(await resp.arrayBuffer());
    let total;
    if (resp.status === 206) {
        const m = /\/(\d+)\s*$/.exec(resp.headers.get('content-range') || '');
        total = m ? Number(m[1]) : rango.desde + cuerpo.length;
    } else {
        /* El NAS ignoró el Range: se recorta aquí. */
        total = cuerpo.length;
        cuerpo = cuerpo.subarray(rango.desde, rango.hasta + 1);
    }
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Total-Size', String(total));
    return res.status(200).send(cuerpo);
}

/* ---- Sala de evidencias (18 sep): grabación de Zoom → NAS -------------
   POST { accion, … } con la sesión del equipo (admin o evaluador). El
   archivo nunca pasa por el navegador: el servidor pide cada rango a Zoom
   y lo sube a la carga por trozos de Nextcloud. Ver lib/zoom.js. */
function esIsoFecha(s) { return typeof s === 'string' && !isNaN(Date.parse(s)); }
function validarCierre(b) {
    if (!b || !GZ.esIdSubida(b.uploadId)) return 'Identificador de subida inválido';
    if (typeof b.nombre !== 'string' || typeof b.curp !== 'string' || !(b.nombre.trim() || b.curp.trim())) return 'Faltan nombre y CURP del candidato';
    if (!esIsoFecha(b.inicio)) return 'Fecha de inicio inválida';
    if (!Number.isInteger(b.partes) || b.partes < 1 || b.partes > 20 || !Number.isInteger(b.parte) || b.parte < 1 || b.parte > b.partes) return 'Número de parte inválido';
    if (!Number.isInteger(b.bytes) || b.bytes < 1) return 'Falta el tamaño esperado';
    return null;
}
function rutaGrabacion(b) {
    return `Portafolios/${carpetaCandidato(b.nombre, b.curp)}/03-Evaluacion/${GZ.nombreGrabacion(b.inicio, b.parte, b.partes)}`;
}

async function handleZoom(req, res) {
    const b = req.body || {};
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) return res.status(401).json({ success: false, error: 'Falta el token de sesión' });
    const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data: u, error: ue } = await anon.auth.getUser(token);
    if (ue || !u || !u.user) return res.status(401).json({ success: false, error: 'Sesión inválida o expirada' });
    if (!(await esDelEquipo(token, u.user.email))) return res.status(403).json({ success: false, error: 'Solo el equipo evaluador' });
    const conSesion = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: 'Bearer ' + token } } });

    if (b.accion === 'zoom-buscar') {
        if (!esIsoFecha(b.desde) || !esIsoFecha(b.hasta) || Date.parse(b.hasta) < Date.parse(b.desde) || Date.parse(b.hasta) - Date.parse(b.desde) > 31 * 86400000) {
            return res.status(400).json({ success: false, error: 'Rango de búsqueda inválido (máximo 31 días)' });
        }
        const cfg = await conSesion.from('sala_evidencias_config').select('zoom_id').eq('id', 1).maybeSingle();
        if (cfg.error || !cfg.data || !cfg.data.zoom_id) return res.status(400).json({ success: false, error: 'Falta el ID de la sala en Sesiones → Sala de evidencias' });
        const grabaciones = await Zoom.buscar(cfg.data.zoom_id, b.desde, b.hasta);
        return res.status(200).json({ success: true, grabaciones });
    }
    const cx = Nc.conexion();
    if (!cx) return res.status(500).json({ success: false, error: 'Almacenamiento no configurado' });

    if (b.accion === 'zoom-trozo') {
        const malo = Zoom.validarTrozo(b);
        if (malo) return res.status(400).json({ success: false, error: malo });
        const t = await Zoom.trozo(b.uuid, b.fileId, b.desde, b.hasta);
        await Nc.subirTrozo(cx, b.uploadId, b.n, t.buffer);
        return res.status(200).json({ success: true, bytes: t.buffer.length, total: t.total });
    }
    if (b.accion === 'zoom-cerrar') {
        const malo = validarCierre(b);
        if (malo) return res.status(400).json({ success: false, error: malo });
        const ruta = rutaGrabacion(b);
        await ensureFolder(Nc.baseArchivos(cx), cx.headers, ruta.split('/').slice(0, -1).join('/'));
        let tam = await Nc.tamano(cx, ruta);
        if (tam !== b.bytes && !b.soloVerificar) {
            const mv = await Nc.ensamblar(cx, b.uploadId, ruta);
            if (mv.pendiente) return res.status(202).json({ success: false, pendiente: true, ruta });
            tam = await Nc.tamano(cx, ruta);
        }
        if (tam === null && b.soloVerificar) return res.status(202).json({ success: false, pendiente: true, ruta });
        if (tam !== b.bytes) return res.status(502).json({ success: false, error: `El NAS tiene ${tam === null ? 'ningún' : tam} bytes y Zoom ${b.bytes}. Vuelve a copiar.` });
        return res.status(200).json({ success: true, ruta, bytes: tam });
    }
    if (b.accion === 'zoom-borrar') {
        if (typeof b.uuid !== 'string' || !b.uuid || typeof b.email !== 'string') return res.status(400).json({ success: false, error: 'Faltan grabación o candidato' });
        const ev = await conSesion.from('evaluaciones').select('etapas,video').eq('email', b.email.toLowerCase()).maybeSingle();
        const e = ev.data || {};
        const parte = GZ.partesDe(e).find(p => p && p.zoom && p.zoom.uuid === b.uuid);
        if (!(e.etapas && e.etapas.entregado)) return res.status(409).json({ success: false, error: 'Solo se borra de Zoom después de entregar el certificado' });
        if (!parte || !parte.nas || !parte.nas.ruta) return res.status(409).json({ success: false, error: 'Primero copia esa grabación al NAS' });
        await Zoom.aPapelera(b.uuid);
        return res.status(200).json({ success: true });
    }
    return res.status(400).json({ success: false, error: 'Acción desconocida' });
}

async function handler(req, res) {
    if (req.method === 'GET') {
        try { return await handleDescarga(req, res); }
        catch (e) {
            console.error('Error en descarga del NAS:', e);
            res.setHeader('Content-Type', 'application/json');
            return res.status(500).json({ success: false, error: e.message || 'Error interno' });
        }
    }
    res.setHeader('Content-Type', 'application/json');

    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    if (req.body && typeof req.body.accion === 'string') {
        try { return await handleZoom(req, res); }
        catch (e) {
            console.error('subir-portafolio zoom:', req.body.accion, e);
            return res.status(e.status || 500).json({ success: false, error: e.message || 'Error interno' });
        }
    }

    const { email, fase, nombre, curp, filename, fileBase64 } = req.body || {};

    if (!email || !fase || !filename || !fileBase64) {
        return res.status(400).json({ success: false, error: 'Faltan campos requeridos (email, fase, filename, fileBase64)' });
    }
    if (!FASE_CARPETA[fase]) {
        return res.status(400).json({ success: false, error: 'Fase inválida' });
    }

    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) {
        return res.status(401).json({ success: false, error: 'Falta el token de sesión' });
    }

    try {
        const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        const { data: userData, error: userError } = await supabase.auth.getUser(token);
        if (userError || !userData || !userData.user) {
            return res.status(401).json({ success: false, error: 'Sesión inválida o expirada' });
        }
        if (userData.user.email.toLowerCase() !== String(email).toLowerCase()) {
            return res.status(403).json({ success: false, error: 'El correo no coincide con la sesión activa' });
        }

        let fileBuffer;
        try {
            fileBuffer = Buffer.from(fileBase64, 'base64');
        } catch (e) {
            return res.status(400).json({ success: false, error: 'fileBase64 inválido' });
        }
        if (fileBuffer.length === 0) {
            return res.status(400).json({ success: false, error: 'El archivo está vacío' });
        }
        if (fileBuffer.length > MAX_FILE_BYTES) {
            return res.status(400).json({ success: false, error: `El archivo excede el límite de ${MAX_FILE_BYTES / (1024 * 1024)}MB` });
        }

        const nextcloudUrl = normalizarNextcloudUrl(process.env.NEXTCLOUD_URL);
        const nextcloudUser = process.env.NEXTCLOUD_USERNAME;
        const nextcloudPass = process.env.NEXTCLOUD_APP_PASSWORD;
        if (!nextcloudUrl || !nextcloudUser || !nextcloudPass) {
            return res.status(500).json({ success: false, error: 'Almacenamiento no configurado (faltan variables de entorno de Nextcloud)' });
        }

        const baseWebdavUrl = `${nextcloudUrl}/remote.php/dav/files/${encodeURIComponent(nextcloudUser)}`;
        const authBasic = 'Basic ' + Buffer.from(`${nextcloudUser}:${nextcloudPass}`).toString('base64');
        const baseHeaders = { Authorization: authBasic, ...cloudflareAccessHeaders() };

        const carpeta = carpetaCandidato(nombre, curp);
        const faseCarpeta = FASE_CARPETA[fase];
        const folderPath = `Portafolios/${carpeta}/${faseCarpeta}`;

        await ensureFolder(baseWebdavUrl, baseHeaders, folderPath);

        const filePath = `${folderPath}/${filename}`;
        const putUrl = `${baseWebdavUrl}/${filePath.split('/').map(encodeURIComponent).join('/')}`;
        /* 17 sep: en producción hubo 502 sueltos mientras otras subidas del
           mismo candidato salían bien (varias pestañas subiendo a la vez, y
           ahora también las resubidas por versión). Un PUT sobre el mismo
           archivo es idempotente, así que ante bloqueo (423), saturación
           (429) o falla del NAS/túnel (5xx) se reintenta hasta 2 veces. */
        let putStatus = 0;
        for (let intento = 1; intento <= 3; intento++) {
            try {
                const putResp = await fetch(putUrl, {
                    method: 'PUT',
                    headers: { ...baseHeaders, 'Content-Type': 'application/octet-stream' },
                    body: fileBuffer,
                    signal: AbortSignal.timeout(45000)
                });
                putStatus = putResp.status;
            } catch (e) {
                putStatus = 0; // timeout o red
            }
            if (putStatus === 201 || putStatus === 204) break;
            const transitorio = putStatus === 0 || putStatus === 423 || putStatus === 429 || putStatus >= 500;
            console.error(`subir-portafolio: PUT ${fase}/${filename} intento ${intento} → status ${putStatus || 'sin respuesta'}`);
            if (!transitorio || intento === 3) break;
            await new Promise(r => setTimeout(r, 1500 * intento));
        }

        if (putStatus !== 201 && putStatus !== 204) {
            return res.status(502).json({ success: false, error: `Nextcloud respondió con status ${putStatus || 'sin respuesta'}` });
        }

        return res.status(200).json({ success: true, path: filePath });
    } catch (e) {
        console.error('Error en subir-portafolio:', e);
        return res.status(500).json({ success: false, error: e.message || 'Error interno' });
    }
}

// Funciones puras expuestas solo para pruebas aisladas (ver plan de
// implementación) — Vercel sigue llamando a este módulo como función.
handler._normalizarNextcloudUrl = normalizarNextcloudUrl;
handler._slugify = slugify;
handler._carpetaCandidato = carpetaCandidato;
handler._rangoPedido = rangoPedido;
handler._validarCierre = validarCierre;
handler._rutaGrabacion = rutaGrabacion;

module.exports = handler;
