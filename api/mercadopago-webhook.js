// Webhook de Mercado Pago — primera función backend del proyecto (el resto
// del sitio sigue siendo HTML estático). Recibe la notificación de pago,
// valida su firma, consulta el pago completo, y si está aprobado autoriza
// el correo del comprador en `candidatos_autorizados` (Supabase) para que
// pueda iniciar sesión en el sitio vía OTP — ver auth.js / Claude.md
// (sección "Persistencia con Supabase — v2", Fase 2: gate de pago).
//
// Variables de entorno requeridas (Vercel → Project Settings → Environment
// Variables, nunca en el código ni en el HTML):
//   MERCADOPAGO_ACCESS_TOKEN   — dashboard de Mercado Pago, credenciales de producción
//   MERCADOPAGO_WEBHOOK_SECRET — lo da Mercado Pago al configurar esta URL como webhook
//   SUPABASE_SERVICE_ROLE_KEY  — dashboard de Supabase, Project Settings → API
//
// Configurar en Mercado Pago (Tus integraciones → Webhooks): agregar esta
// URL en producción (https://<dominio>/api/mercadopago-webhook), suscribir
// al evento de pagos.

const crypto = require('crypto');

const SUPABASE_URL = 'https://yvgwothpkclljrdojtiv.supabase.co';

function verifySignature(req, dataId) {
    const signatureHeader = req.headers['x-signature'] || '';
    const requestId = req.headers['x-request-id'] || '';

    const parts = {};
    signatureHeader.split(',').forEach(chunk => {
        const [key, value] = chunk.split('=');
        if (key) parts[key.trim()] = (value || '').trim();
    });
    const ts = parts.ts;
    const v1 = parts.v1;
    if (!ts || !v1) return false;

    // Formato del manifest documentado por Mercado Pago para validar x-signature.
    const manifest = `id:${String(dataId).toLowerCase()};request-id:${requestId};ts:${ts};`;
    const expected = crypto
        .createHmac('sha256', process.env.MERCADOPAGO_WEBHOOK_SECRET || '')
        .update(manifest)
        .digest('hex');

    try {
        return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(v1));
    } catch (e) {
        return false; // longitudes distintas u otro formato inesperado
    }
}

async function authorizeEmail(email, paymentId, monto) {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/candidatos_autorizados`, {
        method: 'POST',
        headers: {
            apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
            Prefer: 'resolution=merge-duplicates'
        },
        body: JSON.stringify({
            email: email.trim().toLowerCase(),
            payment_id: String(paymentId),
            monto,
            origen: 'mercadopago'
        })
    });
    if (!resp.ok) {
        console.error('No se pudo autorizar el correo en Supabase:', await resp.text());
    }
}

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        res.status(405).send('Method not allowed');
        return;
    }

    try {
        const dataId =
            (req.query && req.query['data.id']) ||
            (req.body && req.body.data && req.body.data.id) ||
            (req.query && req.query.id);

        if (!dataId) {
            res.status(400).send('Missing data.id');
            return;
        }

        if (!verifySignature(req, dataId)) {
            res.status(401).send('Invalid signature');
            return;
        }

        const paymentResp = await fetch(`https://api.mercadopago.com/v1/payments/${dataId}`, {
            headers: { Authorization: `Bearer ${process.env.MERCADOPAGO_ACCESS_TOKEN}` }
        });
        if (!paymentResp.ok) {
            // No es un fallo de nuestro lado (p.ej. notificación de un ID viejo/de prueba) —
            // respondemos 200 para que Mercado Pago no reintente indefinidamente.
            res.status(200).send('OK (no se pudo obtener el pago)');
            return;
        }
        const payment = await paymentResp.json();

        if (payment.status === 'approved' && payment.payer && payment.payer.email) {
            await authorizeEmail(payment.payer.email, dataId, payment.transaction_amount);
        }

        res.status(200).send('OK');
    } catch (e) {
        console.error('Error en webhook de Mercado Pago:', e);
        // 200 igual: evita reintentos infinitos por un bug nuestro. El candidato
        // afectado siempre puede pedir activación manual por WhatsApp mientras
        // se investiga (ver auth.js → mensaje de "correo no autorizado").
        res.status(200).send('OK (error interno, revisar logs)');
    }
};
