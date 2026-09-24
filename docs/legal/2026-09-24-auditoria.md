# AUDITORÍA — EC1375 Paideia Tech (sepconocer.paideiatech.com)

**Fecha:** 24 sep 2026 · **Base:** guía NodeStudio "Tu web la hizo la IA. Los problemas legales son tuyos"
(checklist de privacidad, cookies, formularios, accesibilidad, copyright y claims) · **Hecha por:** Claude Code.

> No es asesoría jurídica y no declara que el sitio "cumpla" con ninguna ley. Clasifica hallazgos:
> **A** técnico (lo arregla el código) · **B** decisión del propietario · **C** legal / jurisdicción.

## Resumen

- **Stack:** HTML/JS estático sin build · funciones serverless de Vercel (`api/`) · Supabase (Postgres/RLS/Auth/Storage) ·
  Nextcloud del evaluador vía Cloudflare · Mercado Pago · Resend · Google Calendar · Zoom.
- **Páginas públicas revisadas:** `index.html`, `quiz.html`, `registro.html`, `success/failure/pending.html`, `panel.html` (login);
  más las páginas del flujo que recaban datos (`autodiagnostico`, `documentos-sesion`, `evidencias`, `encuesta-satisfaccion`).
- **Secretos expuestos:** **no.** Sin `.env` en git ni en su historial; las llaves de servidor vienen de variables de entorno.
  En el cliente solo hay llaves públicas (anon de Supabase, public key de Mercado Pago).
- **Conteo:** 🔴 Crítico 4 (3 arreglados) · 🟠 Revisar 12 (6 arreglados) · 🟢 Correcto 9 · ⚪ Info del propietario 10

---

## 🔴 Crítico

### 1. Endpoints de `api/` sin autenticación — **ARREGLADO (A)**
- **Archivos:** `api/monto-fase.js`, `crear-preferencia.js`, `mis-inscripciones-alineacion.js`, `inscribir-alineacion.js`,
  `crear-evento-google.js`, `eliminar-evento-google.js`, `kpi-data.js`, `sesiones-alineacion.js`.
- **Problema:** cualquiera con la URL podía: leer el **precio negociado** de otro candidato cambiando el correo;
  leer las **inscripciones de otro con su liga de Zoom**; **inscribir correos ajenos** (manda invitación de Calendar y un
  correo de Resend: relevo de spam y cupos llenos con altas falsas); **crear o borrar eventos** del calendario del equipo;
  leer **ingresos totales y por fase** (`kpi-data`, ya sin uso); y ver las ligas de Zoom de todas las sesiones abiertas.
- **Por qué importa:** es la categoría "Endpoints que devuelven datos de otros usuarios" de la guía (§11 y Parte 2).
- **Solución aplicada:** `lib/sesion.js` (fuera de `api/`, no cuenta contra el límite de 12 funciones) valida el token de
  Supabase igual que `subir-portafolio.js`. Los endpoints por correo solo responden por el correo **de la sesión** (o a un
  admin); el calendario y los KPIs, solo a admins; la lista de sesiones sigue pública pero sin `zoom_link` salvo para admins.
  Las páginas mandan el token con el nuevo `Auth.apiHeaders()`. Pruebas: `tests/sesion-api.test.js`.
- **Pendiente (B):** `api/kpi-data.js` ya no lo usa nadie. Quedó cerrado con admin, pero lo limpio es **borrarlo**
  (libera una de las 12 funciones). No se borró en esta pasada.

### 2. Login-maestro sin límite de intentos — **MITIGADO (A) · falta decisión (B)**
- **Archivo:** `api/master-login.js`; `auth.js` lo llama después de **cada** login fallido de candidato.
- **Problema:** una sola contraseña compartida entra como cualquier candidato con una fase pagada. Sin límite de intentos,
  el login público es un banco de pruebas contra esa contraseña.
- **Aplicado:** comparación en tiempo constante y una pausa de 0.8 s por fallo.
- **Decisión del propietario:** (a) un límite real de intentos (requiere una tabla en Supabase y un SQL); o (b) sacar el
  login-maestro del login público y dejarlo solo en una pantalla del equipo; y en cualquier caso (c) una contraseña
  maestra larga (20+ caracteres aleatorios) y rotarla.

