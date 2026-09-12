# Claude.md — EC1375 Paideia Tech

**Última actualización:** 12 de septiembre, 2026
**Qué es:** Sitio de certificación oficial EC1375 (SEP-CONOCER) para terapeutas alternativas en México. Landing de alta conversión (marca "Paideia Tech", antes "Posturalia") + portal post-pago donde el candidato completa todo el proceso de certificación desde el navegador (autodiagnóstico, alineación, evaluación, entrega de evidencias) sin papeleo.
**URL en vivo:** https://sepconocer.paideiatech.com (alias activo en paralelo: `ec1375-posturalia.vercel.app`, mismo proyecto de Vercel)
**Estado:** Todo lo descrito en este documento está en producción salvo que diga lo contrario. Precio de referencia: $14,750 MXN en 4 pagos (Registro 15% / Alineación 30% / Evaluación 40% / Entrega 15%), negociable por candidato.

---

## Stack

- HTML5 + CSS3 + JS vanilla, **sin build step, sin framework**. Convención del proyecto: **páginas estáticas sin módulos compartidos** — cada `.html` es autocontenida. Única excepción deliberada: `auth.js` (sesión/RLS es justo el tipo de código donde una copia desincronizada entre páginas es el modo de falla a evitar).
- Backend: funciones serverless de Vercel (Node, mezcla de `module.exports` CommonJS y `export default` ESM — ambas conviven) + Supabase (Postgres/RLS/Auth/Storage).
- Pagos: Mercado Pago (Payment Link estático para Registro, API de Preferencias con monto dinámico para las otras 3 fases) + transferencia bancaria manual.
- Documentos: generación de PDF client-side (jsPDF/jspdf-autotable), subida automática vía WebDAV a un Nextcloud propiedad del evaluador (Humberto), sin backend de storage propio.
- Email: Resend, dominio `paideiatech.com` verificado, remitente `noreply@paideiatech.com`.

**⚠️ Límite de Vercel Hobby: máx. 12 Serverless Functions por deployment.** Cualquier `.js` bajo `api/` cuenta como función, aunque sea un helper compartido sin ruta propia. Los helpers compartidos (ej. envío de email) viven en `lib/`, **no** en `api/`, para no contar contra el límite — ya pasó una vez (ver "Cambios recientes" abajo). Antes de agregar un nuevo endpoint, correr `find api -name "*.js" | wc -l` y confirmar que sigue en 12 o menos, o mover algo a `lib/` primero.

---

## Estructura de archivos

