import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://numsuiuwrvpprhnxovmh.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
  if (!SUPABASE_SERVICE_KEY) {
    return res.status(500).json({ error: 'SUPABASE_SERVICE_ROLE_KEY no configurada' });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const [precios, pagos] = await Promise.all([
      supabase.from('candidatos_precio').select('*'),
      supabase.from('candidatos_fase_pagos').select('*')
    ]);

    if (precios.error || pagos.error) {
      throw new Error(precios.error?.message || pagos.error?.message);
    }

    const preciosData = precios.data || [];
    const pagosData = pagos.data || [];

    // Agrupar pagos por email y fase
    const pagosPorEmail = {};
    pagosData.forEach(p => {
      if (!pagosPorEmail[p.email]) pagosPorEmail[p.email] = {};
      pagosPorEmail[p.email][p.fase] = true;
    });

    // Calcular KPIs
    const totalInscritos = preciosData.length;
    const completados = preciosData.filter(p => pagosPorEmail[p.email]?.entrega).length;
    const enProgreso = totalInscritos - completados;

    // Ingresos por fase
    const ingresosPorFase = { registro: 0, alineacion: 0, evaluacion: 0, entrega: 0 };
    preciosData.forEach(p => {
      const email = p.email;
      const pagos = pagosPorEmail[email] || {};
      if (pagos.registro && p.monto_registro) ingresosPorFase.registro += p.monto_registro;
      if (pagos.alineacion && p.monto_alineacion) ingresosPorFase.alineacion += p.monto_alineacion;
      if (pagos.evaluacion && p.monto_evaluacion) ingresosPorFase.evaluacion += p.monto_evaluacion;
      if (pagos.entrega && p.monto_entrega) ingresosPorFase.entrega += p.monto_entrega;
    });

    const ingresosTotales = Object.values(ingresosPorFase).reduce((a, b) => a + b, 0);
    const proyectado = preciosData.reduce((sum, p) => sum + (p.total_acordado || 0), 0);

    // Candidatos por fase
    const porFase = {
      registro: preciosData.filter(p => pagosPorEmail[p.email]?.registro).length,
      alineacion: preciosData.filter(p => pagosPorEmail[p.email]?.alineacion).length,
      evaluacion: preciosData.filter(p => pagosPorEmail[p.email]?.evaluacion).length,
      entrega: preciosData.filter(p => pagosPorEmail[p.email]?.entrega).length
    };

    return res.status(200).json({
      totalInscritos,
      completados,
      enProgreso,
      ingresosTotales,
      proyectado,
      ingresosPorFase,
      porFase,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error en kpi-data:', error);
    return res.status(500).json({ error: error.message });
  }
}
