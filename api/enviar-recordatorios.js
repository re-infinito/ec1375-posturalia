/**
 * POST /api/enviar-recordatorios
 * Envía recordatorios a usuarios próximas a sus sesiones
 * Llamado por Cloud Scheduler/Cron cada hora
 *
 * Envía:
 * - Recordatorio 24h antes de sesión
 * - Recordatorio 1h antes de sesión
 */

const { createClient } = require('@supabase/supabase-js');
const { enviarRecordatorio24h, enviarRecordatorio1h, enviarRecordatorioSala } = require('../lib/send-email');
const Rec = require('../lib/recordatorios');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// fecha/hora_inicio en sesiones_alineacion son hora local de
// America/Mexico_City (ver nota en crear-evento-google.js). Vercel corre en
// UTC, así que `new Date().getHours()` / `.toISOString()` dan la hora del
// servidor, NO la de México — comparar eso contra hora_inicio desfasa los
// recordatorios por el offset completo de la zona (6 horas sin DST). Estas
// dos funciones dan la fecha/hora "ahora" ya convertida a México.
function fechaHoyEnMexico(date = new Date()) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(date);
}

function horaAhoraEnMexico(date = new Date()) {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Mexico_City',
        hour: '2-digit', minute: '2-digit', hour12: false
    }).formatToParts(date);
    const get = (type) => parts.find(p => p.type === type).value;
    let hora = get('hour');
    if (hora === '24') hora = '00'; // quirk de ICU: medianoche a veces sale como "24"
    return `${hora}:${get('minute')}`;
}

