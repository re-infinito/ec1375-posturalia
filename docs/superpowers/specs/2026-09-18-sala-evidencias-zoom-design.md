# Sala de evidencias (Zoom) — diseño

**Fecha:** 18 sep 2026 · **Pedido de Diego:** los candidatos se conectan a la sala de Zoom recurrente "PAIDEIA | Grabación de evidencias" (graba sola en la nube al entrar) **desde la plataforma**; evitar que se conecten 2 a la vez; agenda; aviso de fecha límite para entregar la evidencia. La fecha de Zoom se registra en el Plan de Evaluación; la sala se usa desde Documentos de Sesión y el Guion Maestro. La grabación se pasa después al NAS, en la carpeta de evidencias de cada candidato, por trazabilidad.

**Decisiones de Diego (brainstorm 18 sep):**
- La sala es **una sola, con enlace y clave fijos para todos** (reunión recurrente sin hora fija, "unirse en cualquier momento", grabación automática en la nube, video del anfitrión apagado). No se usa la API de Zoom para cambiar la clave ni para crear reuniones por reserva.
- Fecha límite = **N días después de autorizada la fase Alineación** (N = 30, editable; el equipo puede extenderla a un candidato). (Primero se eligió Evaluación; Diego lo cambió el 18 sep al aclarar que la grabación se habilita con Alineación.)
- **La grabación se habilita con el pago de Alineación**; en Evaluación se contesta el examen, se cargan las evidencias y se revisa el video. Por eso Documentos de Sesión y Guion Maestro pasan a pedir Alineación (ver sección 3b).
- La sala en Zoom no tiene duración; la **agenda** sí usa bloques (duración y colchón en la plantilla, 90 + 15 min por default).
- Horarios los crea el **admin con plantilla semanal**.
- El candidato **ya no sube su video a YouTube**: el equipo liga la grabación.
- La grabación se copia **Zoom → NAS directo con un botón** (API de Zoom solo para leer/borrar grabaciones).
- La liga que va en el portafolio para la SEP es la **liga compartida de Zoom**, y la grabación **se conserva en Zoom hasta que el certificado se entrega** (etapa `entregado`); el NAS guarda la copia desde el primer día.
- Aprobados: 30 días, sala abierta desde 10 min antes, cambio de horario hasta 24 h antes.

## 0. Lo que la plataforma puede y no puede garantizar

Con un solo enlace fijo que lleva la clave (`pwd=`), sin anfitrión que admita y con "unirse en cualquier momento", **Zoom no permite limitar la sala a una persona**. La plataforma lo evita en la práctica con tres capas:

1. **Horarios exclusivos** — la base de datos impide dos reservas activas en el mismo horario y horarios que se traslapen (colchón incluido).
2. **El enlace nunca está en el HTML** — vive en una tabla que solo lee el equipo; al candidato se lo da un RPC, solo si es dueño de un horario y solo entre 10 min antes del inicio y el fin.
3. **Reglas claras en pantalla** — incluida "si al entrar ves a otra persona, sal de inmediato y avisa por WhatsApp".

**Hueco conocido y aceptado:** quien copie el enlace durante su horario podría volver a entrar fuera de él. Cerrarlo requiere cambiar la clave por horario vía API (descartado por Diego). Mitigación: la grabación muestra el nombre de cada participante y la hora, así que un intruso queda registrado.

## 1. Datos (SQL `_internal_no_publicar/02-sql/2026-09-18-sala-evidencias.sql`, re-ejecutable)

**`sala_evidencias_config`** (una fila, `id = 1`; RLS: solo `puede_evaluar()` lee/escribe)
| columna | default | uso |
|---|---|---|
| `zoom_url` | enlace de invitación | se entrega al candidato en su ventana |
| `zoom_id` | `827 5726 3451` | se muestra junto al enlace |
| `zoom_clave` | — | se muestra con "Copiar" |
| `dias_limite` | 30 | fecha límite = autorización de Evaluación + N días |
| `minutos_antes` | 10 | apertura de la ventana |
| `horas_cambio` | 24 | cancelar/cambiar hasta N h antes |

