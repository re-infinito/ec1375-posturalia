/**
 * POST /api/crear-evento-google
 * Crea un evento en Google Calendar con Google Meet automático
 * Body: { fecha, horaInicio, horaFin, instructor }
 * Retorna: { google_event_id, google_meet_link, success }
 */

const { google } = require('googleapis');

// GOOGLE_CALENDAR_KEY_FILE debe contener el JSON completo de la Service
// Account (no una ruta de archivo) — Vercel no tiene un filesystem
// persistente donde exista un .json subido a mano. Se construye el
// cliente por request, dentro del try/catch de abajo, para que un env
// var faltante o mal formado devuelva un 500 en JSON en vez de tumbar
// toda la function serverless al arrancar (era la causa del "A server
// error has occurred" que no era JSON válido).
function getCalendarClient() {
    const raw = process.env.GOOGLE_CALENDAR_KEY_FILE;
    if (!raw) {
        throw new Error('GOOGLE_CALENDAR_KEY_FILE no está configurada');
    }
    let credentials;
    try {
        credentials = JSON.parse(raw);
    } catch (e) {
        throw new Error('GOOGLE_CALENDAR_KEY_FILE no contiene un JSON válido de credenciales de Service Account');
    }
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

    const { fecha, horaInicio, horaFin, instructor } = req.body;

    // Validar inputs
    if (!fecha || !horaInicio || !horaFin) {
        return res.status(400).json({
            error: 'Faltan campos requeridos: fecha, horaInicio, horaFin'
        });
    }

    try {
        const calendar = getCalendarClient();

        // Convertir a datetime ISO para Google Calendar
        // fecha es YYYY-MM-DD, horaInicio es HH:MM
        const startDateTime = new Date(`${fecha}T${horaInicio}:00`).toISOString();
        const endDateTime = new Date(`${fecha}T${horaFin}:00`).toISOString();

        // Crear evento en Google Calendar
        const event = {
            summary: `Sesión de Alineación EC1375${instructor ? ` - ${instructor}` : ''}`,
            description: `Sesión de alineación (capacitación) del programa EC1375.\nInstructor: ${instructor || 'Por confirmar'}`,
            start: {
                dateTime: startDateTime,
                timeZone: 'America/Mexico_City'
            },
            end: {
                dateTime: endDateTime,
                timeZone: 'America/Mexico_City'
            },
            conferenceData: {
                createRequest: {
                    requestId: `ec1375-${Date.now()}`,
                    conferenceSolutionKey: {
                        key: 'hangoutsMeet'
                    }
                }
            },
            transparency: 'transparent', // No bloquea el calendario
            visibility: 'public'
        };

        const response = await calendar.events.insert({
            calendarId: process.env.GOOGLE_CALENDAR_ID,
            requestBody: event,
            conferenceDataVersion: 1,
            sendUpdates: 'none' // No enviar notificaciones en creación
        });

        // Extraer el Google Meet link
        let googleMeetLink = null;
        if (response.data.conferenceData && response.data.conferenceData.entryPoints) {
            const videoEntry = response.data.conferenceData.entryPoints
                .find(ep => ep.entryPointType === 'video');
            if (videoEntry) {
                googleMeetLink = videoEntry.uri;
            }
        }

        // Si no hay Google Meet link, usar el URL del evento
        if (!googleMeetLink) {
            googleMeetLink = response.data.hangoutLink || response.data.htmlLink;
        }

        res.status(200).json({
            success: true,
            google_event_id: response.data.id,
            google_meet_link: googleMeetLink,
            event_url: response.data.htmlLink,
            mensaje: 'Evento creado exitosamente en Google Calendar'
        });

    } catch (error) {
        console.error('Error en /api/crear-evento-google:', error);

        // Error de autenticación
        if (error.message && error.message.includes('401')) {
            return res.status(401).json({
                error: 'Error de autenticación con Google Calendar',
                message: 'Verifica que la Service Account tiene permisos'
            });
        }

        res.status(500).json({
            error: 'Error creando evento en Google Calendar',
            message: error.message
        });
    }
};