module.exports = async (req, res) => {
    res.setHeader('Content-Type', 'application/json');

    if (req.method !== 'POST' && req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Este endpoint MANDA CORREOS, así que no puede quedar abierto a quien
    // adivine la URL. El disparador (GitHub Actions) manda el secreto en el
    // header; es el mismo formato que usa el cron nativo de Vercel, por si
    // algún día se mueve para allá. Sin CRON_SECRET no corre: es preferible
    // que falle a gritos a que quede expuesto sin que nadie se entere.
    const secreto = process.env.CRON_SECRET;
    if (!secreto) {
        return res.status(500).json({ error: 'Falta CRON_SECRET' });
    }
    if ((req.headers.authorization || '') !== `Bearer ${secreto}`) {
        return res.status(401).json({ error: 'No autorizado' });
    }

    try {
        const ahora = new Date();
        const hace1Hora = new Date(ahora.getTime() - 60 * 60 * 1000);
        const hace25Horas = new Date(ahora.getTime() - 25 * 60 * 60 * 1000);

        // Recordatorios de 24 horas
        const recordatorios24h = await procesarRecordatorios24h();

        // Recordatorios de 1 hora
        const recordatorios1h = await procesarRecordatorios1h();

        // Recordatorios de la sala de evidencias (24 h / 2 h / 1 h antes)
        const sala = await procesarRecordatoriosSala();

        res.status(200).json({
            success: true,
            recordatorios_24h_enviados: recordatorios24h,
            recordatorios_1h_enviados: recordatorios1h,
            sala_evidencias: sala,
            timestamp: ahora.toISOString()
        });

    } catch (error) {
        console.error('Error en /api/enviar-recordatorios:', error);
        res.status(500).json({
            error: 'Error procesando recordatorios',
            message: error.message
        });
    }
};

/**
 * Procesar recordatorios 24h antes
 */
async function procesarRecordatorios24h() {
    try {
        const ahora = new Date();
        const manana = new Date(ahora.getTime() + 24 * 60 * 60 * 1000);
        const mananaFecha = fechaHoyEnMexico(manana);

        // Obtener inscripciones que necesitan recordatorio 24h
        const { data: inscripciones, error } = await supabase
            .from('inscripciones_alineacion')
            .select(`
                id,
                usuario_email,
                usuario_nombre,
                sesion_id,
                recordatorio_24h_enviado,
                sesiones_alineacion (
                    id,
                    fecha,
                    hora_inicio,
                    hora_fin,
                    instructor_nombre,
                    zoom_link
                )
            `)
            .eq('estado_inscripcion', 'confirmada')
            .eq('recordatorio_24h_enviado', false)
            .eq('sesiones_alineacion.fecha', mananaFecha);

        if (error) {
            console.error('Error obteniendo inscripciones para recordatorio 24h:', error);
            return 0;
        }

        let enviados = 0;

        for (const inscripcion of inscripciones || []) {
            try {
                const sesion = inscripcion.sesiones_alineacion;

                if (!sesion) continue;

                // Enviar recordatorio
                await enviarRecordatorio24h(inscripcion, sesion, sesion.zoom_link);

                // Marcar como enviado
                await supabase
                    .from('inscripciones_alineacion')
                    .update({ recordatorio_24h_enviado: true })
                    .eq('id', inscripcion.id);

                // Registrar en auditoría
                await supabase.from('emails_enviados_alineacion').insert([
                    {
                        inscripcion_id: inscripcion.id,
                        tipo_email: 'recordatorio_24h',
                        destinatario: inscripcion.usuario_email,
                        asunto: `📅 Recordatorio: Tu Sesión es Mañana a las ${sesion.hora_inicio}`,
                        fecha_envio: new Date().toISOString(),
                        estado_envio: 'enviado'
                    }
                ]);

                enviados++;
                console.log(`✓ Recordatorio 24h enviado a ${inscripcion.usuario_email}`);

            } catch (err) {
                console.error(`Error enviando recordatorio 24h a ${inscripcion.usuario_email}:`, err);

                // Registrar fallo
                await supabase.from('emails_enviados_alineacion').insert([
                    {
                        inscripcion_id: inscripcion.id,
                        tipo_email: 'recordatorio_24h',
                        destinatario: inscripcion.usuario_email,
                        asunto: 'Recordatorio 24h',
                        fecha_envio: new Date().toISOString(),
                        estado_envio: 'fallido',
                        error_mensaje: err.message
                    }
                ]);
            }
        }

        return enviados;

    } catch (error) {
        console.error('Error en procesarRecordatorios24h:', error);
        return 0;
    }
}

/**
 * Procesar recordatorios 1h antes
 */
async function procesarRecordatorios1h() {
    try {
        const ahora = new Date();
        const ahoyFecha = fechaHoyEnMexico(ahora);
        const horaActual = horaAhoraEnMexico(ahora);
        const [horaActualH, horaActualM] = horaActual.split(':').map(Number);
        const minutosAhora = horaActualH * 60 + horaActualM;

        // Obtener sesiones que comienzan en la próxima hora
        const { data: sesiones, error: errorSesiones } = await supabase
            .from('sesiones_alineacion')
            .select(`
                id,
                fecha,
                hora_inicio,
                hora_fin,
                instructor_nombre,
                zoom_link
            `)
            .eq('estado', 'abierta')
            .eq('fecha', ahoyFecha)
            .gte('hora_inicio', horaActual);

        if (errorSesiones) {
            console.error('Error obteniendo sesiones para recordatorio 1h:', errorSesiones);
            return 0;
        }

        let enviados = 0;

        for (const sesion of sesiones || []) {
            // Verificar si la sesión comienza en aprox 1 hora. Comparación
            // en minutos-desde-medianoche, ambos lados en hora de México
            // (no construir Date con setHours — eso usaría la zona del
            // servidor y volvería a introducir el desfase de 6h).
            const [horaS, minS] = sesion.hora_inicio.split(':').map(Number);
            const minutosInicio = horaS * 60 + minS;
            const diffMinutos = minutosInicio - minutosAhora;

            // Enviar si está entre 50 y 70 minutos en el futuro
            if (diffMinutos >= 50 && diffMinutos <= 70) {

                // Obtener inscripciones que no han recibido recordatorio 1h
                const { data: inscripciones } = await supabase
                    .from('inscripciones_alineacion')
                    .select('id, usuario_email, usuario_nombre')
                    .eq('sesion_id', sesion.id)
                    .eq('estado_inscripcion', 'confirmada')
                    .eq('recordatorio_1h_enviado', false);

                for (const inscripcion of inscripciones || []) {
                    try {
                        // Enviar recordatorio
                        await enviarRecordatorio1h(inscripcion, sesion, sesion.zoom_link);

                        // Marcar como enviado
                        await supabase
                            .from('inscripciones_alineacion')
                            .update({ recordatorio_1h_enviado: true })
                            .eq('id', inscripcion.id);

                        // Registrar en auditoría
                        await supabase.from('emails_enviados_alineacion').insert([
                            {
                                inscripcion_id: inscripcion.id,
                                tipo_email: 'recordatorio_1h',
                                destinatario: inscripcion.usuario_email,
                                asunto: `🔔 ¡Comienza en 1 Hora! - Sesión de Alineación EC1375`,
                                fecha_envio: new Date().toISOString(),
                                estado_envio: 'enviado'
                            }
                        ]);

                        enviados++;
                        console.log(`✓ Recordatorio 1h enviado a ${inscripcion.usuario_email}`);

                    } catch (err) {
                        console.error(`Error enviando recordatorio 1h a ${inscripcion.usuario_email}:`, err);

                        await supabase.from('emails_enviados_alineacion').insert([
                            {
                                inscripcion_id: inscripcion.id,
                                tipo_email: 'recordatorio_1h',
                                destinatario: inscripcion.usuario_email,
                                asunto: 'Recordatorio 1h',
                                fecha_envio: new Date().toISOString(),
                                estado_envio: 'fallido',
                                error_mensaje: err.message
                            }
                        ]);
                    }
                }
            }
        }

        return enviados;

    } catch (error) {
        console.error('Error en procesarRecordatorios1h:', error);
        return 0;
    }
}

/**
 * Recordatorios de la SALA DE EVIDENCIAS: 24 h, 2 h y 1 h antes del horario
 * que el candidato apartó en su Plan de Evaluación.
 *
 * A diferencia de las sesiones de Alineación, aquí el horario es un
 * timestamptz (un instante), así que no hay conversión de zona que pueda
 * desfasar los avisos: la ventana se decide restando. La zona solo se usa
 * para escribir la fecha en el correo (lib/recordatorios.js).
 *
 * La marca de "ya enviado" vive en reservas_evidencia.recordatorios, junto a
 * la reserva: si la reserva se cancela o se cambia de horario, la marca se va
 * con ella y el horario nuevo vuelve a avisar desde cero.
 */
const SITIO = 'https://sepconocer.paideiatech.com';

async function procesarRecordatoriosSala() {
    const resultado = { enviados: 0, fallidos: 0, revisadas: 0 };
    try {
        const { data: cfg } = await supabase
            .from('sala_evidencias_config').select('minutos_antes').eq('id', 1).maybeSingle();
        const minutosAntes = (cfg && cfg.minutos_antes) || 30;

        // Son pocas (una activa por candidato): se traen todas y se filtran
        // aquí, en vez de intentar filtrar por la fecha de la tabla unida.
        const { data: reservas, error } = await supabase
            .from('reservas_evidencia')
            .select('id, email, recordatorios, horarios_evidencia (inicio, fin)')
            .eq('estado', 'reservada');

        if (error) {
            console.error('Recordatorios de sala: no se pudieron leer las reservas:', error.message);
            return { ...resultado, error: error.message };
        }

        const ahora = Date.now();
        const pendientes = [];
        for (const r of reservas || []) {
            const h = r.horarios_evidencia;
            if (!h || !h.inicio) continue;
            resultado.revisadas++;
            const clave = Rec.avisoPendiente(h.inicio, ahora, r.recordatorios || {});
            if (clave) pendientes.push({ reserva: r, horario: h, clave });
        }
        if (!pendientes.length) return resultado;

        const nombres = await nombresPorCorreo();

        for (const p of pendientes) {
            const correo = p.reserva.email;
            try {
                await enviarRecordatorioSala({
                    email: correo,
                    nombre: Rec.nombreDePila(nombres[String(correo).toLowerCase()]),
                    clave: p.clave,
                    fechaLarga: Rec.fechaLargaMx(p.horario.inicio),
                    rango: Rec.rangoMx(p.horario.inicio, p.horario.fin),
                    minutosAntes,
                    sitio: SITIO
                });

                // Se marca DESPUÉS de que Resend aceptó el envío: si falla, la
                // marca no se pone y la siguiente corrida lo vuelve a intentar
                // mientras siga dentro de su ventana.
                const marcas = { ...(p.reserva.recordatorios || {}), [p.clave]: new Date().toISOString() };
                await supabase.from('reservas_evidencia')
                    .update({ recordatorios: marcas }).eq('id', p.reserva.id);

                resultado.enviados++;
                console.log(`✓ Recordatorio de sala (${p.clave}) enviado a ${correo}`);
            } catch (err) {
                resultado.fallidos++;
                console.error(`Recordatorio de sala (${p.clave}) falló para ${correo}:`, err.message);
            }
        }
        return resultado;
    } catch (error) {
        console.error('Error en procesarRecordatoriosSala:', error);
        return { ...resultado, error: error.message };
    }
}

/**
 * correo → nombre del candidato, para saludarlo por su nombre.
 * El nombre vive en candidatos_ec1375 (que no tiene columna de correo) y el
 * correo en auth.users, así que se cruzan por user_id. Si algo falla, los
 * recordatorios salen igual con un "Hola," a secas: el saludo no vale
 * detener el envío.
 */
async function nombresPorCorreo() {
    const mapa = {};
    try {
        const { data: filas } = await supabase.from('candidatos_ec1375').select('user_id, nombre');
        if (!filas || !filas.length) return mapa;
        const porId = {};
        for (const f of filas) if (f.user_id && f.nombre) porId[f.user_id] = f.nombre;

        const { data: usuarios } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
        for (const u of (usuarios && usuarios.users) || []) {
            if (u.email && porId[u.id]) mapa[u.email.toLowerCase()] = porId[u.id];
        }
    } catch (err) {
        console.error('No se pudieron resolver los nombres (se saluda sin nombre):', err.message);
    }
    return mapa;
}
