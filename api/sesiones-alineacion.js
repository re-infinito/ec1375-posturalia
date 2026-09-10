/**
 * GET /api/sesiones-alineacion
 * Lista todas las sesiones de alineación disponibles en los próximos 30 días
 * Retorna: { sesiones: [...], total_inscritos_por_sesion: {...} }
 */

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = async (req, res) => {
    res.setHeader('Content-Type', 'application/json');

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // Obtener todas las sesiones disponibles en próximos 30 días
        const hoy = new Date().toISOString().split('T')[0];
        const hace30 = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
            .toISOString()
            .split('T')[0];

        const { data: sesiones, error: errorSesiones } = await supabase
            .from('sesiones_alineacion')
            .select(`
                id,
                fecha,
                hora_inicio,
                hora_fin,
                capacidad_maxima,
                instructor_nombre,
                google_meet_link,
                estado,
                descripcion
            `)
            .eq('estado', 'abierta')
            .gte('fecha', hoy)
            .lte('fecha', hace30)
            .order('fecha', { ascending: true })
            .order('hora_inicio', { ascending: true });

        if (errorSesiones) throw errorSesiones;

        // Para cada sesión, contar inscritos
        const inscritos = {};
        for (const sesion of sesiones) {
            const { count, error: errorCount } = await supabase
                .from('inscripciones_alineacion')
                .select('id', { count: 'exact', head: true })
                .eq('sesion_id', sesion.id)
                .eq('estado_inscripcion', 'confirmada');

            if (!errorCount) {
                inscritos[sesion.id] = count || 0;
            }
        }

        // Agregar cupos disponibles
        const sesionesConCupo = sesiones.map(s => ({
            ...s,
            inscritos: inscritos[s.id] || 0,
            cupos_disponibles: s.capacidad_maxima - (inscritos[s.id] || 0),
            llena: (inscritos[s.id] || 0) >= s.capacidad_maxima
        }));

        res.status(200).json({
            success: true,
            total: sesionesConCupo.length,
            sesiones: sesionesConCupo
        });
    } catch (error) {
        console.error('Error en /api/sesiones-alineacion:', error);
        res.status(500).json({
            error: 'Error al cargar sesiones',
            message: error.message
        });
    }
};