### 3. No existe Aviso de Privacidad del sitio — **BORRADOR LISTO (C)**
- **Problema:** el sitio recaba nombre, correo, CURP, domicilio, teléfonos, foto, firmas, INE, video y **datos de salud de
  pacientes**, y no hay ningún aviso de privacidad propio ni un enlace a uno junto a ningún formulario. (Los avisos que sí
  existen en `documentos-sesion.html`/`recursos.html` son el modelo que el candidato presenta a **sus** pacientes.)
- **Por qué importa:** en México la LFPDPPP exige poner el aviso a disposición **antes** de recabar datos; los sensibles
  requieren consentimiento expreso. Suele ser relevante — verificar con un abogado el texto vigente (la ley se reformó en 2025).
- **Entregado:** `docs/legal/BORRADOR-aviso-de-privacidad.md`, basado solo en lo que el código hace, con `[COMPLETAR]` en lo
  que falta. Cuando esté aprobado se publica como página y se enlaza (ver el propio borrador).

### 4. Datos de salud de terceros (pacientes) — **REQUIERE REVISIÓN LEGAL (C)**
- **Archivo:** `documentos-sesion.html` → `documentos_sesion_data` en Supabase + PDFs en el Nextcloud.
- **Problema:** antecedentes médicos, signos vitales, notas de tratamiento de una persona que no tiene cuenta ni relación
  directa con Paideia Tech. No está definido el papel de Paideia frente a esos datos ni cuánto tiempo se guardan.

---

## 🟠 Revisar

| # | Hallazgo | Archivo | Tipo | Estado |
|---|---|---|---|---|
| 5 | SDK de Mercado Pago cargado en **cada visita** a la landing (huella del dispositivo y cookies de un tercero) solo para un botón con `preferenceId: 'YOUR_PREFERENCE_ID'` que siempre fallaba. El pago real va por `mpago.la`. | `index.html` | A | **Arreglado:** se quitó el SDK y el código muerto |
| 6 | FAQ de la landing: 7 `<div>` clicables, imposibles de abrir con teclado | `index.html` | A | **Arreglado:** `role="button"`, `tabindex`, `aria-expanded`, Enter/Espacio, foco visible |
| 7 | Etiquetas del login sin asociar a su campo (8) | `auth.js` | A | **Arreglado:** `for=` |
| 8 | Botón de tema solo con icono, sin nombre accesible | `crm-shell.js` | A | **Arreglado:** `aria-label` |
| 9 | Faltan HSTS, `Permissions-Policy` y `no-store` en `/api/*` | `vercel.json` | A | **Arreglado** |
| 10 | Correos en logs del servidor; `error.message` devuelto al cliente | `api/inscribir-alineacion.js`, `sesiones-alineacion.js`, `kpi-data.js` | A | **Arreglado** |
| 11 | FAQ dice "(Stripe/Mercado Pago)"; no hay Stripe | `index.html` | A | **Arreglado** (y errata "COMO TÍ") |
| 12 | **Contador vencido:** fecha fija 21 jul 2026 → la landing en vivo dice "¡LA OFERTA HA CERRADO!" mientras las píldoras siguen diciendo "ÚLTIMO DÍA • CUPO LIMITADO • SEPTIEMBRE" | `index.html` ~991, 1376, 1383 | B | **Arreglado (decisión de Diego):** fuera la píldora y los dos contadores; la barra fija dice "Certificación EC1375 · Pagos en 4 exhibiciones" |
| 13 | **Testimonios no verificables** (María C., Alberto H., Laura G.: sin apellido, foto ni folio) con claims de ingreso ("Gano 40% más") | `index.html` 1166-1217 | B | ¿Son personas reales con permiso por escrito? Si no, quitar |
| 14 | **"156+"** en 5 lugares, y en uno dice "YA REGULARIZADOS" y en otro "inscritos" | `index.html` 1010, 1040, 1158, 1161; `success.html` 620 | B | Confirmar la cifra real y usar una sola palabra |
| 15 | **Promesas legales/regulatorias:** "COFEPRIS lo respeta", "Eres responsable sanitario oficial sin necesidad de cédula", "Esta certificación te faculta" (Art. 79 LGS), "+40% más ganancias", "forma COMPROBADA", "reintentar sin costo adicional" | `index.html` 1082, 1088, 1094, 1263, 1303; `quiz.html` 394 | C | Revisión legal: es lo que más riesgo tiene frente a PROFECO |
| 16 | **"Certificación Oficial SEP-CONOCER"** en título, meta y og:tags, sin nombrar al Centro Evaluador acreditado ni el EC1375; puede leerse como sitio del gobierno. `registro.html:442` llama "Centro Evaluador" a Paideia Tech, pero los formatos dicen CE1399 (Colegio Ilustre de Ciencias Forenses) | `index.html` 10-13; `success.html` 715-719; `registro.html` 442 | C | Aclarar quién es quién ("Certificación en el EC1375 del CONOCER, evaluada por [CE acreditado]") |
| 17 | Datos bancarios **personales** (titular, cuenta y CLABE de una persona física) publicados en la landing | `index.html` 1230-1235 | B | ¿Cuenta de la empresa? Si no hay, al menos mandarla por WhatsApp después del registro |
| 18 | Páginas de pago que afirman un estado sin verificarlo ("Estado: ✓ Pagado", "Fondos: No debitados", "serás redirigido automáticamente" sin redirección) | `success.html` 586, `failure.html` 251/265, `pending.html` 326 | B | Cambiar a textos que no afirmen lo que no se sabe |
| 19 | No hay Términos y Condiciones; la política de reembolsos existe solo como una línea ("no aplican reembolsos, salvo…") | `index.html` | C | Redactar T&C y reembolsos (con PROFECO en mente) y enlazarlos en el pie |
| 20 | La landing no tiene pie con enlaces legales; el logo apunta a `#` | `index.html` 975 | A tras C | Enlazar Privacidad/T&C cuando existan |

