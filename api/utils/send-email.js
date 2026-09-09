/**
 * Utility para enviar emails usando Resend
 * Centraliza la lógica de envío y manejo de errores
 */

const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

const SENDER_EMAIL = 'noreply@ec1375.paideia.tech';
const SENDER_NAME = 'Paideia Tech - EC1375';

/**
 * Enviar email de confirmación de inscripción
 */
async function enviarConfirmacionInscripcion(inscripcion, sesion, googleMeetLink) {
    const emailHtml = `
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: linear-gradient(135deg, #0088FF 0%, #00CCFF 100%); color: white; padding: 30px; border-radius: 8px 8px 0 0; text-align: center; }
                .header h1 { margin: 0; font-size: 24px; }
                .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
                .sesion-details { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #0088FF; }
                .detail-row { display: flex; justify-content: space-between; margin: 10px 0; }
                .detail-label { font-weight: 600; color: #555; }
                .detail-value { color: #0088FF; font-weight: 600; }
                .cta-button { display: inline-block; background: #0088FF; color: white; padding: 15px 30px; border-radius: 8px; text-decoration: none; font-weight: 600; margin: 20px 0; }
                .footer { text-align: center; color: #888; font-size: 12px; margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; }
                .whatsapp-link { color: #25D366; text-decoration: none; font-weight: 600; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>✓ ¡Inscripción Confirmada!</h1>
                </div>
                <div class="content">
                    <p>Hola <strong>${inscripcion.usuario_nombre}</strong>,</p>

                    <p>Tu inscripción a la <strong>Sesión de Alineación EC1375</strong> ha sido confirmada. Te estamos esperando.</p>

                    <div class="sesion-details">
                        <h3 style="margin-top: 0; color: #0088FF;">📅 Detalles de tu Sesión</h3>
                        <div class="detail-row">
                            <span class="detail-label">📆 Fecha:</span>
                            <span class="detail-value">${formatearFecha(sesion.fecha)}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">🕐 Hora:</span>
                            <span class="detail-value">${sesion.hora_inicio} - ${sesion.hora_fin}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">👨‍🏫 Instructor:</span>
                            <span class="detail-value">${sesion.instructor_nombre || 'Por confirmar'}</span>
                        </div>
                        ${googleMeetLink ? `
                        <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #eee;">
                            <p style="margin: 0 0 10px 0; color: #555;">🎥 Google Meet:</p>
                            <a href="${googleMeetLink}" class="cta-button" style="display: block; text-align: center;">Unirme a la sesión</a>
                        </div>
                        ` : ''}
                    </div>

                    <h3 style="color: #0088FF;">✅ Próximos Pasos</h3>
                    <ol>
                        <li>Asegúrate de tener <strong>cámara y micrófono funcionando</strong></li>
                        <li>Revisa tu <strong>conexión a internet</strong></li>
                        <li><strong>Entra 5 minutos antes</strong> del horario</li>
                        <li>Ten a mano tus apuntes del Autodiagnóstico</li>
                    </ol>

                    <p style="background: #fff3cd; padding: 15px; border-radius: 8px; border-left: 4px solid #FFD700;">
                        <strong>⏰ Recordatorio:</strong> Te enviaremos un email 24 horas antes con un recordatorio, y otro 1 hora antes con el link de Google Meet.
                    </p>

                    <p style="margin-top: 30px; color: #666;">
                        ¿Dudas o necesitas cambiar de horario? Escríbenos por WhatsApp:
                        <a href="https://wa.me/528115026729" class="whatsapp-link">+52 811 5026729</a>
                    </p>
                </div>

                <div class="footer">
                    <p>© 2026 Paideia Tech - EC1375<br>Este es un correo automático, no responder a este email.</p>
                </div>
            </div>
        </body>
        </html>
    `;

    try {
        const response = await resend.emails.send({
            from: `${SENDER_NAME} <${SENDER_EMAIL}>`,
            to: inscripcion.usuario_email,
            subject: `✓ Inscripción Confirmada - Sesión de Alineación EC1375 (${formatearFecha(sesion.fecha)})`,
            html: emailHtml
        });

        return {
            success: true,
            email_id: response.id,
            tipo: 'confirmacion'
        };
    } catch (error) {
        console.error('Error enviando confirmación:', error);
        throw error;
    }
}

/**
 * Enviar recordatorio 24 horas antes
 */