```
index.html, quiz.html                    Landing + quiz de calentamiento (pre-pago)
success.html / failure.html / pending.html   Retorno de Mercado Pago (Registro)
recuperar.html                           Login / continuar en otro dispositivo
restablecer-password.html                Landing de "olvidé mi contraseña" (Supabase PASSWORD_RECOVERY)

autodiagnostico.html      142 reactivos EC1375, wizard de pasos, login+password aquí, sube 3 PDFs a Nextcloud
alineacion.html           Gate fase Alineación · reserva de sesión en vivo (Google Calendar) · CTAs a ruta-alineacion.html / ruta-estudio.html
ruta-alineacion.html      57 pantallas curadas con video real de YouTube — presentación de Alineación
ruta-estudio.html         Motor de estudio de 5.4MB (state machine "V4.4", API pública window.EC1375) — biblioteca/práctica/reforzamiento
reforzamiento.html, practica.html, biblioteca.html   Stubs (`location.replace('ruta-estudio.html?boot=X')`) — no tienen contenido propio
examen-conocimientos.html Examen de conocimientos (parte de la ruta lineal post-alineación)
plan-evaluacion.html      Tabla de 25 grupos (=142 reactivos), agenda cita, gate fase Evaluación
documentos-sesion.html    Wizard de 4 documentos (Ficha/Consentimiento/Plan Sesión/Seguimiento) de la sesión real con paciente
encuesta-satisfaccion.html  8 preguntas oficiales Likert
evidencias.html           Checklist final + uploads nativos (Zoom, INE, CURP, foto diploma, certificados)
entrega.html              Gate fase Entrega, confirmación final (no enlazada desde el flujo — el equipo comparte el link manual cuando el evaluador aprueba)

admin-index.html, admin-precios.html, admin-sesiones.html   Panel interno del equipo (precios/sesiones de alineación)
kpi-dashboard-live.html   Dashboard de KPIs (inscritos/completados/ingresos por fase) — ⚠️ sin auth.js, público a quien tenga la URL

auth.js                   Supabase Auth (email+password) + sync + gates + admin bypass — único módulo compartido
api/master-login.js       Login-maestro: entra como cualquier candidato autorizado (server-side, Admin API)
api/crear-preferencia.js  Genera Preferencia de MP con monto dinámico por candidato/fase
api/monto-fase.js         Calcula el monto de una fase sin crear preferencia (para mostrarlo en UI/transferencia)
api/mercadopago-webhook.js  Autoriza email+fase automáticamente en pagos vía MP (valida firma HMAC)
api/subir-portafolio.js   Sube PDFs generados a Nextcloud vía WebDAV (valida access_token de la sesión)
api/kpi-data.js           Datos agregados para kpi-dashboard-live.html
api/sesiones-alineacion.js, api/inscribir-alineacion.js, api/mis-inscripciones-alineacion.js   Reserva de sesiones en vivo
api/crear-evento-google.js, api/eliminar-evento-google.js   Admin: crea/borra eventos de Google Calendar
api/enviar-recordatorios.js   Cron: recordatorios 24h/1h antes de sesión (maneja TZ America/Mexico_City explícitamente — Vercel corre en UTC)
lib/send-email.js         Helper de Resend (compartido por los endpoints de arriba) — fuera de api/ a propósito, ver límite de Vercel

Logo Paideia Tech.png / Logo Paideia Tech - trimmed.png   Logo actual (PNG). Hay un sistema SVG inconcluso en assets/images/logo/ — no usar, ver backlog #9.
ALINEACION 1375_LN - Paideia Tech.pptx   PPT de Alineación con marca (temporal, ~17MB)
ICE MEXICO LOGO OFICIAL.jpeg, RED CONOCER LOGO OFICIAL.jpeg   Logos institucionales, sí en git — van en cada PDF/expediente oficial (nunca en evidencias.html, que no es documento oficial)
docs/superpowers/specs/, docs/superpowers/plans/   Specs y planes de features (ver secciones abajo)

_internal_no_publicar/    TODO gitignored
├── 01-scripts/               Python: assemble_expediente.py + su cadena Drive/Forms (ver sección abajo)
├── 02-sql/                   Migraciones .sql
├── 03-documentos-referencia/ PDFs/PPTX de consulta (incl. expediente real de Humberto, confidencial)
├── 04-backups-supabase/
└── 05-pruebas-diego/         Datos reales de la prueba end-to-end de Diego
```

---

## Autenticación y gates

**Password + login-maestro (reemplazó OTP, 12 sep 2026).** Supabase Auth con email+contraseña:
- **Candidato:** `Auth.renderAuthGate()` en `auth.js` — correo → "ya tengo contraseña" (signin) / "primera vez" (signup) / "olvidé mi contraseña" (`resetPasswordForEmail` → `restablecer-password.html`, escucha el evento `PASSWORD_RECOVERY`).
- **Admin** (cuenta con `is_admin()`): `Auth.renderAdminGate()` — mismo patrón pero comprueba `is_admin()` en el paso de correo, **antes** de ofrecer signin/signup (si no, una cuenta admin que nunca puso contraseña no tenía a dónde ir en "primera vez").
- **Login-maestro:** cualquier correo con ≥1 fase pagada + contraseña universal **`Paideia2026`** (env var `MASTER_LOGIN_PASSWORD`) inicia sesión como ese candidato — pensado para que el equipo ayude en llamadas sin esperar un correo de restablecimiento. `api/master-login.js` verifica la contraseña maestra ANTES de tocar el correo (mensaje 401 genérico si falla), confirma que el correo tenga al menos una fila en `candidatos_fase_pagos`, y emite sesión vía Admin API (`generateLink` tipo magiclink → el cliente canjea con `verifyOtp`). Nunca expone la service role key ni la contraseña maestra al navegador. `Auth._handleSignIn()` cae a esto automáticamente si el signin normal falla (mismo mensaje de error en ambos casos, no revela el motivo).
- **Bypass de navegación libre** (solo `paideia.tech@outlook.com`, `CANDIDATE_FLOW_BYPASS_EMAIL` en `auth.js`): salta el pago de "registro" y siembra datos placeholder de Autodiagnóstico automáticamente, para que el equipo navegue/demuestre el flujo completo sin datos reales. Verificado server-side vía RPC `is_current_user_flow_bypass_admin()` (nunca confía en `session.user.email` del cliente, que se puede falsificar). Barra fija (`Auth.renderAdminBar()`) con links a las 8 páginas del flujo + botón "Reset" que limpia el progreso downstream sin borrar el placeholder. Detalle completo: `docs/superpowers/specs/2026-09-12-admin-flow-bypass-design.md`.

