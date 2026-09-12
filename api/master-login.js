// Login-maestro: deja al equipo entrar como CUALQUIER candidato ya
// autorizado (al menos una fase pagada), usando una sola contraseña
// compartida — útil para ayudar a un candidato en llamada sin esperar un
// correo de restablecimiento. Ver Claude.md para el contexto completo.
//
// Por qué necesita un endpoint aparte y no se resuelve solo con JS en el
// navegador: supabaseClient.auth.signInWithPassword() solo funciona con la
// contraseña REAL de esa cuenta — no hay forma de "iniciar sesión como"
// otro usuario desde el cliente sin conocer su contraseña. La única forma
// de emitir una sesión válida para un correo arbitrario es del lado del
// servidor, con la service role key, vía el Admin API de Supabase
// (auth.admin.generateLink) — nunca se expone esa key ni la contraseña
// maestra al navegador.
//
// Variables de entorno requeridas:
//   SUPABASE_SERVICE_ROLE_KEY  — ya usada por otros endpoints (webhook, etc.)
//   MASTER_LOGIN_PASSWORD      — nueva, agregar en Vercel → Project Settings
//                                → Environment Variables. El valor NUNCA
//                                debe aparecer en código cliente.

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://numsuiuwrvpprhnxovmh.supabase.co';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }

    const masterPassword = process.env.MASTER_LOGIN_PASSWORD;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!masterPassword || !serviceKey) {
        console.error('master-login: faltan MASTER_LOGIN_PASSWORD o SUPABASE_SERVICE_ROLE_KEY en Vercel');
        res.status(500).json({ error: 'Función no configurada' });
        return;
    }

    try {
        const { email, password } = req.body || {};
        const emailNormalizado = (email || '').trim().toLowerCase();

        /* Se verifica la contraseña maestra ANTES de tocar el correo, y con
           un mensaje genérico si falla — así alguien probando contraseñas
           al azar no aprende nada sobre qué correos existen o están
           autorizados. Comparación simple (no constant-time): proporcional
           al resto de la seguridad de este proyecto (ej. el webhook sí usa
           HMAC porque valida un tercero externo; esto es una herramienta
           interna con un secreto rotable). */
        if (!password || password !== masterPassword) {
            res.status(401).json({ error: 'No autorizado' });
            return;
        }
        if (!emailNormalizado || !emailNormalizado.includes('@')) {
            res.status(401).json({ error: 'No autorizado' });
            return;
        }

        const supabaseAdmin = createClient(SUPABASE_URL, serviceKey);

        /* Solo funciona para correos con al menos una fase pagada — el
           mismo criterio de fondo que Auth.isEmailAuthorized() /
           isPhaseAuthorized(), consultado aquí directo a la tabla porque
           este endpoint no tiene una sesión de candidato de la cual
           depender. Diego lo pidió explícitamente así: "disponible para
           todos los correos con acceso a las tabs liberadas por pago" —
           no es un login maestro para correos arbitrarios sin relación
           con el proyecto. */
        const { data: fases, error: fasesError } = await supabaseAdmin
            .from('candidatos_fase_pagos')
            .select('fase')
            .eq('email', emailNormalizado)
            .limit(1);

        if (fasesError) {
            console.error('master-login: error consultando candidatos_fase_pagos:', fasesError);
            res.status(500).json({ error: 'Error interno' });
            return;
        }
        if (!fases || fases.length === 0) {
            res.status(401).json({ error: 'Ese correo no tiene ninguna fase autorizada todavía' });
            return;
        }

        /* generateLink no manda ningún correo — solo emite el token. La
           entrega real (este endpoint devolviéndolo al navegador, que lo
           canjea de inmediato vía verifyOtp) reemplaza el transporte SMTP
           por la propia respuesta HTTPS de esta función. */
        const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
            type: 'magiclink',
            email: emailNormalizado
        });

        if (linkError || !linkData || !linkData.properties || !linkData.properties.hashed_token) {
            console.error('master-login: error generando el link:', linkError);
            res.status(500).json({ error: 'No se pudo iniciar sesión' });
            return;
        }

        res.status(200).json({
            email: emailNormalizado,
            hashed_token: linkData.properties.hashed_token
        });
    } catch (e) {
        console.error('Error en master-login:', e);
        res.status(500).json({ error: 'Error interno' });
    }
}
