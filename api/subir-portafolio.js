/**
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
 * NEXTCLOUD_APP_PASSWORD (ya configuradas en Vercel).
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://numsuiuwrvpprhnxovmh.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im51bXN1aXV3cnZwcHJobnhvdm1oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc2OTg3MDAsImV4cCI6MjEwMzI3NDcwMH0.LA_MJzLcJyVtysxsJAmWwWzKwgynNm-f6ejGEaEpG1Y';

const FASE_CARPETA = {
    registro: '01-Registro',
    alineacion: '02-Alineacion',
    evaluacion: '03-Evaluacion',
    entrega: '04-Entrega'
};

const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15MB

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

async function ensureFolder(baseWebdavUrl, authBasic, folderPath) {
    const partes = folderPath.split('/').filter(Boolean);
    let acumulado = '';
    for (const parte of partes) {
        acumulado += `/${encodeURIComponent(parte)}`;
        const resp = await fetch(`${baseWebdavUrl}${acumulado}`, {
            method: 'MKCOL',
            headers: { Authorization: authBasic }
        });
        // 201 = creada. 405 = ya existía. Cualquier otra cosa es un error real.
        if (resp.status !== 201 && resp.status !== 405) {
            throw new Error(`No se pudo crear la carpeta ${acumulado} (status ${resp.status})`);
        }
    }
}

async function handler(req, res) {
    res.setHeader('Content-Type', 'application/json');

    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
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

        const carpeta = carpetaCandidato(nombre, curp);
        const faseCarpeta = FASE_CARPETA[fase];
        const folderPath = `Portafolios/${carpeta}/${faseCarpeta}`;

        await ensureFolder(baseWebdavUrl, authBasic, folderPath);

        const filePath = `${folderPath}/${filename}`;
        const putUrl = `${baseWebdavUrl}/${filePath.split('/').map(encodeURIComponent).join('/')}`;
        const putResp = await fetch(putUrl, {
            method: 'PUT',
            headers: { Authorization: authBasic, 'Content-Type': 'application/octet-stream' },
            body: fileBuffer
        });

        if (putResp.status !== 201 && putResp.status !== 204) {
            return res.status(502).json({ success: false, error: `Nextcloud respondió con status ${putResp.status}` });
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

module.exports = handler;
