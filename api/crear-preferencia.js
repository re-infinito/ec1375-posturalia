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

const SUPABASE_URL = 'https://yvgwothpkclljrdojtiv.supabase.co';
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

async function obtenerTotalAcordado(email) {
    const resp = await fetch(
        `${SUPABASE_URL}/rest/v1/candidatos_precio?email=eq.${encodeURIComponent(email)}&select=total_acordado`,
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
    return rows.length > 0 ? Number(rows[0].total_acordado) : 14750;
}

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }

    try {
        const { email, fase } = req.body || {};
        const emailNormalizado = (email || '').trim().toLowerCase();

        if (!emailNormalizado || !emailNormalizado.includes('@')) {
            res.status(400).json({ error: 'Correo inválido' });
            return;
        }
        if (!PORCENTAJE_FASE[fase]) {
            res.status(400).json({ error: 'Fase inválida' });
            return;
        }

        const totalAcordado = await obtenerTotalAcordado(emailNormalizado);
        const monto = Math.round(totalAcordado * PORCENTAJE_FASE[fase] * 100) / 100;

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
                        quantity: 1,
                        currency_id: 'MXN',
                        unit_price: monto
                    }
                ],
                payer: { email: emailNormalizado },
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
