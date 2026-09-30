/**
 * Utility para enviar emails usando Resend
 * Centraliza la lógica de envío y manejo de errores
 */

const { Resend } = require('resend');

// El SDK de Resend lanza una excepción síncrona en el constructor si falta
// la key ("Missing API key..."). Construirlo a nivel de módulo (como antes)
// tumbaría, con un crash no capturado, CUALQUIER endpoint que haga
// require('./utils/send-email') — inscribir-alineacion.js y
// enviar-recordatorios.js entre ellos — incluso en la ruta que no manda
// ningún email. Se construye una sola vez, perezosamente, en el primer uso.
let resend = null;
function getResendClient() {
    if (!resend) {
        if (!process.env.RESEND_API_KEY) {
            throw new Error('RESEND_API_KEY no está configurada');
        }
        resend = new Resend(process.env.RESEND_API_KEY);
    }
    return resend;
}

const SENDER_EMAIL = 'noreply@paideiatech.com';
const SENDER_NAME = 'Paideia Tech - EC1375';

/**
 * Enviar email de confirmación de inscripción
 */
async function enviarConfirmacionInscripcion(inscripcion, sesion, zoomLink) {
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
                        ${zoomLink ? `
                        <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #eee;">
                            <p style="margin: 0 0 10px 0; color: #555;">🎥 Zoom:</p>
                            <a href="${zoomLink}" class="cta-button" style="display: block; text-align: center;">Unirme a la sesión</a>
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
                        <strong>⏰ Recordatorio:</strong> Te enviaremos un email 24 horas antes con un recordatorio, y otro 1 hora antes con el link de Zoom.
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
        const response = await getResendClient().emails.send({
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
async function enviarRecordatorio24h(inscripcion, sesion, zoomLink) {
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

                    ${zoomLink ? `
                    <p style="text-align: center; margin: 30px 0;">
                        <a href="${zoomLink}" class="cta-button">🎥 Ir a Zoom</a>
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
        const response = await getResendClient().emails.send({
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
async function enviarRecordatorio1h(inscripcion, sesion, zoomLink) {
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

                    ${zoomLink ? `
                    <div style="margin: 30px 0;">
                        <a href="${zoomLink}" class="cta-button">🎥 UNIRME A ZOOM AHORA</a>
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
        const response = await getResendClient().emails.send({
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


/**
 * Recordatorio de la sesión de evidencia (24 h / 2 h / 1 h antes).
 *
 * OJO: este correo NUNCA lleva el enlace de la sala. Todo el diseño de la sala
 * se sostiene en que el enlace solo lo entrega el servidor al dueño del
 * horario y dentro de su ventana; mandarlo por correo lo volvería reenviable
 * y tiraría esa garantía. El correo dice DÓNDE aparece el botón, no cuál es.
 */
async function enviarRecordatorioSala({ email, nombre, clave, fechaLarga, rango, minutosAntes, sitio }) {
    const R = require('./recordatorios');
    const t = R.textoAviso(clave);
    const saludo = nombre ? `Hola ${nombre},` : 'Hola,';
    const antes = Number(minutosAntes) || 30;

    // Con 24 h por delante todavía puede moverla solo; después ya no.
    const puedeMover = clave === '24h';
    const cierre = puedeMover
        ? `¿Se te atravesó algo? Todavía puedes cambiar o cancelar tu horario desde tu Plan de Evaluación, hasta 24 horas antes.`
        : `¿Se te atravesó algo? Escríbenos por WhatsApp y lo resolvemos contigo.`;

    const emailHtml = `
        <!DOCTYPE html>
        <html lang="es">
        <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
        <body style="margin:0;padding:0;background:#F0ECE3;">
          <div style="max-width:560px;margin:0 auto;padding:32px 24px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#1A2030;line-height:1.55;">

            <p style="margin:0 0 6px;font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#7A5D14;">Paideia Tech &middot; Certificación EC1375</p>
            <h1 style="margin:0 0 18px;font-size:26px;line-height:1.25;color:#1A2030;font-weight:600;">Tu sesión de evidencia es ${t.cuando}</h1>

            <p style="margin:0 0 18px;font-size:16px;">${saludo}</p>
            <p style="margin:0 0 22px;font-size:16px;color:#4A5260;">Este es el recordatorio de la sesión que vas a grabar con tu usuario. Es la evidencia principal que revisa el Centro Evaluador.</p>

            <div style="background:#1C2644;color:#E2DCD0;padding:20px 24px;margin:0 0 24px;">
              <p style="margin:0 0 4px;font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:#C8A870;">Tu horario</p>
              <p style="margin:0;font-size:19px;color:#F4F1EA;font-weight:600;">${fechaLarga}</p>
              <p style="margin:4px 0 0;font-size:17px;color:#E2DCD0;">${rango}</p>
            </div>

            <p style="margin:0 0 8px;font-size:16px;font-weight:600;">Cómo entras</p>
            <p style="margin:0 0 22px;font-size:16px;color:#4A5260;">El botón <strong style="color:#1A2030;">Entrar a la sala</strong> se enciende solo, <strong style="color:#1A2030;">${antes} minutos antes</strong> de tu horario, en <em>Documentos de Sesión</em> y en el <em>Guion Maestro</em>. No tienes que pedirle el enlace a nadie.</p>

            <p style="margin:0 0 8px;font-size:16px;font-weight:600;">Ten listo</p>
            <p style="margin:0 0 22px;font-size:16px;color:#4A5260;">Tu usuario, tu espacio y el equipo que pide tu Plan. Abre el Guion Maestro antes de entrar: ahí viene paso por paso qué decir y qué hacer. La sala graba sola, no tienes que oprimir nada.</p>

            <p style="margin:0 0 26px;">
              <a href="${sitio}/panel.html" style="display:inline-block;background:#1C2644;color:#F4F1EA;padding:13px 26px;text-decoration:none;font-size:15px;font-weight:600;">Abrir mi panel</a>
            </p>

            <p style="margin:0 0 26px;font-size:15px;color:#4A5260;border-left:3px solid #C8A870;padding-left:14px;">${cierre}</p>

            <p style="margin:0;padding-top:18px;border-top:1px solid #CAC4B4;font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:#6E6754;">
              WhatsApp 81 1502 6729 &nbsp;&middot;&nbsp; contacto@paideiatech.com
            </p>
          </div>
        </body>
        </html>
    `;

    const response = await getResendClient().emails.send({
        from: `${SENDER_NAME} <${SENDER_EMAIL}>`,
        to: email,
        subject: `${t.asunto} — ${rango}`,
        html: emailHtml
    });
    return { success: true, email_id: response.id, tipo: `recordatorio_sala_${clave}` };
}

module.exports = {
    enviarConfirmacionInscripcion,
    enviarRecordatorio24h,
    enviarRecordatorio1h,
    enviarRecordatorioSala
};