**Pagos por fase:** `candidatos_precio` (email → `total_acordado`, default $14,750, se edita a mano en Supabase) + `candidatos_fase_pagos` (email+fase → pagado) + RPC `is_fase_authorized(email, fase)`. Cada página gateada exige la fase anterior autorizada **y** sus documentos ya subidos a Nextcloud (doble compuerta). Transferencias bancarias se autorizan a mano en el Table Editor de Supabase; pagos por Mercado Pago los autoriza `api/mercadopago-webhook.js` automáticamente.

---

## Documentos → Nextcloud (reemplaza Google Form para uploads generados)

`api/subir-portafolio.js` sube automáticamente cada PDF que el sitio genera (Autodiagnóstico + sus Acuses, Plan de Evaluación + Acuse, los 4 de Documentos de Sesión, Encuesta) a `Portafolios/{Nombre_CURP}/{01-Registro|02-Alineacion|03-Evaluacion|04-Entrega}/` en el Nextcloud de Humberto (TrueNAS SCALE + Cloudflare Tunnel, cuenta de servicio solo-WebDAV), validando el `access_token` real de la sesión antes de aceptar (evita que un candidato sobreescriba la carpeta de otro). Estado por documento vive en el JSONB de cada página (`documentosNextcloud: {clave: ruta}`) — sin tablas ni RPCs nuevas.

**Cadena de gates (bloqueo duro):** Alineación exige Registro subido → Documentos de Sesión exige Alineación → Encuesta exige Documentos de Sesión → Evidencias exige Encuesta → Entrega exige Evidencias. `documentosFaseCompletos()` (duplicada en cada archivo gateado) acepta subido-O-descargado como "completo" — ver "Cambios recientes" abajo.

El Google Form de evidencias se retiró — `evidencias.html` ahora usa `<input type="file">` nativos solo para lo que el sitio no genera: capturas de Zoom, INE, CURP, foto de diploma, certificados (opcional).

**⚠️ Pendiente confirmar:** `NEXTCLOUD_URL` en Vercel se guardó como `.../login` — probablemente la pantalla de login del navegador, no el endpoint WebDAV real. El código lo normaliza defensivamente, pero falta confirmar con Diego/Humberto que apunta al lugar correcto.

Spec: `docs/superpowers/specs/2026-09-12-nextcloud-portafolio-storage-design.md`. Plan: `docs/superpowers/plans/2026-09-12-nextcloud-portafolio-storage.md`.

---

## Sesiones de Alineación en vivo (Google Calendar)

`alineacion.html` deja al candidato reservar un horario real: `api/sesiones-alineacion.js` lista cupos, `api/inscribir-alineacion.js` inscribe (agrega invitado al evento de Calendar vía `events.patch` preservando invitados existentes, envía email de confirmación por Resend), `api/mis-inscripciones-alineacion.js` consulta las propias. El admin crea/borra sesiones desde `admin-sesiones.html` vía `api/crear-evento-google.js` / `api/eliminar-evento-google.js`. El link de Google Meet **no se autogenera** (la Service Account no tiene domain-wide delegation — `paideia.tech@outlook.com` es cuenta personal, no Workspace): el admin lo crea a mano en meet.google.com/new y lo pega al crear la sesión. `api/enviar-recordatorios.js` (cron por hora) manda recordatorios 24h y 1h antes, comparando siempre en hora de México (`Intl.DateTimeFormat` con `timeZone: 'America/Mexico_City'`) porque Vercel corre en UTC.

Tablas: `sesiones_alineacion`, `inscripciones_alineacion`, `emails_enviados_alineacion` (auditoría de envíos).

---

## KPI Dashboard

`kpi-dashboard-live.html` + `api/kpi-data.js`: lee `candidatos_precio` + `candidatos_fase_pagos` en vivo y calcula inscritos/completados/en-progreso e ingresos por fase. **No tiene ningún gate de autenticación** — cualquiera con la URL puede verlo. Confirmar con Diego si necesita protegerse antes de compartir el link ampliamente.

---

## Certificados de formación previa (candidato)

