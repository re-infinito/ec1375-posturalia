/**
 * POST /api/eliminar-evento-google
 * Elimina un evento de Google Calendar por su ID.
 * Body: { eventId }
 * Retorna: { success }
 *
 * Usado por eliminarSesion() en admin-sesiones.html antes de borrar la fila
 * en Supabase, para no dejar el evento huérfano en el calendario (mismo
 * problema, en sentido inverso, que el de crear-evento-google.js cuando el
 * insert en Supabase fallaba después de crear el evento).
 */

const { google } = require('googleapis');

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

    const { eventId } = req.body;

    if (!eventId) {
        return res.status(400).json({ error: 'Falta eventId' });
    }

    try {
        const calendar = getCalendarClient();
        await calendar.events.delete({
            calendarId: process.env.GOOGLE_CALENDAR_ID,
            eventId,
            sendUpdates: 'none'
        });

        res.status(200).json({ success: true });
    } catch (error) {
        console.error('Error en /api/eliminar-evento-google:', error);

        // El evento ya no existe (borrado a mano, o ya se había limpiado
        // antes) — no es un error real desde el punto de vista de quien
        // quiere eliminar la sesión, así que se reporta como éxito.
        if (error.code === 404 || (error.message && error.message.includes('Not Found'))) {
            return res.status(200).json({ success: true, mensaje: 'El evento ya no existía en Google Calendar' });
        }

        res.status(500).json({
            error: 'Error eliminando evento de Google Calendar',
            message: error.message
        });
    }
};
