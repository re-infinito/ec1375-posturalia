# Circuito del Centro Evaluador — diseño

**Fecha:** 18 sep 2026 · **Pedido de Diego:** "que el circuito quede al 100%": pasos del Centro Evaluador después de Evidencias, Cédula y botón de admin para generar el portafolio, que el candidato nunca ve.

**Decisiones de Diego (brainstorm 17–18 sep):** solo la Cédula se captura en el panel (el IEC sigue en blanco en el expediente); acceso admins + rol evaluador; el candidato ve una línea de tiempo de etapas; si es no competente, retroalimentación + nueva evidencia; el portafolio se genera antes de subirlo a la SEP; se arma en el navegador del admin (enfoque A); **la Cédula la firman evaluador y candidato en el sitio**. Secciones 1 y 2 aprobadas el 17 sep ("me late el circuito").

## 1. Etapas (aprobado)

| # | Clave | Etapa | Quién la marca |
|---|---|---|---|
| 1 | `evidencias` | Evidencias recibidas | Automático: paso Evidencias hecho (`FlowStatus`) |
| 2 | `revision` | En revisión del evaluador | Evaluador/admin |
| 3 | `registro_sep` | Registrado en el portal SEP | Evaluador/admin (con fecha) |
| 4 | `dictamen` | Dictamen: competente / no competente | Automático al guardar la Cédula |
| 5 | `pago_entrega` | Pago de Entrega (15 %) | Automático: fase `entrega` autorizada |
| 6 | `portafolio_sep` | Portafolio enviado a la SEP | Evaluador/admin — solo con Entrega pagada |
| 7 | `tramite` | Certificado en trámite (~90 días) | Evaluador/admin |
| 8 | `recibido` | Certificado recibido | Admin |
| 9 | `entregado` | Certificado entregado | Admin — cierra el proceso |

Las manuales guardan `{ fecha, por }` en `evaluaciones.etapas`. Se pueden desmarcar (error de captura). Avisos al candidato: el panel abre WhatsApp con el mensaje escrito (sin correo automático: no hay espacio para otra función de Vercel).

## 2. Permisos (aprobado)

- **Evaluador** (tabla `evaluadores`): lista de candidatos y su detalle, etapas, Cédula y portafolio. No ve precios, utilidades ni KPIs y no libera pagos.
- **Admin:** todo lo anterior + lo de hoy.
- **Candidato:** su línea de tiempo y su Cédula (para firmarla). Nunca el portafolio. La descarga del NAS rechaza a quien no sea admin/evaluador.

Ajuste respecto a lo aprobado: como el candidato firma "Estoy de acuerdo con el juicio de evaluación y satisfecho con los comentarios emitidos", **sí ve el contenido de la Cédula** (juicio y comentarios). Las notas internas del equipo siguen en `candidatos_precio.nota_interna`, que el candidato no lee.

## 3. Cédula de Evaluación

- **Captura** en `admin-evaluacion.html?email=…`: evaluador(a), fecha, mejores prácticas, áreas de oportunidad, criterios que no se cubrieron, recomendaciones, juicio (COMPETENTE / NO COMPETENTE), observaciones para el candidato y firma del evaluador (dibujar o escribir). Mismos campos y orden que `draw_cedula_evaluacion_blanco()` de `assemble_expediente.py`, validado contra la página real del expediente de Humberto (dos bloques de firma: evaluador y candidato).
- **Guardar** escribe `evaluaciones.cedula` y el dictamen. Una Cédula nueva (p. ej. tras la reevaluación) archiva la anterior en `cedulas_anteriores` y borra la firma del candidato.
- **Candidato:** tarjeta "Tu evaluación" en su panel (línea de tiempo) y página `cedula.html` para leerla y firmar "Estoy de acuerdo…" (reutiliza `firma-candidato.js`). La firma se guarda con el RPC `firmar_cedula()`, que solo acepta si hay Cédula y la liga a la fecha de esa Cédula.
- **No competente:** el candidato ve el juicio, los comentarios y un botón "Subir nueva evidencia" (Evidencias ya permite editar y resubir). Entrega sigue bloqueada. El cobro de la reevaluación se acuerda por fuera.
- **PDF de la Cédula:** mismo layout que la versión en blanco del script, con los textos y las dos firmas. Se descarga sola desde el panel y va dentro del portafolio.

## 4. Portafolio (enfoque A: navegador del equipo)

- Botón **"Generar portafolio"** en `admin-evaluacion.html`. Puerto 1:1 de `assemble_expediente.py`: mismo orden (Portada → Índice → 1. Datos: Ficha RENAP, CURP, INE, Autodiagnóstico → 2. Evidencias: Plan, IEC en blanco, Ficha/Carta/Plan de Sesión/Seguimiento del paciente, referencia al video → 3. Cierre: **Cédula llena y firmada**, Encuesta → 4. Anexos: acuses), mismos avisos en rojo en el Índice (falta / formulario alterno) y mismas páginas generadas (con los logos oficiales). Se añade un aviso si la Cédula no tiene las dos firmas.
- **Descarga del NAS:** `GET /api/subir-portafolio?ruta=…&desde=…&hasta=…` (misma función: ya hay 12). Valida la sesión y `puede_evaluar()`, acepta solo rutas bajo `Portafolios/` o `Plantillas/` sin `..`, y responde en trozos de 3.5 MB (el límite de respuesta de Vercel es 4.5 MB). El IEC en blanco se sube una vez a `Plantillas/plantilla_IEC_blanco.pdf`.
- **Unión:** `pdf-lib` en el navegador; imágenes (JPG/PNG) a una página cada una; otros formatos → aviso.
- **Resultado:** se descarga al equipo y se guarda en el bucket privado `portafolios` de Supabase (`<email>/Portafolio_EC1375_<Nombre>.pdf`), con `evaluaciones.portafolio = { ruta, paginas, avisos, generado_at, por }`. No por Vercel: medido el 18 sep, producción rechaza cuerpos de más de 4.5 MB (413) y un portafolio pesa 5–15 MB. Solo admins/evaluadores leen el bucket.
- `assemble_expediente.py` se queda como respaldo.

## 5. Base de datos (`_internal_no_publicar/02-sql/2026-09-18-centro-evaluador.sql`, lo corre Diego)

`evaluadores(email)`, `is_evaluador(email)`, `puede_evaluar()`; tabla `evaluaciones(email pk, etapas jsonb, cedula jsonb, cedulas_anteriores jsonb, firma_candidato jsonb, portafolio jsonb, updated_at, updated_by)` con RLS solo para `puede_evaluar()`; RPCs `mi_evaluacion()` y `firmar_cedula(firma jsonb)` (security definer, por el correo del JWT); `admin_lista_candidatos()` abierto a evaluadores y con `fases_pagadas`; bucket privado `portafolios` con políticas para `puede_evaluar()`. Hasta que se corra, las páginas nuevas muestran el aviso de "falta correr el SQL" (mismo patrón que el CRM).

## Fuera de alcance

Captura digital del IEC; correo automático; cobro de la reevaluación; subir el portafolio al portal de la SEP (es manual del evaluador).