## 🟢 Correcto

- Sin analítica ni píxeles de publicidad (sin GA, Meta, Hotjar, TikTok…). **No hace falta banner de cookies** mientras siga así.
- YouTube embebido con `youtube-nocookie.com` y solo al hacer clic.
- Sin secretos en el cliente ni en el historial de git; `.vercelignore` bloquea `docs/`, `tests/`, `.md`, documentos y credenciales.
- Ningún checkbox de consentimiento viene premarcado (NDA, RENAP y tríptico arrancan en `false`).
- La publicación en RENAP pide autorización explícita y separada.
- `subir-portafolio.js` valida la sesión y el dueño de la carpeta; el webhook de Mercado Pago valida la firma HMAC.
- `lang="es"` en todas las páginas, sin bloqueo de zoom, todas las imágenes públicas con `alt`, un `h1` por página.
- Sin imágenes enlazadas de otras webs; la tipografía es del sistema, salvo `estudio.html` (Google Fonts, licencia OFL).
- Los precios de la landing suman $14,750 MXN en 4 pagos, consistente con el resto del sitio.

## ⚪ Necesita información del propietario

1. Nombre legal / razón social del responsable y RFC (no aparecen en ningún lado).
2. ¿El domicilio "Río de la Plata 123A, Col. Roma, CP 64700, Monterrey" es real y vigente?
3. Correo que se revisa de verdad para temas de privacidad (¿`contacto@paideiatech.com`?).
4. Región del proyecto de Supabase y ubicación del servidor Nextcloud.
5. Plazos de conservación: expediente, grabación, datos de pacientes, cuentas que no avanzaron.
6. ¿Los 3 testimonios y el "156+" son reales? ¿Con permiso por escrito?
7. ¿"Reintentar sin costo adicional" es política real del Centro Evaluador?
8. ¿Quién es el Centro Evaluador que se debe nombrar en la landing?
9. ¿Hay cuenta bancaria de la empresa para reemplazar la personal?
10. ¿Se usan los datos para algo más (promociones, testimonios)? Si sí, falta un consentimiento de marketing separado.

## Inventario de servicios de terceros