En el paso "personal" del Autodiagnóstico, el candidato escribe el nombre de cada certificación tal cual aparece en su certificado y sube el archivo (PDF/imagen, máx. 10MB) — obligatorio marcar "no tengo ninguno" o subir al menos uno. Archivos en bucket privado de Supabase Storage `certificados-previos` (RLS por `user_id`, primer segmento de la ruta). `Auth.uploadCertificado(file, path)` en `auth.js`. El campo "Escolaridad/Certificaciones" del PDF oficial se llena desde estos nombres.

**⚠️ Pendiente que Diego haga en Supabase:** crear el bucket `certificados-previos` (si no existe) y correr `_internal_no_publicar/02-sql/supabase_setup_v6_certificados_storage.sql`.

---

## Ensamblado del expediente final (fuera del sitio — script de Diego/equipo)

`_internal_no_publicar/01-scripts/assemble_expediente.py` (nunca en el repo público, maneja datos personales reales):
```bash
cd _internal_no_publicar/01-scripts
python3 assemble_expediente.py "Nombre Completo Del Candidato" ["liga al video, opcional"]
```
Lee las respuestas del Google Form "Evidencia EC1375" (Forms API, porque Drive organiza archivos por pregunta, no por candidato), descarga los archivos de Drive, genera con `reportlab` portada/índice/separadores/Cédula en blanco, inserta la plantilla del IEC en blanco (83 págs., `_internal_no_publicar/plantilla_IEC_blanco.pdf`), y fusiona todo con `pypdf` en el orden verificado contra un expediente real (Portada → Índice → Datos del Candidato/CURP/INE/Autodiagnóstico → Recopilación de Evidencias/Plan de Evaluación/IEC/Ficha-Carta-Plan de Sesión-Plan de Seguimiento del paciente/video → Cierre/Cédula/Encuesta → Anexos/Acuses). Si falta cualquier evidencia, **no falla** — genera el expediente igual y lista lo faltante en rojo en el propio Índice. Probado con datos reales: primer expediente de 110 páginas generado exitosamente.

Credenciales Google: OAuth "Aplicación de escritorio", proyecto de Cloud `EC1375-Portafolios` (dueño `de.minconsciente@outlook.com`), token con scopes `drive.readonly` + `forms.responses.readonly` + `forms.body` en `_internal_no_publicar/01-scripts/token.json`. Si expira: correr `setup_drive_auth.py` (abre el navegador real del usuario — nunca ingresar credenciales por Claude).

**Limitación de Google confirmada:** las preguntas de tipo "Subir archivo" en un Form **solo se pueden crear desde la interfaz web**, nunca por API (`400 INVALID_ARGUMENT: Creation of file_upload question not supported`) — cualquier pregunta de carga nueva la agrega Diego a mano en Google Forms; el script la detecta sola por palabras clave del título (`KEYWORD_SLOTS` en `assemble_expediente.py`).

**Este script todavía lee de Google Forms/Drive, no del Nextcloud nuevo** — migrarlo es un proyecto aparte (ver backlog).

