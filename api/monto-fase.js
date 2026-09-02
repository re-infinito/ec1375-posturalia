// Devuelve el monto exacto (en MXN) que le corresponde a un candidato en una
// fase, sin crear una Preferencia de Mercado Pago — usado para mostrar el
// número real en el botón de pago y en la tarjeta de transferencia bancaria
// manual, en vez de mandar al candidato a adivinar o preguntar por WhatsApp.
// Misma lógica de cálculo que api/crear-preferencia.js (duplicada aquí
// a propósito — es corta, y así este endpoint no depende de crear una
// preferencia real solo para leer un número).

const SUPABASE_URL = 'https://numsuiuwrvpprhnxovmh.supabase.co';

const PORCENTAJE_FASE = {
    registro: 0.15,
    alineacion: 0.30,
    evaluacion: 0.40,
    entrega: 0.15
};

const COLUMNA_MONTO_FASE = {
    registro: 'monto_registro',
    alineacion: 'monto_alineacion',
    evaluacion: 'monto_evaluacion',
    entrega: 'monto_entrega'
};

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

        const resp = await fetch(
            `${SUPABASE_URL}/rest/v1/candidatos_precio?email=eq.${encodeURIComponent(emailNormalizado)}&select=total_acordado,monto_registro,monto_alineacion,monto_evaluacion,monto_entrega`,
            {
                headers: {
                    apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
                    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
                }
            }
        );
        if (!resp.ok) throw new Error('No se pudo consultar candidatos_precio');
        const rows = await resp.json();

        let montoBruto;
        if (rows.length === 0) {
            // Sin fila todavía = candidato nuevo, mismo default que crear-preferencia.js.
            montoBruto = 14750 * PORCENTAJE_FASE[fase];
        } else {
            const row = rows[0];
            const montoExacto = row[COLUMNA_MONTO_FASE[fase]];
            montoBruto = (montoExacto !== null && montoExacto !== undefined)
                ? Number(montoExacto)
                : Number(row.total_acordado) * PORCENTAJE_FASE[fase];
        }

        res.status(200).json({ monto: Math.round(montoBruto * 100) / 100 });
    } catch (e) {
        console.error('Error en monto-fase:', e);
        res.status(500).json({ error: 'Error interno' });
    }
};
