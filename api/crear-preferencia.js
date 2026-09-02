// Crea una Preferencia de Mercado Pago con el monto dinámico de una fase
// del proceso (Fase 4: Registro/Alineación/Evaluación/Entrega). Reemplaza
// el Payment Link estático para estas fases porque el monto ya no es fijo
// — cada candidato negocia un total distinto (total_acordado en
// candidatos_precio) y cada fase cobra un % de ESE total, no un número
// igual para todos. Ver Claude.md / plan de Fase 4 para el contexto
// completo.
//
// Variables de entorno requeridas (las mismas que ya usa el webhook):
//   MERCADOPAGO_ACCESS_TOKEN
//   SUPABASE_SERVICE_ROLE_KEY

const SUPABASE_URL = 'https://numsuiuwrvpprhnxovmh.supabase.co';
const SITE_URL = 'https://sepconocer.paideiatech.com';

const PORCENTAJE_FASE = {
    registro: 0.15,
    alineacion: 0.30,
    evaluacion: 0.40,
    entrega: 0.15
};

const TITULO_FASE = {
    registro: 'Paideia Tech - Registro (Apartado)',
    alineacion: 'Paideia Tech - Alineación (Capacitación)',
    evaluacion: 'Paideia Tech - Evaluación',
    entrega: 'Paideia Tech - Entrega de Certificado'
};

const DESCRIPCION_FASE = {
    registro: 'Apartado de lugar — certificación EC1375, Paideia Tech',
    alineacion: 'Sesión de capacitación (Alineación) — certificación EC1375, Paideia Tech',
    evaluacion: 'Evaluación práctica — certificación EC1375, Paideia Tech',
    entrega: 'Trámite y entrega de certificado — certificación EC1375, Paideia Tech'
};

const COLUMNA_MONTO_FASE = {
    registro: 'monto_registro',
    alineacion: 'monto_alineacion',
    evaluacion: 'monto_evaluacion',
    entrega: 'monto_entrega'
};

// Prioriza el monto exacto por fase (editable desde admin-precios.html) —
// si no está capturado para esa fase, cae al % estándar del total_acordado
// (compatibilidad con candidatos que solo tienen el total configurado).
async function obtenerMontoFase(email, fase) {
    const resp = await fetch(
        `${SUPABASE_URL}/rest/v1/candidatos_precio?email=eq.${encodeURIComponent(email)}&select=total_acordado,monto_registro,monto_alineacion,monto_evaluacion,monto_entrega`,
        {
            headers: {
                apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
                Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
            }
        }
    );
    if (!resp.ok) throw new Error('No se pudo consultar candidatos_precio');
    const rows = await resp.json();
    // Sin fila todavía = candidato nuevo, usa el total estándar (mismo
    // default que la columna en Supabase) sin necesidad de crear la fila
    // por adelantado.
    if (rows.length === 0) return 14750 * PORCENTAJE_FASE[fase];

    const row = rows[0];
    const montoExacto = row[COLUMNA_MONTO_FASE[fase]];
    if (montoExacto !== null && montoExacto !== undefined) return Number(montoExacto);

    const totalAcordado = Number(row.total_acordado);
    return totalAcordado * PORCENTAJE_FASE[fase];
}

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }

    try {
        const { email, fase, nombre } = req.body || {};
        const emailNormalizado = (email || '').trim().toLowerCase();

        if (!emailNormalizado || !emailNormalizado.includes('@')) {
            res.status(400).json({ error: 'Correo inválido' });
            return;
        }
        if (!PORCENTAJE_FASE[fase]) {
            res.status(400).json({ error: 'Fase inválida' });
            return;
        }

        const montoBruto = await obtenerMontoFase(emailNormalizado, fase);
        const monto = Math.round(montoBruto * 100) / 100;

        // Mercado Pago recomienda mandar la mayor cantidad de datos posible
        // del comprador y del producto para que su motor antifraude tenga
        // más señales de que es una compra legítima — ver "improve-payment-
        // approval/recommendations" en sus docs. payer.name/surname es lo
        // único que tenemos disponible con confianza en este punto del flujo
        // (el candidato ya capturó su nombre en el Autodiagnóstico); no
        // mandamos teléfono/dirección/identification para no arriesgar un
        // valor mal formado que tumbe la creación de la preferencia entera.
        const payer = { email: emailNormalizado };
        const nombreLimpio = (nombre || '').trim();
        if (nombreLimpio) {
            const partes = nombreLimpio.split(/\s+/);
            payer.name = partes[0];
            if (partes.length > 1) payer.surname = partes.slice(1).join(' ');
        }

        const preferenceResp = await fetch('https://api.mercadopago.com/checkout/preferences', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${process.env.MERCADOPAGO_ACCESS_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                items: [
                    {
                        title: TITULO_FASE[fase],
                        description: DESCRIPCION_FASE[fase],
                        category_id: 'services',
                        quantity: 1,
                        currency_id: 'MXN',
                        unit_price: monto
                    }
                ],
                payer,
                // El webhook lee esto para saber qué fase autorizar — ver
                // api/mercadopago-webhook.js.
                external_reference: `${emailNormalizado}|${fase}`,
                back_urls: {
                    success: `${SITE_URL}/success.html`,
                    failure: `${SITE_URL}/failure.html`,
                    pending: `${SITE_URL}/pending.html`
                },
                auto_return: 'approved'
            })
        });

        if (!preferenceResp.ok) {
            const detalle = await preferenceResp.text();
            console.error('Error creando preferencia de Mercado Pago:', detalle);
            res.status(502).json({ error: 'No se pudo crear el link de pago' });
            return;
        }

        const preference = await preferenceResp.json();
        res.status(200).json({ init_point: preference.init_point, monto });
    } catch (e) {
        console.error('Error en crear-preferencia:', e);
        res.status(500).json({ error: 'Error interno' });
    }
};