**Puntos abiertos sin confirmar con Diego:**
- "Foto para el diploma" y "Certificados de formación" no tienen ubicación exacta confirmada en el expediente oficial — hoy van en Anexos.
- Posible documento faltante: "Encuesta de Satisfacción del Proceso de Evaluación" corta (Bueno/Regular/Malo) podría ser distinta de la Encuesta de 8 preguntas ya construida — no confirmado, no construido.
- Cédula de Evaluación y el IEC los llena el evaluador después de revisar el video — el script los inserta en blanco; falta un flujo para que el evaluador los llene digitalmente (ver backlog #7).

---

## Cambios recientes (12 de septiembre, 2026)

- **Validación de certificado subido:** `certificadosCompletos()` corrigió un bug donde había que marcar "no tengo certificado" aunque ya se hubiera subido uno, para poder avanzar.
- **Autenticación:** OTP reemplazado por email+password+login-maestro (ver sección arriba).
- **Eliminados en todo el sitio:** botones de descarga en Word (.doc) y de compartir por WhatsApp — solo queda descarga/subida en PDF.
- **Flujo lineal:** se eliminó el concepto de dashboard de "Autodiagnóstico" con tabs — ahora son pasos/botones separados. `reforzamiento.html`, `practica.html`, `biblioteca.html` son stubs que redirigen a `ruta-estudio.html?boot=X`, que internamente gatea por fase pagada y pre-popula el estado exacto que el motor de estudio (`window.EC1375`) necesita para considerar cada sección desbloqueada — **nunca** desactivando gates del motor (`enforceGates`), siempre satisfaciendo la condición real.
- **Documentos:** `documentosFaseCompletos()` ahora acepta subido-O-descargado como completo, corrigiendo el bug de que un documento ya descargado se seguía marcando como pendiente de subir.
- **Requerimientos de equipo:** se quitó la afirmación de que el Centro Evaluador compra el equipo requerido; se agregaron ligas de compra (Amazon/MercadoLibre) en `plan-evaluacion.html` y en `ruta-alineacion.html`.
- **Sin reembolsos:** disclaimer agregado en cada punto de pago (`index.html`, `success.html`).
- **Lección de infraestructura:** agregar `api/master-login.js` llevó el conteo a 13 funciones y rompió el deploy (`exceeded_serverless_functions_per_deployment`, límite 12 del plan Hobby). El culpable real era `api/utils/send-email.js`, un helper compartido sin ruta propia que igual contaba — se movió a `lib/send-email.js` (fuera de `api/`). Ver "Límite de Vercel Hobby" arriba antes de agregar cualquier endpoint nuevo. Para diagnosticar un deployment fallido cuyo error la UI de Vercel trunca: `vercel inspect --logs <url>` primero; si sigue cortado, pegar el token de `~/Library/Application Support/com.vercel.cli/auth.json` contra `GET https://api.vercel.com/v13/deployments/{id}` da `errorMessage`/`errorCode` completos.
- **`ruta-alineacion.html` (11 sep):** extendida con Módulo 7 "Tu video práctico" (pantallas 51-57) sobre la base de 50 pantallas que Diego compartió (generadas por un pipeline externo, `v4/alineacion.py`, que no vive en este repo). **No editar las pantallas 1-50 ni asumir que hay que "arreglarlas"** — se regeneran desde ese pipeline externo; si Diego lo vuelve a correr, hay que refusionar el Módulo 7 y las ligas de compra a mano.

---

## Credenciales y configuración

### Supabase
```
Project ref: numsuiuwrvpprhnxovmh
Project URL: https://numsuiuwrvpprhnxovmh.supabase.co
Cuenta del dashboard: paideia.tech@outlook.com
Anon key: pública por diseño (RLS controla acceso), embebida en auth.js
Tablas clave: candidatos_ec1375, candidatos_fase_pagos, candidatos_precio,
              sesiones_alineacion, inscripciones_alineacion, emails_enviados_alineacion
SQL consolidado: _internal_no_publicar/02-sql/supabase_setup_v5_new_project.sql (+ incrementales posteriores en la misma carpeta)
```
`SUPABASE_URL` está hardcodeado (mismo valor) en `auth.js`, `api/mercadopago-webhook.js`, `api/crear-preferencia.js`, `api/kpi-data.js`, `api/master-login.js` — si el proyecto vuelve a migrar, actualizar en todos.

**Variables de entorno en Vercel** (Project Settings → Environment Variables, nunca en código):
```
SUPABASE_SERVICE_ROLE_KEY, MERCADOPAGO_ACCESS_TOKEN, MERCADOPAGO_WEBHOOK_SECRET,
MASTER_LOGIN_PASSWORD, GOOGLE_CALENDAR_ID, GOOGLE_CALENDAR_KEY_FILE (JSON completo de la Service Account, no una ruta),
NEXTCLOUD_URL, NEXTCLOUD_USERNAME, NEXTCLOUD_APP_PASSWORD
```

### Resend (email transaccional)
```
Cuenta dashboard: posturalia.d817@gmail.com
Dominio verificado: paideiatech.com — remitente: noreply@paideiatech.com
Registros DNS: _internal_no_publicar/03-documentos-referencia/paideiatech_dns_records.md
```

### Vercel
```
Proyecto: ec1375-posturalia (nombre cosmético, sin cambiar)
Dominios: sepconocer.paideiatech.com (Custom Domain) + ec1375-posturalia.vercel.app (alias)
Dashboard: https://vercel.com/re-infinito/ec1375-posturalia
```

### Mercado Pago
```
Public Key: APP_USR-2465263038921252-072114-fce315dcc9b9550df49c635de92e696f-724130873
Client ID: 2465263038921252
Payment Link (Registro, fijo): https://mpago.la/1QeeSHo — $2,000 MXN
Fases Alineación/Evaluación/Entrega: monto dinámico vía api/crear-preferencia.js
```
**⚠️ Pendiente:** el webhook está configurado en Mercado Pago solo en "Modo de prueba" — falta replicarlo en "Modo productivo" (el que recibe pagos reales).

### Transferencia bancaria
```
Banco: Banorte — Titular: Jose Fernando Villarreal Flores
Cuenta: 4189143315836695 — CLABE: 072580006971824032
```

### Contacto
```
WhatsApp: +52 81 1502 6729 (https://wa.me/528115026729)
Email: contacto@paideiatech.com
```

### Git / Deployment
```
Repo: https://github.com/re-infinito/ec1375-posturalia (branch main)
Deploy: git push origin main → Vercel auto-deploy (~30-60s). Sin CI/tests — verificar sintaxis y probar localmente antes de pushear cambios grandes.
```

---

## Diseño (referencia rápida para copy/CSS)

```
--dark: #050a1a          --primary: #0088FF (azul cyan)
--dark-light: #0f1428    --accent: #FFD700 / #D4AF37 (dorado)
--text-bright: #FFFFFF   --danger: #FF3333 (rojo, miedo)
--text: #D0D0D0          --success: #00FF88 (verde, tranquilidad)
```
Landing (`index.html`) sigue un arco emocional Vocación→Miedo→Transformación→Tranquilidad→Acción ("SÍ, QUIERO DORMIR TRANQUILO"). "EC1375" (nombre del estándar) se oculta deliberadamente en `index.html`/`quiz.html`/`success.html`/`failure.html`/`pending.html` — se revela hasta que el candidato ya pagó (decisión de negocio de Diego); desde `autodiagnostico.html` en adelante sí aparece, porque esas páginas generan documentos oficiales reales.

---

## Backlog (no urgente)

1. Sistema automático de perfiles/descuentos — hoy `total_acordado` se edita a mano por candidato.
2. Panel de aprobación/filtrado para el equipo (ver en qué etapa/fase está cada candidato) — más fácil ahora que existen las tablas de Supabase.
3. Recuperar PDFs perdidos — los datos para regenerarlos viven en Supabase, pero los PDFs en sí no se guardan.
4. Multi-evaluador — número de WhatsApp y nombre de evaluador están fijos en código.
5. Anti-duplicados de CURP.
6. Página de estado del proceso para el candidato (en vez de preguntar por WhatsApp).
7. Flujo del evaluador: llenar digitalmente Cédula de Evaluación e IEC, automatizar "Resultado Evaluación" (competente/no competente) — hoy 100% manual por WhatsApp. Bloquea enlazar `entrega.html` automáticamente.
8. Migrar `assemble_expediente.py` para leer del Nextcloud nuevo en vez de Google Forms/Drive.
9. Logo SVG de mejor calidad (`assets/images/logo/paideia-tech-logo-*.svg`, inconcluso) — seguir con el PNG actual por ahora.
10. PPT de Alineación de mejor calidad, idealmente en Google Slides para embeber en vez de forzar descarga de ~17MB.
11. Videos del proceso pendientes (contexto SEP-CONOCER, capacitación, muestra de atención) — `alineacion.html` ya tiene los espacios (`VIDEO_CAPACITACION_URL`, `VIDEO_MUESTRA_URL`).
12. Portada de `ruta-estudio.html` y pantalla 1 de `ruta-alineacion.html` siguen diciendo "ACADEMIA POSTURALIA" — es texto incrustado en una fotografía (no editable por CSS/HTML), pendiente que Diego regenere la imagen.
13. Gate de autenticación para `kpi-dashboard-live.html` (hoy público).
14. Confirmar `NEXTCLOUD_URL` real (ver sección Nextcloud arriba).
15. Replicar webhook de Mercado Pago en modo productivo.
16. Calendario de citas en `plan-evaluacion.html` sigue en placeholder (`GOOGLE_CALENDAR_BOOKING_URL` vacío, fallback a WhatsApp) — el candidato pidió horarios fijos recurrentes, no un Calendly en tiempo real.

---

## Notas de seguridad

- `MASTER_LOGIN_PASSWORD` y `SUPABASE_SERVICE_ROLE_KEY` solo se usan server-side (`api/master-login.js`, `api/*-webhook.js`) — nunca en HTML/JS de cliente.
- El bypass de navegación (`CANDIDATE_FLOW_BYPASS_EMAIL`) se verifica siempre server-side vía RPC; el chequeo local (`isFlowBypassAdmin`) solo decide qué UI mostrar antes de que exista sesión, nunca otorga acceso por sí solo.
- `kpi-dashboard-live.html` no tiene gate — no compartir el link ampliamente hasta agregar uno (backlog #13).

---

**Mantenedor:** Diego Garza (re-infinito@outlook.com) + Claude Code
