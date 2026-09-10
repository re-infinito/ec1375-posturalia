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
const { enviarRecordatorio24h, enviarRecordatorio1h } = require('./utils/send-email');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = async (req, res) => {
    res.setHeader('Content-Type', 'application/json');

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const ahora = new Date();
        const hace1Hora = new Date(ahora.getTime() - 60 * 60 * 1000);
        const hace25Horas = new Date(ahora.getTime() - 25 * 60 * 60 * 1000);

        // Recordatorios de 24 horas
        const recordatorios24h = await procesarRecordatorios24h();

        // Recordatorios de 1 hora
        const recordatorios1h = await procesarRecordatorios1h();

        res.status(200).json({
            success: true,
            recordatorios_24h_enviados: recordatorios24h,
            recordatorios_1h_enviados: recordatorios1h,
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
        const mananaFecha = manana.toISOString().split('T')[0];

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
                    google_meet_link
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
                await enviarRecordatorio24h(inscripcion, sesion, sesion.google_meet_link);

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
        const ahoyFecha = ahora.toISOString().split('T')[0];
        const horaActual = ahora.getHours().toString().padStart(2, '0') + ':' +
                          ahora.getMinutes().toString().padStart(2, '0');

        // Obtener sesiones que comienzan en la próxima hora
        const { data: sesiones, error: errorSesiones } = await supabase
            .from('sesiones_alineacion')
            .select(`
                id,
                fecha,
                hora_inicio,
                hora_fin,
                instructor_nombre,
                google_meet_link
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
            // Verificar si la sesión comienza en aprox 1 hora
            const [horaS, minS] = sesion.hora_inicio.split(':').map(Number);
            const horaInicio = new Date();
            horaInicio.setHours(horaS, minS, 0);

            const diffMinutos = (horaInicio - ahora) / (1000 * 60);

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
                        await enviarRecordatorio1h(inscripcion, sesion, sesion.google_meet_link);

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
