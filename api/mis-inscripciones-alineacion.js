/**
 * GET /api/mis-inscripciones-alineacion?email=usuario@example.com
 * Obtiene las inscripciones del usuario actual a sesiones de alineación
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

    const email = req.query.email;

    if (!email) {
        return res.status(400).json({ error: 'Email requerido' });
    }

    try {
        // Obtener todas las inscripciones del usuario
        const { data: inscripciones, error } = await supabase
            .from('inscripciones_alineacion')
            .select(`
                id,
                sesion_id,
                estado_inscripcion,
                fecha_inscripcion,
                sesiones_alineacion (
                    id,
                    fecha,
                    hora_inicio,
                    hora_fin,
                    instructor_nombre,
                    google_meet_link,
                    descripcion
                )
            `)
            .eq('usuario_email', email)
            .order('fecha_inscripcion', { ascending: false });

        if (error) throw error;

        res.status(200).json({
            success: true,
            total: inscripciones.length,
            inscripciones: inscripciones.map(i => ({
                id: i.id,
                estado: i.estado_inscripcion,
                fecha_inscripcion: i.fecha_inscripcion,
                sesion: i.sesiones_alineacion
            }))
        });
    } catch (error) {
        console.error('Error en /api/mis-inscripciones-alineacion:', error);
        res.status(500).json({
            error: 'Error al cargar inscripciones',
            message: error.message
        });
    }
};
