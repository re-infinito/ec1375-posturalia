// Webhook de Mercado Pago — primera función backend del proyecto (el resto
// del sitio sigue siendo HTML estático). Recibe la notificación de pago,
// valida su firma, consulta el pago completo, y si está aprobado autoriza
// la fase correspondiente en `candidatos_fase_pagos` (Supabase) para que
// esa persona pueda avanzar en el sitio — ver auth.js / Claude.md
// (Fase 2: gate de pago; Fase 4: gate por fase con monto dinámico).
//
// Qué fase autorizar sale de `external_reference` (formato "email|fase"),
// que pone api/crear-preferencia.js al generar el link de pago de las
// fases nuevas (Alineación/Evaluación/Entrega). El Payment Link estático
// original (Registro/Apartado, mpago.la/1QeeSHo) no manda external_reference
// — para ese caso se asume fase 'registro', que es lo único que ese link
// vende.
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

const FASES_VALIDAS = ['registro', 'alineacion', 'evaluacion', 'entrega'];

// external_reference viene como "email|fase" (ver api/crear-preferencia.js).
// Si no hay external_reference (el Payment Link estático original no lo
// manda), se asume 'registro' — es lo único que vende ese link.
function extraerEmailYFase(payment) {
    const email = (payment.payer && payment.payer.email || '').trim().toLowerCase();
    const ref = payment.external_reference || '';
    const [refEmail, refFase] = ref.split('|');
    const fase = FASES_VALIDAS.includes(refFase) ? refFase : 'registro';
    return { email: (refEmail || email).trim().toLowerCase(), fase };
}

async function authorizeFase(email, fase, paymentId, monto) {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/candidatos_fase_pagos`, {
        method: 'POST',
        headers: {
            apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
            Prefer: 'resolution=merge-duplicates'
        },
        body: JSON.stringify({
            email,
            fase,
            payment_id: String(paymentId),
            monto,
            origen: 'mercadopago'
        })
    });
    if (!resp.ok) {
        console.error('No se pudo autorizar la fase en Supabase:', await resp.text());
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
            const { email, fase } = extraerEmailYFase(payment);
            await authorizeFase(email, fase, dataId, payment.transaction_amount);
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
