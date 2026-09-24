/**
 * Quién llama a un endpoint de api/ (24 sep, auditoría legal/seguridad).
 *
 * Antes de esto, crear-evento-google, eliminar-evento-google,
 * inscribir-alineacion, mis-inscripciones-alineacion, monto-fase,
 * crear-preferencia y kpi-data respondían a cualquiera con la URL: se
 * podía leer el precio negociado o las inscripciones (con liga de Zoom) de
 * otro candidato con solo cambiar el correo, inscribir correos ajenos
 * (manda invitación de Calendar + correo de Resend) o borrar eventos del
 * calendario del equipo.
 *
 * Mismo patrón que api/subir-portafolio.js: el navegador manda
 * `Authorization: Bearer <access_token de Supabase>` y aquí se valida con
 * getUser(). El correo que cuenta es el de la SESIÓN, nunca el del body.
 * Falla cerrado.
 *
 * Vive en lib/ y no en api/ para no contar contra el límite de 12 funciones
 * de Vercel Hobby.
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://numsuiuwrvpprhnxovmh.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im51bXN1aXV3cnZwcHJobnhvdm1oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc2OTg3MDAsImV4cCI6MjEwMzI3NDcwMH0.LA_MJzLcJyVtysxsJAmWwWzKwgynNm-f6ejGEaEpG1Y';

function normalizarCorreo(email) {
    return String(email || '').trim().toLowerCase();
}

/* { token, email } de la sesión real, o null si no hay token o no es válido. */
async function usuarioDeSesion(req) {
    const authHeader = (req.headers && req.headers.authorization) || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) return null;
    try {
        const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        const { data, error } = await supabase.auth.getUser(token);
        if (error || !data || !data.user || !data.user.email) return null;
        return { token, email: normalizarCorreo(data.user.email) };
    } catch (e) {
        return null;
    }
}

async function esAdmin(email) {
    try {
        const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        const { data, error } = await anon.rpc('is_admin', { check_email: email });
        return !error && data === true;
    } catch (e) {
        return false;
    }
}

/* Exige sesión. Responde 401 y regresa null si no la hay. */
async function exigirSesion(req, res) {
    const usuario = await usuarioDeSesion(req);
    if (!usuario) {
        res.status(401).json({ error: 'Inicia sesión para continuar' });
        return null;
    }
    return usuario;
}

/* Exige sesión de admin. Responde 401/403 y regresa null si no. */
async function exigirAdmin(req, res) {
    const usuario = await exigirSesion(req, res);
    if (!usuario) return null;
    if (!(await esAdmin(usuario.email))) {
        res.status(403).json({ error: 'Solo el equipo puede hacer esto' });
        return null;
    }
    return usuario;
}

/* Exige que la sesión sea dueña de `email`, o que sea admin (el equipo
   consulta a nombre de candidatos). Responde 401/403 y regresa null si no. */
async function exigirDuenoOAdmin(req, res, email) {
    const usuario = await exigirSesion(req, res);
    if (!usuario) return null;
    if (normalizarCorreo(email) === usuario.email) return usuario;
    if (await esAdmin(usuario.email)) return usuario;
    res.status(403).json({ error: 'Ese correo no es el de tu sesión' });
    return null;
}

module.exports = { usuarioDeSesion, esAdmin, exigirSesion, exigirAdmin, exigirDuenoOAdmin, normalizarCorreo };