El SQL **no** trae el enlace ni la clave: se capturan desde admin (no quedan en el repo ni en el archivo SQL).

**`horarios_evidencia`**: `id`, `inicio timestamptz`, `fin timestamptz`, `colchon_min int`, `creado_por`, `created_at`. Restricción de exclusión `exclude using gist (tstzrange(inicio, fin + colchon) with &&)`: dos horarios no pueden traslaparse. RLS: equipo todo; el candidato no lee la tabla (usa RPC).

**`reservas_evidencia`**: `id`, `horario_id`, `email` (minúsculas), `estado` (`reservada` | `cancelada` | `asistio` | `no_asistio`), `created_at`, `updated_at`, `por`.
- Índice único parcial `(horario_id) where estado in ('reservada','asistio')` → **un candidato por horario**, aun con dos reservas en el mismo segundo.
- Índice único parcial `(email) where estado = 'reservada'` → **una reserva activa por candidato**.
- RLS: equipo todo; el candidato no lee la tabla (usa RPC).

**`evaluaciones`** (ya existe) gana:
- `limite_evidencia date` — extensión manual; si es null se usa la calculada.
- `video jsonb` — `{ partes: [ { zoom: { uuid, file_id, inicio, bytes, share_url, clave }, nas: { ruta, bytes, fecha, por }, migracion: { upload_id, trozos_ok, total } } ], borrada_zoom: { fecha, por } }`.

**RPC del candidato** (`security definer`, correo del JWT, nunca un parámetro):
- `horarios_evidencia_disponibles()` → `[{ id, inicio, fin }]` futuros (inicio > ahora + 2 h), sin reserva activa. Exige fase **`alineacion`** autorizada (admins y bypass exentos): el Plan de Evaluación, donde se agenda, solo pide Alineación, así que el candidato reserva **antes** de pagar Evaluación.
- `reservar_horario_evidencia(p_horario uuid)` → misma exigencia; si ya tenía reserva activa la cancela, pero solo si faltan ≥ `horas_cambio` (si no: error "ya no se puede cambiar, escríbenos por WhatsApp"). El choque de dos reservas lo resuelve el índice único → error "ese horario acaba de ocuparse".
- `cancelar_mi_horario_evidencia()` → misma regla de `horas_cambio`.
- `mi_sala_evidencia()` → `{ reserva: { id, inicio, fin, estado } | null, limite: date | null, limite_extendido: bool, sala: { url, id, clave } | null, grabacion: { en_expediente: bool, fecha } }`. `sala` va **solo** si ahora ∈ [inicio − `minutos_antes`, fin] (Diego, 18 sep: "que solo les aparezca el enlace en el rango del horario seleccionado, para que no puedan meterse ni por accidente"; `minutos_antes = 0` lo abre justo al inicio) y la reserva está `reservada`/`asistio` y la fase `alineacion` sigue autorizada. `limite` = `evaluaciones.limite_evidencia` o `candidatos_fase_pagos.autorizado_en (alineacion)` + `dias_limite` (fecha en hora de México); null si Alineación no está autorizada.

Sin funciones nuevas de Vercel para la agenda.

## 2. Plan de Evaluación — la agenda (`plan-evaluacion.html`)

La tarjeta "📆 Agenda tu Evaluación" reemplaza el calendario vacío (`GOOGLE_CALENDAR_BOOKING_URL`) por un **selector de días → horarios libres** (hora de México, `Intl` con `America/Mexico_City`):
- Al reservar se llenan solos `fechaEvaluacion` (ISO), `horarioDesarrollo` ("10:00 a 11:30 h") y `lugarDesarrollo` ("En línea — Sala Zoom PAIDEIA · Grabación de evidencias"); esos tres quedan de solo lectura mientras haya reserva. Van al PDF del Plan como hoy; la huella cambia y la **resubida por versión** manda el Plan actualizado al NAS.
- Con reserva: tarjeta con el horario, "Cambiar horario" y "Cancelar" (deshabilitados a menos de 24 h, con la liga a WhatsApp).
- **Para generar el Plan hace falta reserva** cuando hay horarios. Si no hay ningún horario futuro o el SQL no está corrido, vuelve el comportamiento de hoy: botón de WhatsApp y fecha manual.
- Un Plan ya generado con fecha manual (antes de este cambio) conserva su fecha; la tarjeta invita a reservar y, al hacerlo, la fecha se actualiza.
- La cuenta demo ve horarios ficticios y una reserva ficticia; nunca llama a los RPC de reserva.

