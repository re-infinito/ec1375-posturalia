# BORRADOR — Aviso de Privacidad Integral · Paideia Tech (sepconocer.paideiatech.com)

> **BORRADOR. No publicar tal cual.** Lo redactó Claude Code el 24 sep 2026 a partir de lo que el sitio
> hace de verdad según el código (ver `docs/legal/2026-09-24-auditoria.md`). No es asesoría jurídica.
> Todo lo marcado `[COMPLETAR: …]` es un dato que no consta en el repositorio y no se inventó.
> Antes de publicarlo: revisión de un abogado en protección de datos (México), sobre todo por los
> datos de salud de pacientes (sección 4) y porque la LFPDPPP se reformó en 2025 (verificar el texto
> vigente y la autoridad competente).
>
> Cuando esté aprobado: crear `aviso-privacidad.html`, enlazarlo en el pie de `index.html`, junto al
> botón de `registro.html`, en el paso de datos personales de `autodiagnostico.html` y en
> `documentos-sesion.html`.

---

## 1. Responsable

**[COMPLETAR: nombre o razón social del responsable]**, con domicilio en **[COMPLETAR: domicilio
confirmado — el sitio muestra "Río de la Plata 123A, Col. Roma, CP 64700, Monterrey, N.L.", verificar]**,
es responsable del tratamiento de tus datos personales.

Contacto para privacidad: **[COMPLETAR: correo que se revise de verdad, p. ej. privacidad@paideiatech.com
o contacto@paideiatech.com]**.

## 2. Qué datos recabamos

**Para crear tu cuenta** (`registro.html`, `panel.html`): nombre completo, correo electrónico, contraseña
(la guarda nuestro proveedor de autenticación; nosotros no la vemos) y tu firma del Acuerdo de
Confidencialidad (dibujada o escrita).

**Para tu proceso de certificación EC1375** (`autodiagnostico.html` y páginas siguientes):
- Identificación: CURP, domicilio (calle, colonia, código postal, ciudad, entidad), escolaridad,
  teléfonos, fotografía para el certificado, INE y CURP escaneados.
- Tus respuestas al Autodiagnóstico (142 reactivos), al examen de conocimientos y a la encuesta de
  satisfacción.
- Certificados de formación previa que decidas subir.
- Firmas (dibujadas o escritas) en los documentos del proceso.
- La grabación en video de tu sesión de evaluación (Zoom).
- Si pagas: el comprobante y los datos que procese la pasarela de pago (ver sección 6). No recibimos ni
  guardamos los datos de tu tarjeta.

**Datos personales sensibles.** La fotografía y, sobre todo, la información de salud de la persona que
atiendes en tu sesión de evaluación (sección 4).

## 3. Para qué los usamos

Finalidades necesarias (sin ellas no podemos darte el servicio):
1. Crear y administrar tu cuenta y tu acceso a la plataforma.
2. Llevar tu proceso de alineación y evaluación en el Estándar de Competencia EC1375 e integrar tu
   portafolio de evidencias.
3. Entregar tu expediente al Centro Evaluador y, a través de él, al CONOCER, para que se emita tu
   certificado y, si lo autorizas, se publique en el RENAP.
4. Cobrar las fases del proceso y verificar tus pagos.
5. Agendarte en las sesiones de alineación (Google Calendar y Zoom) y mandarte las confirmaciones por
   correo.

Finalidades secundarias: **[COMPLETAR: ¿se usan los datos para algo más, como promociones, nuevos
cursos o testimonios? Si no, borrar esta línea. Si sí, listarlas y ofrecer cómo negarse.]**

## 4. Datos de los pacientes que atiendes en tu evaluación

Como parte del EC1375 capturas en la plataforma la Ficha de Registro, la Carta de Consentimiento, el Plan
de Sesión y el Plan de Seguimiento de una persona real. Eso incluye su identificación, sus antecedentes
de salud, signos vitales y notas de tratamiento: **datos personales sensibles de un tercero**.

- Esos datos se usan solo para integrar tu portafolio de evaluación.
- Tú eres responsable de obtener el consentimiento expreso y por escrito de esa persona (la plataforma te
  da el Aviso de Privacidad y la Carta de Consentimiento para ello).
- **[COMPLETAR con el abogado: el papel de Paideia Tech frente a esos datos (¿encargado del candidato,
  corresponsable?) y si hace falta un convenio o una cláusula en el Acuerdo del candidato.]**

## 5. Con quién los compartimos (transferencias)

| Destinatario | Para qué | ¿Requiere tu consentimiento? |
|---|---|---|
| Centro Evaluador **[COMPLETAR: confirmar — los formatos dicen "CE1399-OC063-18 · Colegio Ilustre de Ciencias Forenses de México A.C."]** | Evaluar tu competencia y tramitar el certificado | No, es necesario para el servicio |
| CONOCER (RENAP) | Emitir y registrar tu certificado; publicarlo si lo autorizas | La publicación sí: la autorizas en el Autodiagnóstico |
| **[COMPLETAR: ¿alguien más? socios, colaboradores como "Christherapy"]** | | |

## 6. Proveedores que tratan datos por nuestra cuenta (encargados)

Estos servicios están en el código hoy; cada uno recibe solo lo necesario para su función:

| Proveedor | Qué recibe | País / región |
|---|---|---|
| Supabase (base de datos, autenticación, archivos) | Todo tu expediente en la plataforma | **[COMPLETAR: región del proyecto]** |
| Vercel (hospedaje del sitio y funciones) | Tu IP y las peticiones al sitio | EE. UU. |
| Nextcloud del Centro Evaluador, detrás de Cloudflare | Los PDF de tu portafolio y la grabación | **[COMPLETAR: confirmar ubicación del servidor]** / Cloudflare (global) |
| Mercado Pago | Datos del pago, tu correo | México |
| Resend | Tu correo y nombre (correos de confirmación) | EE. UU. |
| Google Calendar | Tu correo y nombre (invitación a la sesión de alineación) | EE. UU. |
| Zoom | Tu imagen y voz en las sesiones y en la grabación de evaluación | EE. UU. |
| WhatsApp (solo si tú nos escribes) | Tu número y tus mensajes | EE. UU. |
| jsDelivr, cdnjs, Google Fonts (librerías y tipografías) | Tu IP al cargar las páginas | Global |

## 7. Cookies y almacenamiento en tu navegador

No usamos cookies de publicidad ni de analítica. El sitio guarda en tu navegador (localStorage /
sessionStorage) tu sesión, tu preferencia de tema y el avance de tus formularios, para que no pierdas lo
que llevas; esa información también se respalda en tu cuenta. Puedes borrarla desde la configuración
de datos del sitio de tu navegador.

## 8. Tus derechos (ARCO) y cómo retirar tu consentimiento

Puedes pedir **acceso, rectificación, cancelación u oposición** al tratamiento de tus datos, o retirar
tu consentimiento, escribiendo a **[COMPLETAR: correo]** con tu nombre, el correo de tu cuenta y qué
pides. Te responderemos en un plazo de **[COMPLETAR: plazo legal vigente — verificar]**.

Ojo: si cancelas antes de terminar, no podremos concluir tu proceso de certificación; y los datos que ya
se entregaron al CONOCER se rigen por su propio aviso de privacidad.

## 9. Cuánto tiempo los conservamos

**[COMPLETAR: plazos — p. ej. expediente de certificación: X años después de emitido el certificado;
datos de pago: lo que exija la ley fiscal; cuentas que no avanzaron: X meses.]**

## 10. Cambios a este aviso

Publicaremos cualquier cambio en esta misma página. Última actualización: **[COMPLETAR: fecha]**.
