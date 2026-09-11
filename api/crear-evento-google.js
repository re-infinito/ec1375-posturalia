/**
 * POST /api/crear-evento-google
 * Crea un evento en Google Calendar. El link de Google Meet NO se genera
 * automáticamente: un Service Account (sin domain-wide delegation
 * impersonando a un usuario real de Workspace) no tiene permiso para crear
 * conferenceData — Google devuelve "Invalid conference data". Como
 * paideia.tech@outlook.com es una cuenta personal (no Workspace), esa
 * delegación ni siquiera es una opción disponible. En su lugar, el admin
 * crea el Meet una vez (p.ej. meet.google.com/new) y lo pega en el
 * formulario — se guarda tal cual como googleMeetLink.
 * Body: { fecha, horaInicio, horaFin, instructor, googleMeetLink? }
 * Retorna: { google_event_id, google_meet_link, event_url, success }
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

    const { fecha, horaInicio, horaFin, instructor, googleMeetLink } = req.body;

    // Validar inputs
    if (!fecha || !horaInicio || !horaFin) {
        return res.status(400).json({
            error: 'Faltan campos requeridos: fecha, horaInicio, horaFin'
        });
    }

    try {
        const calendar = getCalendarClient();

        // fecha es YYYY-MM-DD, horaInicio/horaFin son HH:MM.
        // OJO: no usar `new Date(...).toISOString()` aquí — Vercel corre en
        // UTC, así que new Date("2026-09-12T14:00:00") se interpreta como
        // 14:00 UTC, y toISOString() deja ese string marcado con "Z". Google
        // Calendar, si dateTime ya trae offset/Z, ignora el campo `timeZone`
        // que mandamos aparte y usa la hora tal cual como UTC — 14:00 UTC
        // termina mostrándose como 8:00am en México (UTC-6). El fix es pasar
        // la hora local en crudo, SIN offset, y dejar que timeZone (abajo)
        // la ancle correctamente a America/Mexico_City.
        const startDateTime = `${fecha}T${horaInicio}:00`;
        const endDateTime = `${fecha}T${horaFin}:00`;

        // Crear evento en Google Calendar (sin conferenceData — ver nota
        // arriba). Si el admin proporcionó un Meet link manual, se incluye
        // en la descripción y en location para que sea visible en el
        // evento también, no solo en nuestra propia BD.
        const event = {
            summary: `Sesión de Alineación EC1375${instructor ? ` - ${instructor}` : ''}`,
            description: `Sesión de alineación (capacitación) del programa EC1375.\nInstructor: ${instructor || 'Por confirmar'}${googleMeetLink ? `\nGoogle Meet: ${googleMeetLink}` : ''}`,
            start: {
                dateTime: startDateTime,
                timeZone: 'America/Mexico_City'
            },
            end: {
                dateTime: endDateTime,
                timeZone: 'America/Mexico_City'
            },
            ...(googleMeetLink ? { location: googleMeetLink } : {}),
            transparency: 'transparent', // No bloquea el calendario
            visibility: 'public'
        };

        const response = await calendar.events.insert({
            calendarId: process.env.GOOGLE_CALENDAR_ID,
            requestBody: event,
            sendUpdates: 'none' // No enviar notificaciones en creación
        });

        res.status(200).json({
            success: true,
            google_event_id: response.data.id,
            google_meet_link: googleMeetLink || null,
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