## 3. La sala — Documentos de Sesión y Guion Maestro

Módulo compartido **`sala-evidencias.js`** (misma razón que `firma-candidato.js`: la regla de qué se muestra y cuándo no debe copiarse en 5 páginas). API:
- `SalaEvidencias.cargar()` → resultado de `mi_sala_evidencia()` (o ficticio para la cuenta demo; `null` si el SQL no existe).
- `SalaEvidencias.estado(datos, ahora)` — **pura**: `sin_reserva` | `antes` (con cuenta regresiva) | `abierta` | `terminada` | `no_asistio`.
- `SalaEvidencias.tarjeta(contenedor)` y `SalaEvidencias.avisoLimite(contenedor)` — pintan y se refrescan cada 30 s (la ventana se abre sola sin recargar).

Tarjeta **"🎥 Tu sala de evidencia"** arriba de `documentos-sesion.html` y de `guion-maestro.html`:
| estado | muestra |
|---|---|
| `sin_reserva` | "Aún no tienes horario" → "Agendar mi horario" (Plan de Evaluación) |
| `antes` | fecha y hora, cuenta regresiva, reglas; botón deshabilitado "Se habilita 10 min antes" |
| `abierta` | **"Entrar a la sala de Zoom"** (pestaña nueva, `rel=noopener`), ID y clave con "Copiar", reglas |
| `terminada` | "¿Ya grabaste? Sigue con tus documentos" + "Agendar otro horario" (por si falló) |
| `no_asistio` | "No se registró tu sesión" → "Agendar otro horario" |

**Reglas** (siempre visibles, plegables después de la primera vez):
1. La sala es individual: entra solo en tu horario.
2. **Si al entrar ves a otra persona, sal de inmediato y avísanos por WhatsApp.**
3. No compartas el enlace ni la clave.
4. **La grabación empieza en cuanto entras**: llega con tu usuario, tu equipo listo y esta página abierta.
5. Pon tu nombre completo en Zoom (así se identifica tu grabación).
6. Cámara y micrófono encendidos todo el tiempo.
7. Al terminar, **sal completamente de Zoom** ("Salir de la reunión" y cierra la app).

## 3b. Candados de fase (cambio del 18 sep)

Como la grabación se habilita con Alineación:
- **`documentos-sesion.html` y `guion-maestro.html` piden `alineacion`** (antes `evaluacion`).
- El cobro de Evaluación, que hoy solo existe en Documentos de Sesión, se queda en esa página pero **al final**: la pantalla de resultado muestra "Siguiente: paga tu Evaluación" (Mercado Pago + transferencia, el mismo código de hoy) si no está pagada, y `documentos-sesion.html?pagar=evaluacion` abre directo esa pantalla de pago.
- **Práctica y Examen** (`estudio.html`) siguen pidiendo `evaluacion`; su aviso de bloqueo lleva a `documentos-sesion.html?pagar=evaluacion` ("Paga tu Evaluación").
- **Encuesta y Evidencias** agregan el candado de `evaluacion` (antes lo heredaban de Documentos de Sesión), con la misma liga de pago. Admins y cuenta demo exentos, como en las demás páginas.

## 4. Aviso de fecha límite