| Servicio | Archivo | Datos que recibe | ¿Antes del consentimiento? | ¿Necesario? | ¿En la Política de Privacidad? |
|---|---|---|---|---|---|
| Supabase | `auth.js` + casi todas las páginas | Todo el expediente | n/a (servicio esencial) | Sí | En el borrador |
| supabase-js desde jsDelivr (sin versión fija ni SRI) | páginas del flujo y admin | IP | Sí | Sí (podría servirse local) | En el borrador |
| jsPDF desde cdnjs | 5 páginas del flujo | IP | Sí | Sí | En el borrador |
| Google Fonts | `estudio.html` | IP | Sí | No (podría ser local) | En el borrador |
| Mercado Pago | link `mpago.la`; API en `api/crear-preferencia.js` | Pago, correo | Al pagar | Sí | En el borrador |
| ~~SDK de Mercado Pago en la landing~~ | ~~`index.html`~~ | ~~Huella, cookies~~ | ~~Sí~~ | No | **Quitado** |
| Resend | `lib/send-email.js` | Correo, nombre | n/a | Sí | En el borrador |
| Google Calendar | `api/*-evento-google.js`, `inscribir-alineacion.js` | Correo, nombre | n/a | Sí | En el borrador |
| Zoom | `lib/zoom.js` | Imagen/voz, grabación | n/a | Sí | En el borrador |
| Nextcloud + Cloudflare | `lib/nextcloud.js` | PDFs del portafolio, video | n/a | Sí | En el borrador |
| YouTube (nocookie, al clic) | `visor-diapositivas.js`, `guion-maestro.html` | IP al reproducir | No | Sí | — |
| WhatsApp (solo enlaces) | varias | Lo que el usuario escriba | No | Sí | En el borrador |

## Inventario de datos personales

| Dato | Dónde se pide | Para qué | Dónde se guarda | ¿Necesario? |
|---|---|---|---|---|
| Nombre, correo, contraseña, firma NDA | `registro.html` | Cuenta + NDA | Supabase Auth + `candidatos_ec1375` | Sí |
| CURP, domicilio, teléfonos, escolaridad | `autodiagnostico.html` | Ficha RENAP / expediente | Supabase + Nextcloud + localStorage | Sí (formato oficial) |
| Fotografía | `autodiagnostico.html` | Certificado | Supabase Storage + Nextcloud | Sí |
| INE, CURP escaneados, certificados | `evidencias.html`, `autodiagnostico.html` | Portafolio | Nextcloud / Storage | Sí |
| Datos de salud del paciente | `documentos-sesion.html` | Portafolio EC1375 | Supabase + Nextcloud + localStorage | Sí para el EC; **sensible, de un tercero** |
| Grabación de la sesión | Zoom → `grabacion-zoom.js` | Evidencia | Nextcloud | Sí |
| Respuestas del quiz (especialidad) | `quiz.html` | Prellenar el WhatsApp | Solo localStorage | Opcional |

## Inventario de assets

| Asset | Tipo | Fuente | Licencia | Estado |
|---|---|---|---|---|
| `Logos/Logo Paideia Tech - trimmed.png`, `icons/`, favicons | Logo | Propio | Propio | OK |
| `Logos/RED CONOCER LOGO OFICIAL.jpeg`, `ICE MEXICO LOGO OFICIAL.jpeg`, logos en base64 en `formato-oficial.js` / `documentos-sesion.html` | Logo de terceros | CONOCER / ICE / CICFM | Uso en formatos oficiales | Revisar: solo en PDFs oficiales, no en la landing |
| `assets/images/foto-renap-ejemplos.jpg` | Imagen | Material CONOCER | Revisar | Revisar |
| `tutoriales/*.mp4` | Video | Propio (grabador interno) | Propio | OK |
| Archivo e IBM Plex Sans (Google Fonts) | Fuente | Google | OFL | OK |
| Iconos de `CrmShell.icon()` | SVG en línea | **Revisar origen** | ? | Revisar |

## Plan de cambios

1. **Aplicado en esta rama (tipo A):** hallazgos 1, 2 (mitigación), 5–11.
2. **Requiere tu decisión (tipo B):** 2 (límite real / sacar del login público), borrar `api/kpi-data.js`, 13, 14, 17, 18.
3. **Con un profesional (tipo C):** 3 (aprobar y publicar el aviso), 4, 15, 16, 19.
