/**
 * POST /api/inscribir-alineacion
 * Inscribe un usuario a una sesión de alineación
 * Body: { sesion_id, usuario_email, usuario_nombre, usuario_curp }
 * Retorna: { success, inscripcion_id, google_meet_link, mensaje }
 */

const { createClient } = require('@supabase/supabase-js');
const { google } = require('googleapis');
const fs = require('fs');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const googleAuth = new google.auth.GoogleAuth({
    keyFile: process.env.GOOGLE_CALENDAR_KEY_FILE,
    scopes: ['https://www.googleapis.com/auth/calendar']
});

const calendar = google.calendar({ version: 'v3', auth: googleAuth });

module.exports = async (req, res) => {
    res.setHeader('Content-Type', 'application/json');

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { sesion_id, usuario_email, usuario_nombre, usuario_curp } = req.body;

    // Validar inputs
    if (!sesion_id || !usuario_email || !usuario_nombre) {
        return res.status(400).json({
            error: 'Faltan campos requeridos'
        });
    }

    try {
        // 1. Obtener sesión
        const { data: sesion, error: errorSesion } = await supabase
            .from('sesiones_alineacion')
            .select('*')
            .eq('id', sesion_id)
            .single();

        if (errorSesion || !sesion) {
            return res.status(404).json({ error: 'Sesión no encontrada' });
        }

        // 2. Verificar que no esté llena
        const { count: inscritos } = await supabase
            .from('inscripciones_alineacion')
            .select('id', { count: 'exact', head: true })
            .eq('sesion_id', sesion_id)
            .eq('estado_inscripcion', 'confirmada');

        if (inscritos >= sesion.capacidad_maxima) {
            return res.status(409).json({
                error: 'La sesión está llena',
                inscritos,
                capacidad: sesion.capacidad_maxima
            });
        }

        // 3. Verificar que el usuario no esté ya inscrito
        const { data: inscripcionExistente } = await supabase
            .from('inscripciones_alineacion')
            .select('id')
            .eq('sesion_id', sesion_id)
            .eq('usuario_email', usuario_email)
            .eq('estado_inscripcion', 'confirmada')
            .single();

        if (inscripcionExistente) {
            return res.status(409).json({
                error: 'Ya estás inscrito en esta sesión'
            });
        }

        // 4. Agregar usuario como invitado en Google Calendar
        let googleEventAttendeeId = null;
        let googleMeetLink = sesion.google_meet_link;

        if (sesion.google_event_id) {
            try {
                const attendeeRes = await calendar.events.update({
                    calendarId: process.env.GOOGLE_CALENDAR_ID,
                    eventId: sesion.google_event_id,
                    requestBody: {
                        attendees: {
                            email: usuario_email,
                            displayName: usuario_nombre,
                            responseStatus: 'needsAction'
                        }
                    },
                    sendUpdates: 'all' // Envía invitación a Google Calendar
                });

                // Obtener Google Meet link si no lo tenemos
                if (!googleMeetLink && attendeeRes.data.conferenceData) {
                    googleMeetLink = attendeeRes.data.conferenceData
                        .entryPoints?.find(ep => ep.entryPointType === 'video')?.uri;
                }

                googleEventAttendeeId = usuario_email;
            } catch (googleError) {
                console.error('Error agregando a Google Calendar:', googleError);
                // No fallar la inscripción si Google Calendar falla
                // pero loguear el error
            }
        }

        // 5. Crear inscripción en Supabase
        const { data: inscripcion, error: errorInscripcion } = await supabase
            .from('inscripciones_alineacion')
            .insert([
                {
                    sesion_id,
                    usuario_email,
                    usuario_nombre,
                    usuario_curp: usuario_curp || null,
                    google_event_attendee_id: googleEventAttendeeId
                }
            ])
            .select()
            .single();

        if (errorInscripcion) {
            console.error('Error creando inscripción:', errorInscripcion);
            return res.status(500).json({
                error: 'Error al crear inscripción',
                details: errorInscripcion.message
            });
        }

        // 6. Enviar email de confirmación (asincrónico)
        enviarEmailConfirmacion(inscripcion, sesion, googleMeetLink)
            .catch(err => console.error('Error enviando email:', err));

        res.status(200).json({
            success: true,
            inscripcion_id: inscripcion.id,
            google_meet_link: googleMeetLink || 'Se enviará por email',
            mensaje: `¡Inscripción confirmada! Recibirás un email con el link de Google Meet`,
            sesion_fecha: sesion.fecha,
            sesion_hora: `${sesion.hora_inicio} - ${sesion.hora_fin}`
        });
    } catch (error) {
        console.error('Error en /api/inscribir-alineacion:', error);
        res.status(500).json({
            error: 'Error procesando inscripción',
            message: error.message
        });
    }
};

/**
 * Enviar email de confirmación de inscripción
 */
async function enviarEmailConfirmacion(inscripcion, sesion, googleMeetLink) {
    // Aquí integrarás tu servicio de emails (SendGrid, Resend, etc.)
    // Por ahora, un placeholder

    const emailHtml = `
        <h2>¡Inscripción Confirmada!</h2>
        <p>Hola ${inscripcion.usuario_nombre},</p>
        <p>Tu inscripción a la <strong>Sesión de Alineación EC1375</strong> ha sido confirmada.</p>

        <h3>📅 Detalles de la Sesión:</h3>
        <ul>
            <li><strong>Fecha:</strong> ${sesion.fecha}</li>
            <li><strong>Hora:</strong> ${sesion.hora_inicio} - ${sesion.hora_fin}</li>
            <li><strong>Instructor:</strong> ${sesion.instructor_nombre || 'Por confirmar'}</li>
            <li><strong>Google Meet:</strong> ${googleMeetLink ? `<a href="${googleMeetLink}">${googleMeetLink}</a>` : 'Se enviará 1 hora antes'}</li>
        </ul>

        <h3>✅ Próximos Pasos:</h3>
        <ol>
            <li>Asegúrate de tener cámara y micrófono funcionando</li>
            <li>Revisa tu conexión a internet</li>
            <li>Entra 5 minutos antes del horario</li>
        </ol>

        <p style="color: #888; font-size: 0.9em; margin-top: 30px;">
            Si tienes dudas, escríbenos por WhatsApp:
            <a href="https://wa.me/528115026729">+52 811 5026729</a>
        </p>
    `;

    // TODO: Integrar con tu servicio de emails
    // await sendEmail({
    //     to: inscripcion.usuario_email,
    //     subject: '✓ Inscripción Confirmada - Sesión de Alineación EC1375',
    //     html: emailHtml
    // });

    console.log('Email a enviar a:', inscripcion.usuario_email);
    console.log('Sesión:', sesion.fecha, sesion.hora_inicio);

    // Por ahora, guardar en BD que intenta enviar
    await supabase.from('emails_enviados_alineacion').insert([
        {
            inscripcion_id: inscripcion.id,
            tipo_email: 'confirmacion',
            destinatario: inscripcion.usuario_email,
            asunto: '✓ Inscripción Confirmada - Sesión de Alineación EC1375',
            estado_envio: 'pendiente' // Cambiar a 'enviado' cuando integres servicio
        }
    ]);
}