`SalaEvidencias.avisoLimite()` — franja en el Panel (`panel.html`, tarjeta de proceso), Plan de Evaluación, Documentos de Sesión, Guion Maestro y Evidencias:
- "Tienes hasta el **15 de octubre de 2026** para entregar tu evidencia · faltan 12 días".
- Ámbar con ≤ 7 días; roja si venció: "Tu plazo venció el …; escríbenos por WhatsApp". **Aviso, nunca bloqueo.**
- Paso Evidencias hecho (`FlowStatus`) → "Evidencia entregada ✓" (y deja de contar).
- Sin fase Alineación autorizada → no se muestra.

## 5. Evidencias (`evidencias.html`)

- Se quita la fila obligatoria "Liga al video completo (YouTube…)" y deja de exigirse en la validación.
- Nueva fila informativa **"🎥 Grabación de tu sesión"**: "Pendiente — el equipo la guardará en tu expediente" o "✅ Guardada en tu expediente (fecha)" (de `mi_sala_evidencia().grabacion`).
- Campo de liga **opcional y plegado**: "¿Grabaste fuera de la sala de Paideia? Pega aquí tu liga" (candidatos anteriores; sigue en `planData.videoLink`).
- El comprobante interno PDF cambia "Liga al video" por "Grabación: sala Paideia" o la liga opcional.

## 6. Equipo

**`admin-sesiones.html` → sección "Sala de evidencias"** (admins):
- **Configuración**: enlace, ID, clave, días límite, minutos antes, horas para cambio.
- **Plantilla semanal**: días de la semana, horas de inicio (lista), duración (90), colchón (15), rango de fechas → vista previa de los horarios a crear (omite los que chocan con existentes) → "Crear N horarios". Lógica pura `SalaEvidencias.generarHorarios(plantilla)` probada.
- **Próximos horarios**: fecha, hora, candidato (nombre + correo) o "Libre"; borrar horario libre; marcar **asistió / no asistió** en los pasados.

**`admin-evaluacion.html` → tarjeta "Grabación de la sesión"** (admins y evaluadores):
- Muestra su reserva (fecha, hora, estado) y su fecha límite con **"Extender fecha límite"** (escribe `evaluaciones.limite_evidencia`).
- **"Buscar grabación en Zoom"**: lista las grabaciones de la sala entre inicio − 15 min y fin + 60 min de su reserva (con opción "buscar en otra fecha"), con hora de inicio, duración y tamaño; el equipo elige **una o varias** (si el candidato se desconectó y volvió a entrar, Zoom guarda grabaciones separadas) → se guardan en `video.zoom` como lista de partes (cada una con `share_url` y clave de reproducción).
- **"Copiar al expediente (NAS)"**: barra de avance; se reanuda si se interrumpe; al terminar verifica que el tamaño en el NAS sea igual al de Zoom y guarda `video.nas`. Destino: `Portafolios/{Nombre_CURP}/03-Evaluacion/Grabacion_Sesion_AAAA-MM-DD_HHMM.mp4` (misma carpeta que las evidencias del candidato); con varias partes, `…_parte1.mp4`, `…_parte2.mp4`. Se copia el MP4 completo (video y audio) de cada parte.
- **"Borrar de Zoom"**: solo con `video.nas` verificado **y** la etapa `entregado` marcada; manda la grabación a la papelera de Zoom (recuperable 30 días), con confirmación.
- La liga del portafolio (`Evaluacion.planPortafolio`) usa la `share_url` (+ clave) de cada parte; si no hay, `evidencias_data.planData.videoLink` como hoy. El aviso "Falta la liga al video" cambia a "Falta ligar la grabación de Zoom".

**Panel del equipo (`admin-crm.html`) → "Requieren atención"**: candidatos con fecha límite vencida o a ≤ 7 días sin Evidencias completas, y sesiones pasadas sin grabación copiada al NAS. Cálculo en `AdminData` (probado).

## 7. Copia Zoom → NAS (servidor)