async function enviarRecordatorio24h(inscripcion, sesion, googleMeetLink) {
    const emailHtml = `
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <style>
                body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: linear-gradient(135deg, #FFD700 0%, #FFC700 100%); color: #333; padding: 20px; border-radius: 8px; text-align: center; }
                .content { background: #f9f9f9; padding: 30px; margin-top: 20px; border-radius: 8px; }
                .cta-button { display: inline-block; background: #0088FF; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h2>📅 ¡Tu Sesión es Mañana!</h2>
                </div>
                <div class="content">
                    <p>Hola ${inscripcion.usuario_nombre},</p>

                    <p>Nos complace recordarte que <strong>mañana a las ${sesion.hora_inicio}</strong> tendrás tu sesión de Alineación EC1375.</p>

                    <div style="background: white; padding: 20px; border-radius: 8px; border-left: 4px solid #0088FF; margin: 20px 0;">
                        <h3 style="margin-top: 0; color: #0088FF;">📅 ${formatearFecha(sesion.fecha)}</h3>
                        <p><strong>Hora:</strong> ${sesion.hora_inicio} - ${sesion.hora_fin}</p>
                        <p><strong>Instructor:</strong> ${sesion.instructor_nombre || 'Por confirmar'}</p>
                    </div>

                    <h3 style="color: #0088FF;">✅ Cosas que Verificar Hoy</h3>
                    <ul>
                        <li>✓ Cámara funcionando correctamente</li>
                        <li>✓ Micrófono sin problemas</li>
                        <li>✓ Conexión a internet estable</li>
                        <li>✓ Ten a mano tus apuntes</li>
                    </ul>

                    ${googleMeetLink ? `
                    <p style="text-align: center; margin: 30px 0;">
                        <a href="${googleMeetLink}" class="cta-button">🎥 Ir a Google Meet</a>
                    </p>
                    ` : ''}

                    <p style="color: #666; font-size: 14px;">
                        Recuerda: entra 5 minutos antes del horario programado. ¡Nos vemos mañana!
                    </p>
                </div>
            </div>
        </body>
        </html>
    `;

    try {
        const response = await resend.emails.send({
            from: `${SENDER_NAME} <${SENDER_EMAIL}>`,
            to: inscripcion.usuario_email,
            subject: `📅 Recordatorio: Tu Sesión es Mañana a las ${sesion.hora_inicio}`,
            html: emailHtml
        });

        return {
            success: true,
            email_id: response.id,
            tipo: 'recordatorio_24h'
        };
    } catch (error) {
        console.error('Error enviando recordatorio 24h:', error);
        throw error;
    }
}

/**
 * Enviar recordatorio 1 hora antes
 */
async function enviarRecordatorio1h(inscripcion, sesion, googleMeetLink) {
    const emailHtml = `
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <style>
                body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: linear-gradient(135deg, #FF6B6B 0%, #FF5252 100%); color: white; padding: 20px; border-radius: 8px; text-align: center; }
                .content { background: #f9f9f9; padding: 30px; margin-top: 20px; border-radius: 8px; }
                .cta-button { display: block; background: #0088FF; color: white; padding: 15px; border-radius: 8px; text-decoration: none; font-weight: 600; text-align: center; font-size: 16px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h2>🔔 ¡Comienza en 1 Hora!</h2>
                </div>
                <div class="content">
                    <p style="font-size: 18px; font-weight: 600; color: #0088FF;">Tu sesión comienza en <strong>1 hora</strong> a las ${sesion.hora_inicio}</p>

                    ${googleMeetLink ? `
                    <div style="margin: 30px 0;">
                        <a href="${googleMeetLink}" class="cta-button">🎥 UNIRME A GOOGLE MEET AHORA</a>
                    </div>
                    ` : ''}

                    <div style="background: #fff3cd; padding: 15px; border-radius: 8px; border-left: 4px solid #FFD700; margin: 20px 0;">
                        <p style="margin: 0; color: #856404;"><strong>⏰ Importante:</strong> Entra 5 minutos antes. La sesión no espera.</p>
                    </div>

                    <p style="color: #666; font-size: 14px; text-align: center;">
                        ¿Problemas técnicos? Escríbenos por WhatsApp: <a href="https://wa.me/528115026729" style="color: #25D366; font-weight: 600;">+52 811 5026729</a>
                    </p>
                </div>
            </div>
        </body>
        </html>
    `;

    try {
        const response = await resend.emails.send({
            from: `${SENDER_NAME} <${SENDER_EMAIL}>`,
            to: inscripcion.usuario_email,
            subject: `🔔 ¡Comienza en 1 Hora! - Sesión de Alineación EC1375`,
            html: emailHtml
        });

        return {
            success: true,
            email_id: response.id,
            tipo: 'recordatorio_1h'
        };
    } catch (error) {
        console.error('Error enviando recordatorio 1h:', error);
        throw error;
    }
}

/**
 * Utility para formatear fecha
 */
function formatearFecha(fechaISO) {
    const opciones = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    return new Date(fechaISO + 'T00:00:00').toLocaleDateString('es-MX', opciones);
}

module.exports = {
    enviarConfirmacionInscripcion,
    enviarRecordatorio24h,
    enviarRecordatorio1h
};
