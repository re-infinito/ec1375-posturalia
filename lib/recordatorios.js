/* lib/recordatorios.js — cuándo toca cada recordatorio de la sala de evidencias.
   Va en lib/ y no en api/ a propósito: cualquier .js bajo api/ cuenta contra el
   límite de 12 funciones de Vercel, y ya estamos en 12. Aquí vive solo lógica
   pura, para poder probarla sin red ni base de datos.

   A diferencia de las sesiones de Alineación (que guardan fecha y hora local
   en columnas de texto y obligan a convertir zonas a mano), horarios_evidencia
   .inicio es un timestamptz: un instante. Así que la cuenta es una resta y no
   hay desfase posible. La zona solo hace falta para ESCRIBIR la fecha en el
   correo. */

const TZ = 'America/Mexico_City';

/* Las tres avisadas, de la más lejana a la más cercana. Los rangos son
   CONTIGUOS a propósito: el disparador corre cada hora, así que una reserva a
   las 9:30 caería en los huecos si cada ventana fuera estrecha (a las 8:00 le
   faltarían 90 min: ni "2 h" ni "1 h"). Contiguos, cada corrida cae siempre en
   exactamente una, y la marca de enviado impide que se repita. */
const AVISOS = [
    { clave: '24h', desde: 1260, hasta: 1500 },   // entre 21 y 25 horas antes
    { clave: '2h', desde: 90, hasta: 179 },       // entre 1.5 y 3 horas antes
    { clave: '1h', desde: 25, hasta: 89 }         // entre 25 min y 1.5 horas antes
];

function minutosHasta(inicioIso, ahoraMs) {
    const t = Date.parse(inicioIso);
    if (!Number.isFinite(t)) return null;
    return Math.round((t - ahoraMs) / 60000);
}

/* Qué aviso toca mandar ahora, o null si no toca ninguno.
   `enviados` es el objeto que se guarda en reservas_evidencia.recordatorios:
   { "24h": "<fecha ISO>", ... }. Nunca se manda dos veces el mismo. */
function avisoPendiente(inicioIso, ahoraMs, enviados) {
    const min = minutosHasta(inicioIso, ahoraMs);
    if (min === null || min < 0) return null;          // ya empezó o fecha inválida
    const ya = enviados || {};
    for (const a of AVISOS) {
        if (min >= a.desde && min <= a.hasta && !ya[a.clave]) return a.clave;
    }
    return null;
}

/* Cómo se nombra cada aviso en el asunto y en el cuerpo. */
function textoAviso(clave) {
    if (clave === '24h') return { cuando: 'mañana', asunto: 'Tu sesión de evidencia es mañana' };
    if (clave === '2h') return { cuando: 'en un par de horas', asunto: 'Tu sesión de evidencia es en un par de horas' };
    return { cuando: 'en una hora', asunto: 'Tu sesión de evidencia es en una hora' };
}

/* Fecha y hora escritas en hora de México, para el correo. */
function fechaLargaMx(iso) {
    return new Intl.DateTimeFormat('es-MX', {
        timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    }).format(new Date(iso));
}
function horaMx(iso) {
    const p = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false })
        .formatToParts(new Date(iso));
    const g = (t) => p.find((x) => x.type === t).value;
    return `${g('hour')}:${g('minute')}`;
}
function rangoMx(inicioIso, finIso) { return `${horaMx(inicioIso)} a ${horaMx(finIso)} h`; }

/* El primer nombre, para saludar sin sonar a oficio. */
function nombreDePila(nombre) {
    const limpio = String(nombre || '').trim().replace(/\s+/g, ' ');
    if (!limpio) return '';
    const p = limpio.split(' ')[0];
    return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
}

module.exports = { TZ, AVISOS, minutosHasta, avisoPendiente, textoAviso, fechaLargaMx, horaMx, rangoMx, nombreDePila };