- **Zoom**: app **Server-to-Server OAuth** en marketplace.zoom.us (cuenta de Paideia) con permisos de lectura y borrado de grabaciones. Variables nuevas en Vercel: `ZOOM_ACCOUNT_ID`, `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET`. Diego la crea con la guía que se entrega junto con la implementación.
- **Sin función nueva**: acciones nuevas en `api/subir-portafolio.js` (`POST { accion: 'zoom-buscar' | 'zoom-copiar-trozo' | 'zoom-borrar' }`), solo para admins/evaluadores (`esDelEquipo`, ya existe). Helpers en `lib/zoom.js` y `lib/nextcloud.js` (fuera de `api/`, no cuentan contra el límite de 12).
- **Buscar**: token de cuenta → `GET /v2/users/me/recordings?from&to` (las reuniones recurrentes comparten ID; se filtra por el ID de la sala y la hora de inicio) → archivo MP4 de la vista principal.
- **Copiar por trozos** (el archivo nunca pasa por el navegador): el navegador del equipo llama a `zoom-copiar-trozo` con el número de trozo; el servidor pide a Zoom ese rango (`Range`, 32 MB) y lo sube a la **carga por trozos de Nextcloud** (`/remote.php/dav/uploads/<usuario>/<id>/<n>`, formato clásico sin tamaño mínimo); una acción final hace `MOVE` de `.file` al destino. 32 MB < 100 MB (límite de Cloudflare) y cada llamada queda muy por debajo del tiempo máximo de la función. El avance se guarda en `evaluaciones.video.migracion` para reanudar. El destino lo arma el servidor y se valida con `rutaNasPermitida` + que esté bajo `Portafolios/*/03-Evaluacion/` y termine en `.mp4`.
- **Borrar**: `DELETE /v2/meetings/{uuid}/recordings?action=trash`.

## 8. En Zoom (lo hace Diego, fuera de la plataforma)

- Grabación en la nube: activar **mostrar nombres de participantes** y **agregar marca de tiempo**; vista de orador + galería.
- Sala de espera **apagada** (no hay anfitrión que admita).
- **Probar una vez** que la grabación automática arranca sin el anfitrión dentro.
- **Almacenamiento**: Zoom Pro trae 5 GB; 90 min ≈ 0.3–0.8 GB. Como la grabación se conserva hasta la entrega del certificado (~90 días de trámite), **se va a llenar**: revisar la capacidad de la cuenta antes de abrir horarios (ampliar almacenamiento o plan). Cuando Zoom se llena deja de grabar — el riesgo más serio del diseño.
- La clave es la misma para todos; cambiarla en Zoom solo exige actualizarla en la configuración de admin.

## 9. Cuenta demo

Reserva ficticia en estado `abierta` con botón "Entrar" que avisa "Demo: aquí se abriría la sala" (nunca el enlace real), fecha límite ficticia a 12 días, horarios ficticios en el Plan. Sin llamadas a los RPC de reserva ni a las acciones de Zoom.

## 10. Pruebas

- **Node** (`tests/sala-evidencias.test.js`): `estado()` en las 5 situaciones y en los bordes de la ventana (−10 min exacto, fin exacto); fecha límite y colores (7 días, vencida, entregada); `generarHorarios()` en hora de México, sin traslapes con existentes ni entre sí, colchón respetado; textos escapados.
- **Node** (`tests/subir-portafolio.test.js`): acciones de Zoom rechazan a quien no es del equipo; destino fuera de `03-Evaluacion`/no `.mp4` rechazado; armado de rangos y trozos (último trozo parcial).
- **`AdminData`**: vencidos / por vencer / sin grabación.
- **Playwright** con Supabase simulado: reservar, choque de dos reservas al mismo horario (el segundo recibe el error), cambio a menos de 24 h rechazado, ventana que se abre sola, aviso de límite en sus 4 colores, Evidencias sin YouTube, admin genera horarios desde la plantilla, 375 px sin desborde, cuenta demo.
- **Real** (después de correr el SQL y crear la app de Zoom): una sesión de prueba grabada en la sala, buscarla, copiarla al NAS y comparar tamaño.

## Fuera de alcance

Cambiar la clave por horario o reuniones por reserva (decisión de Diego); correo o recordatorio automático de la sesión (sin espacio para otra función; se puede sumar a `enviar-recordatorios.js` después); copia automática sin botón; bloquear al candidato por fecha vencida.
