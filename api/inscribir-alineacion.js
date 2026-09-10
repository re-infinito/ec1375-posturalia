/**
 * POST /api/inscribir-alineacion
 * Inscribe un usuario a una sesión de alineación
 * Body: { sesion_id, usuario_email, usuario_nombre, usuario_curp }
 * Retorna: { success, inscripcion_id, google_meet_link, mensaje }
 */

const { createClient } = require('@supabase/supabase-js');
const { google } = require('googleapis');
const { enviarConfirmacionInscripcion } = require('./utils/send-email');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// GOOGLE_CALENDAR_KEY_FILE contiene el JSON completo de la Service
// Account (no una ruta de archivo — ver api/crear-evento-google.js para
// el detalle). Se construye por request, dentro del try/catch que ya
// envuelve la llamada a Google Calendar más abajo, para que un env var
// faltante o mal formado quede registrado en logs en vez de fallar en
// silencio (antes: 'keyFile' apuntando a una ruta local inexistente en
// Vercel hacía que calendar.events.update() fallara siempre, y el
// catch interno se lo tragaba sin agregar nunca al invitado).
function getCalendarClient() {
    const raw = process.env.GOOGLE_CALENDAR_KEY_FILE;
    if (!raw) throw new Error('GOOGLE_CALENDAR_KEY_FILE no está configurada');
    const credentials = JSON.parse(raw);
    const googleAuth = new google.auth.GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/calendar']
    });
    return google.calendar({ version: 'v3', auth: googleAuth });
}

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
                const calendar = getCalendarClient();

                // events.patch() reemplaza por completo el campo `attendees`
                // que se le pase (no hace merge) — hay que leer los
                // invitados actuales del evento y añadir el nuevo, si no
                // cada inscripción pisaría a las anteriores en una sesión
                // grupal en vez de sumarse.
                const eventoActual = await calendar.events.get({
                    calendarId: process.env.GOOGLE_CALENDAR_ID,
                    eventId: sesion.google_event_id
                });
                const attendeesActuales = eventoActual.data.attendees || [];
                const yaEsInvitado = attendeesActuales.some(a => a.email === usuario_email);
                const nuevosAttendees = yaEsInvitado
                    ? attendeesActuales
                    : [...attendeesActuales, { email: usuario_email, displayName: usuario_nombre, responseStatus: 'needsAction' }];

                const attendeeRes = await calendar.events.patch({
                    calendarId: process.env.GOOGLE_CALENDAR_ID,
                    eventId: sesion.google_event_id,
                    requestBody: { attendees: nuevosAttendees },
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

        // 6. Enviar email de confirmación (asincrónico, no bloquea la inscripción)
        enviarEmailConfirmacion(inscripcion, sesion, googleMeetLink)
            .catch(err => {
                console.error('Error enviando email de confirmación:', err);
                // Error de email no falla la inscripción, pero lo registramos
            });

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
 * Enviar email de confirmación de inscripción vía Resend
 */
async function enviarEmailConfirmacion(inscripcion, sesion, googleMeetLink) {
    try {
        const resultado = await enviarConfirmacionInscripcion(inscripcion, sesion, googleMeetLink);

        // Registrar en auditoría que fue enviado
        await supabase.from('emails_enviados_alineacion').insert([
            {
                inscripcion_id: inscripcion.id,
                tipo_email: 'confirmacion',
                destinatario: inscripcion.usuario_email,
                asunto: `✓ Inscripción Confirmada - Sesión de Alineación EC1375 (${sesion.fecha})`,
                fecha_envio: new Date().toISOString(),
                estado_envio: 'enviado',
                email_id_resend: resultado.email_id
            }
        ]);

        console.log('✓ Email de confirmación enviado a:', inscripcion.usuario_email);
        return resultado;
    } catch (error) {
        console.error('Error enviando email:', error);

        // Registrar en auditoría que falló
        await supabase.from('emails_enviados_alineacion').insert([
            {
                inscripcion_id: inscripcion.id,
                tipo_email: 'confirmacion',
                destinatario: inscripcion.usuario_email,
                asunto: `✓ Inscripción Confirmada - Sesión de Alineación EC1375 (${sesion.fecha})`,
                fecha_envio: new Date().toISOString(),
                estado_envio: 'fallido',
                error_mensaje: error.message
            }
        ]);

        throw error;
    }
}
