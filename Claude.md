# 📄 Claude.md - EC1375 Posturalia

## 🎯 PROYECTO: EC1375 - Certificación Oficial para Terapeutas Alternativas

**Última actualización:** 3 de agosto, 2026  
**Estado:** Landing + funnel completo de certificación en producción (v5.0). Script de ensamblado del expediente final YA CONSTRUIDO — pendiente probarlo con una respuesta real del Form (ver "Paso 4 completado" en la sección "SISTEMA DE CERTIFICACIÓN EC1375" más abajo).  
**URL en vivo:** https://ec1375-posturalia.vercel.app

---

## 📋 DESCRIPCIÓN DEL PROYECTO

**Objetivo:** Crear una landing page de alta conversión que regulariza terapeutas alternativas en México (masajistas, acupunturistas, terapeutas holísticos, etc.) a través de la certificación oficial **EC1375 (SEP-CONOCER)**.

**Audiencia principal:**
- Terapeutas alternativas sin credenciales oficiales
- Edad: 25-55 años
- Operan en México (principalmente)
- Viven con **miedo legal** (COFEPRIS, multas, cierres)
- Ya tienen clientes pero sin respaldo profesional oficial

**Problema psicológico que resuelve:**
- **Miedo primario:** Multas COFEPRIS ($80k), cierre de consultorio, responsabilidad penal
- **Miedo secundario:** Pérdida de credibilidad ante pacientes modernos
- **Fricción:** Precio ($14,750) vs. ganancia actual

---

## 🧠 ESTRATEGIA EMOCIONAL (v2.0)

### Dos Pilares Emocionales Centrales

```
PILAR 1: "Tu vocación es ayudar personas, NO vivir con el estrés 
         de no contar con respaldo legal"

PILAR 2: "Deja de ejercer con MIEDO. Empieza a ejercer con la 
         TRANQUILIDAD de estar en regla"
```

### Arco Emocional de Conversión

```
VOCACIÓN (identificación)
    ↓
MIEDO (validación del problema real)
    ↓
TRANSFORMACIÓN (esperanza via otros como ellos)
    ↓
TRANQUILIDAD (beneficio emocional final)
    ↓
ACCIÓN (botón: "SÍ, QUIERO DORMIR TRANQUILO")
```

### Secciones y Copy Emocional

| Sección | Objetivo | Copy Clave |
|---------|----------|-----------|
| **Hero** | Resonancia vocacional | "Tu vocación es ayudar personas. NO VIVIR CON MIEDO" |
| **Antes/Después** | Validación del contraste | Miedo (rojo) ↔ Tranquilidad (azul) |
| **Miedos** | Amplificar problema | "El miedo constante a COFEPRIS", "El miedo de perder credibilidad", "El miedo al daño sin saber" |
| **Tranquilidad** | Ofrecer solución emocional | "Protección Legal Oficial", "Credibilidad Real", "Libertad sin Culpa" |
| **Testimonios** | Social proof emocional | Narrativas Antes/Ahora/Emoción |
| **CTA Final** | Poder y acción | "SÍ, QUIERO DORMIR TRANQUILO" |

---

## 🛠️ STACK TÉCNICO

**Frontend:**
- HTML5 + CSS3 (con custom properties)
- JavaScript vanilla (sin frameworks)
- Responsive mobile-first

**Diseño:**
- Dark mode profesional
- Colores: Azul Cyan (#0088FF) + Dorado (#D4AF37) + Rojo (#FF3333)
- Tipografía: System fonts (sans-serif)
- Animaciones: CSS keyframes (fadeInUp, hover effects)

**Integración de Pagos:**
- Mercado Pago SDK v2
- Payment link: https://mpago.la/1QeeSHo
- Alternativa: Transferencia bancaria (Banorte CLABE)

**Deployment:**
- Git repository: https://github.com/re-infinito/ec1375-posturalia
- Hosting: Vercel (auto-deploy on push)
- Dominio: ec1375-posturalia.vercel.app

**Configuración:**
- `.env.local` (no commiteado): Credenciales Mercado Pago
- `vercel.json`: Config de build y output
- `.gitignore`: Excluye .env.local y ASSETS_GUIDE.md

---

## 📁 ESTRUCTURA DE ARCHIVOS

```
/Users/diegogarzamx/Desktop/EC1375/
├── index.html                     # Landing page completa (v2.0 emocional)
├── quiz.html                      # Quiz de calentamiento (funnel v3.0)
├── success.html / failure.html / pending.html   # Post-pago Mercado Pago
├── autodiagnostico.html           # 142 reactivos EC1375, wizard 8 pasos
├── plan-evaluacion.html           # Hereda datos del Autodiagnóstico, agenda cita
├── documentos-sesion.html         # Ficha/Consentimiento/Plan Sesión/Seguimiento, firma paciente
├── evidencias.html                # Checklist + Google Form embebido
├── encuesta-satisfaccion.html     # 8 preguntas oficiales, cierre del funnel
├── Claude.md                      # Este archivo - documentación del proyecto
├── .env.local                     # Credenciales (NO COMMITEAR)
├── .gitignore                     # Git ignore rules (incluye PDFs, credenciales OAuth)
├── vercel.json                    # Config de Vercel
├── ASSETS_GUIDE.md                # Guía para agregar fotos/videos
├── MERCADO_PAGO_SETUP.md          # Documentación de integración MP
├── client_secret_....json         # Credenciales OAuth Google Drive (NO COMMITEAR)
├── PORTAFOLIO HUMBERTO LOT 1375.pdf   # Expediente real de referencia (NO COMMITEAR, confidencial)
├── _internal_no_publicar/         # TODO gitignored — scripts y assets con datos sensibles
│   ├── token.json                     # Token OAuth ya autorizado para Drive API
│   ├── setup_drive_auth.py            # Re-correr si el token expira
│   ├── test_drive_connection.py       # Prueba rápida de conexión a Drive
│   ├── plantilla_IEC_blanco.pdf       # IEC en blanco, 83 págs., listo para usar
│   └── assemble_expediente.py         # ✅ Construido — falta probar con datos reales (ver Paso 5)
└── assets/                        # (Carpeta para fotos/videos - crear cuando se tengan)
    ├── images/
    │   ├── logo/
    │   ├── hero/
    │   ├── testimonials/
    │   └── icons/
    └── videos/
```

---

## 🎯 FUNNEL DE CONVERSIÓN COMPLETO (v3.0 - Nuevo)

**Última actualización:** 22 de julio, 2026  
**Versión:** 3.0 (Quiz → Landing → Pago → Confirmación)

### 🔄 Flujo Completo del Funnel

```
ETAPA 1: CALENTAMIENTO EMOCIONAL
┌─────────────────────────────────────┐
│ quiz.html - 5 Preguntas Emocionales │
├─────────────────────────────────────┤
│ 1. ¿Eres terapeuta sin validación?  │
│ 2. ¿Sabes el costo multa COFEPRIS?  │
│ 3. ¿Pacientes preguntaron credenciales? │
│ 4. ¿Te gustaría regularizarte?      │
│ 5. ¿Dispuesto si hay solución?      │
│ + Bonus: Especialidad (masaje, etc) │
└─────────────────────────────────────┘
          ↓ localStorage guarda respuestas
          ↓ Button: "VER MI SOLUCIÓN"
          
ETAPA 2: CONVERSIÓN
┌─────────────────────────────────────┐
│ index.html?source=quiz&specialty=X  │
├─────────────────────────────────────┤
│ Landing emocional v2.0              │
│ (Lead ya está calentado)             │
│ Detecta ?source=quiz (oculta nav)   │
│ Scroll automático a #transformacion │
└─────────────────────────────────────┘
          ↓ Button: "SÍ, QUIERO DORMIR TRANQUILO"
          
ETAPA 3: PAGO
┌─────────────────────────────────────┐
│ https://mpago.la/1QeeSHo            │
├─────────────────────────────────────┤
│ Mercado Pago - $2,000 MXN           │
│ Back-URLs configuradas:             │
│ - Success: /success                 │
│ - Failure: /failure                 │
│ - Pending: /pending                 │
└─────────────────────────────────────┘
          ↓ Pago completado
          
ETAPA 4: CONFIRMACIÓN + COMUNIDAD + NEXT SALE
┌─────────────────────────────────────┐
│ success.html - Celebración           │
├─────────────────────────────────────┤
│ ✅ Confetti animation               │
│ 📋 Confirmación de pago ($2,000)    │
│                                      │
│ 🎯 ALTO COMPROMISO CTA:              │
│ "📅 AGENDAR SESIÓN ALINEACIÓN"      │
│    - Box azul prominente con shimmer │
│    - 4 beneficios listados           │
│    - Mensaje personalizado c/ specialty │
│                                      │
│ 📱 BOTÓN: "UNIRME A WHATSAPP"       │
│    - Mensaje: "Acabo de apartar..."  │
│                                      │
│ 📅 Timeline próximos pasos          │
│ 🔒 Trust & Security info            │
└─────────────────────────────────────┘
          ↓ Click "AGENDAR ALINEACIÓN"
          ↓ WhatsApp: "Quiero agendar sesión $4,250"
          ↓ Equipo responde en 24-48h
          ↓ Primer pago siguiente: $4,250 (2-3 semanas)
          ↓
          ↓ Click "UNIRME A WHATSAPP"
          ↓ Se une a grupo + recibe bienvenida
          
PÁGINAS ALTERNATIVAS:
- failure.html - Pago rechazado (retry option)
- pending.html - Pago en espera (verificar estado)
```

### 📄 Archivos del Funnel (Nuevos)

| Archivo | Propósito | localStorage |
|---------|-----------|--------------|
| `quiz.html` | 5 preguntas emocionales | `quizResponses: {q1-q5, specialty}` |
| `success.html` | Post-pago celebration | Lee `quizResponses` para personalizar |
| `failure.html` | Pago fallido | Retry button → MP link |
| `pending.html` | Pago procesando | Auto-reload cada 30s |

### 🔗 Flujo técnico de redirecciones

```javascript
// Quiz → Landing
quiz.html → VER MI SOLUCIÓN button
  localStorage.setItem('quizResponses', {...})
  window.location.href = 'index.html?source=quiz&specialty=masaje#transformacion'

// Landing → Pago (ambos métodos)
index.html → SÍ, QUIERO DORMIR TRANQUILO button
  handleMercadoPagoPay() 
  window.location.href = 'https://mpago.la/1QeeSHo'

// Pago → Confirmación (configurado en Mercado Pago dashboard)
Mercado Pago back_urls:
  success: https://ec1375-posturalia.vercel.app/success
  failure: https://ec1375-posturalia.vercel.app/failure
  pending: https://ec1375-posturalia.vercel.app/pending

// Confirmación → WhatsApp
success.html → UNIRME A GRUPO button
  const specialty = localStorage.getItem('quizResponses')
  message = `Hola, acabo de apartar. Soy terapeuta de ${specialty}`
  window.open(`https://wa.me/528136071342?text=${message}`)
```

### 📊 Conversión esperada (Baseline)

```
Quiz entrada:         100%
Quiz → Landing:        80% (Si no abandonan quiz)
Landing → Pago:      15-25% (Tasa conversión típica)
Pago → WhatsApp:       60% (Click en botón CTA)
WhatsApp → Venta:    40-50% (Primer contacto en grupo)

FUNNEL TOTAL:        4.3% conversión (Baseline)
OPTIMIZADO:          7-10% (Con mejoras de UX)
```

### 🎯 Próximas optimizaciones

- [ ] Agregar URL parameter detection en index.html (source=quiz)
- [ ] Implementar auto-scroll a #transformacion si source=quiz
- [ ] Ocultar nav si source=quiz (landing más limpia)
- [ ] Configurar back_urls en Mercado Pago dashboard
- [ ] Crear funnel.js para lógica compartida (si es necesario)
- [ ] Agregar video de Fernando Villarreal (30-60s) en success.html
- [ ] Pixel de conversión (Facebook/Google) en success.html
- [ ] Email automático post-pago (opcional)

---

## 🎓 SISTEMA DE CERTIFICACIÓN EC1375 (v5.0 - 3 de agosto, 2026)

**Objetivo:** Después del pago ($2,000), el candidato completa TODO el proceso oficial de certificación EC1375 (autodiagnóstico, plan de evaluación, evidencias, encuesta) desde el navegador, sin papeleo. El equipo evaluador ensambla al final un solo PDF ("Portafolio de Evidencias") con la misma estructura que exige el organismo certificador — igual para cada candidato, solo cambian los datos.

**Documento de referencia:** `PORTAFOLIO HUMBERTO LOT 1375.pdf` (143 páginas, expediente real ya entregado por un centro evaluador) — **no está en git** (es confidencial, contiene datos personales reales). Se usó únicamente para mapear la estructura exacta que debe tener cada expediente. Vive en la raíz del proyecto localmente, gitignored.

**Logos oficiales:** `ICE MEXICO LOGO OFICIAL.jpeg` y `RED CONOCER LOGO OFICIAL.jpeg` (raíz del proyecto, SÍ están en git — son logos institucionales públicos, no datos confidenciales). Aparecen como header (red Conocer izq., ICEMéxico der.) en:
- Los 3 PDFs generados por el candidato que sí forman parte del expediente final: Autodiagnóstico, Plan de Evaluación, Encuesta de Satisfacción (embebidos como base64 vía `addOfficialLogos(doc)` en cada archivo — jsPDF corre en el navegador, no tiene acceso al filesystem)
- Portada, Índice, separadores de sección y Cédula de Evaluación en `assemble_expediente.py` (vía `draw_header_logos()`, referencia directa a los JPEG ya que corre server-side)
- **Deliberadamente NO** en `evidencias.html` (comprobante interno — no es parte del expediente oficial, no debe parecer un documento oficial)
- La plantilla `plantilla_IEC_blanco.pdf` ya trae sus propios logos originales (viene directo del PDF de Humberto, no hace falta tocarla)

**✅ Resuelto — Plan de Evaluación expandido al detalle completo:** `plan-evaluacion.html` ahora genera la tabla completa de **25 grupos de reactivos** (= los 142 ítems agrupados, igual que el oficial — el Plan de Evaluación real de Humberto tampoco desglosa reactivo por reactivo, agrupa como nuestro `AUTODIAGNOSTICO_DATA.categorias[].grupos[]`), cada grupo mapeado a su instrumento (`INSTRUMENTO_POR_TIPO`: Desempeños/Actitudes → Guía de Observación, Productos → Lista de Cotejo, Conocimientos → Cuestionario). El array `AUTODIAGNOSTICO_DATA` está **duplicado** dentro de `plan-evaluacion.html` (copiado de `autodiagnostico.html` — son páginas estáticas sin módulos compartidos; si se edita el catálogo de reactivos hay que actualizar ambos archivos). Genera ~4 páginas vía paginación automática de `jspdf-autotable` (Humberto usa 13 por tipografía más espaciada — mismo contenido, más denso). Los logos se redibujan en cada página nueva vía `didDrawPage` con `margin: {top: 24}` para no chocar con el header repetido de la tabla.

### Flujo completo (post-pago)

```
success.html
    ↓ botón "Ir a mi Autodiagnóstico"
autodiagnostico.html          ✅ EN PRODUCCIÓN
    142 reactivos oficiales EC1375, 4 Elementos, wizard de 8 pasos
    Selector de especialidad (acordeón, 5 categorías + "otra")
    Genera PDF/Word, calcula % y recomienda evaluarse si ≥90%
    ↓ botón "Ir a mi Plan de Evaluación"
plan-evaluacion.html          ✅ EN PRODUCCIÓN (calendario pendiente de conectar)
    Hereda nombre/especialidad/resultado del Autodiagnóstico (localStorage)
    Muestra la tabla COMPLETA de 25 grupos (=142 reactivos) mapeados a su
      instrumento (Guía de Observación/Lista de Cotejo/Cuestionario),
      igual que el oficial — reutiliza AUTODIAGNOSTICO_DATA (duplicado
      del archivo autodiagnostico.html)
    Agenda cita — placeholder para Google Calendar Appointment Schedule
      (const GOOGLE_CALENDAR_BOOKING_URL en el archivo, vacío = fallback a WhatsApp)
    Firma + genera PDF/Word (~4 páginas)
    ↓ botón "Después de tu sesión: Llena tus Documentos"
documentos-sesion.html        ✅ EN PRODUCCIÓN (3 de agosto, 2026)
    Wizard de 4 pasos, llenado junto con el usuario/paciente real durante
      o justo después de la sesión de Zoom — reemplaza la carga de FOTOS
      de documentos manuscritos por formularios digitales reales:
      1. Ficha de Registro de Atención (datos + antecedentes + signos
         vitales del usuario, firma usuario + firma candidato reutilizada
         del Autodiagnóstico)
      2. Carta de Consentimiento Informado (texto legal fijo + firma usuario)
      3. Plan de Sesión (condiciones, número/duración de sesiones, objetivos)
      4. Plan de Seguimiento (contacto, tabla de sesiones programadas,
         evolución/pronóstico/recomendaciones, firma usuario + candidato)
    Genera 4 PDFs independientes ("DOC 1"-"DOC 4", igual que Humberto),
      cada uno con los logos oficiales, descargables por separado
    ↓ botón "Sube tus Evidencias"
evidencias.html               ✅ EN PRODUCCIÓN, Google Form conectado
    Checklist de evidencias + Google Form embebido (ver detalle abajo)
    Firma + comprobante interno (YA NO se llama "Acuse" como si fuera el
    expediente final — es solo un aviso interno al equipo)
    ↓ botón "Encuesta de Satisfacción"
encuesta-satisfaccion.html    ✅ EN PRODUCCIÓN
    8 preguntas oficiales (Likert: Totalmente en desacuerdo → Muy de acuerdo)
    Firma + PDF + pantalla de cierre ("certificado en 60-90 días")
```

Cada página lee `localStorage.autodiagnosticoData` (guardado por autodiagnostico.html) para heredar nombre/CURP/especialidad sin que el candidato reescriba nada. `plan-evaluacion.html` y `evidencias.html` además guardan su propio estado en `localStorage.planEvaluacionData` / `evidenciasData`.

### Google Form "Evidencia EC1375" — qué sube el candidato

URL del form: `https://forms.gle/NsPV3UbrJ36jN8Nh6`
Embed URL (ya conectado en `evidencias.html` → `GOOGLE_FORM_EMBED_URL`):
`https://docs.google.com/forms/d/e/1FAIpQLSeI6K5YkxBnw_-ER8lHQNXk11AiujztXiyFnTHV2S0eJc0qxw/viewform?embedded=true`

Preguntas de carga de archivo actuales en el Form real (Google exige login para subir archivos, no se puede quitar):
- Nombre completo (texto — clave para identificar al candidato en Drive)
- Capturas de la sesión Zoom
- Ficha de Registro / Anamnesis, Carta de Consentimiento, Plan de Seguimiento (evidencias del **paciente/usuario real**, no del candidato)
- Identificación oficial (INE), CURP (evidencias del **candidato**)
- Foto para el diploma (specs oficiales CETAMM: fondo blanco, sin retoques, no mayor a 2 meses — están documentadas en `evidencias.html`)
- Certificados/diplomas de formación previa (opcional)

**⚠️ PENDIENTE (lo hace Diego directo en Google Forms, no en código):** agregar 4 preguntas de carga más — "Sube tu Autodiagnóstico (PDF)", "Sube tu Plan de Evaluación (PDF)", "Sube tu Encuesta de Satisfacción (PDF)", y **"Sube tu Plan de Sesión (PDF)"** (nueva, generada por `documentos-sesion.html`, ver abajo) — para que esos 4 PDFs generados por el candidato también caigan en Drive junto con las evidencias (el script de ensamblado los necesita, ver abajo).

Todos los archivos subidos caen en la carpeta de Drive **"Evidencia EC1375 (File responses)"** — confirmado y accesible vía API (ver siguiente sección).

### 📎 Auditoría de los 10 "documentos anexos" del expediente (4 de agosto, 2026)

Diego preguntó si los documentos que aparecen como anexos en el expediente de Humberto se podían volver digitales, replicables para cualquier candidato. Se categorizaron en 3 grupos:

**Grupo 1 — Documentos del paciente/usuario, llenados durante/después de la sesión → ✅ CONSTRUIDO HOY** (`documentos-sesion.html`):
Ficha de Registro de Atención, Carta de Consentimiento Informado, Plan de Sesión, Plan de Seguimiento. Antes se pedía subir una *foto* de estos llenados a mano en `evidencias.html`; ahora es un formulario digital real con firma del paciente capturada en el navegador (canvas o texto), que genera 4 PDFs con el mismo formato "DOC 1"-"DOC 4" que Humberto. La firma del candidato/a se reutiliza automáticamente de la ya capturada en `autodiagnostico.html` (no se le pide firmar de nuevo).

**Grupo 2 — Los 3 "Acuse de recibido" (Tríptico / Cédula / Plan de Evaluación):**
✅ **Tríptico y Plan de Evaluación → CONSTRUIDOS (4 de agosto, 2026).** Cada uno reutiliza la firma que el candidato ya dio en un paso anterior (Tríptico → firma del Autodiagnóstico; Plan de Evaluación → firma propia del Plan de Evaluación), sin pedirle firmar de nuevo:
  - `generateAcuseTripticoPDF()` en `autodiagnostico.html` — botón "📄 Acuse de Recibido — Tríptico" en la pantalla de resultado.
  - `generateAcusePlanEvaluacionPDF()` en `plan-evaluacion.html` — botón "📄 Descargar Acuse de Recibido" en la pantalla final.
  - Ambos con logos oficiales, 1 página, verificados visualmente.
  - Agregados como ítems requeridos al checklist de `evidencias.html` (`EVIDENCIAS_REQUERIDAS`).
  - Integrados en `assemble_expediente.py`: nuevos slots `acuse_triptico` / `acuse_plan_evaluacion` en `KEYWORD_SLOTS` (con match por `all()` estricto, ver bug corregido abajo), nueva sección separadora "4. Anexos" antes de insertarlos al final de `ordered_files`.
  - **⚠️ Pendiente que Diego haga en Google Forms (no se puede por API):** agregar 2 preguntas más de "Subir archivo" al Form real — "Sube tu Acuse de Tríptico (PDF)" y "Sube tu Acuse de Plan de Evaluación (PDF)". El script las detecta automáticamente por palabras clave en cuanto existan.
  - **Bug corregido en `assemble_expediente.py`:** `build_question_map()` usaba `all(...) or any(...)` para el match de `KEYWORD_SLOTS`, lo cual es matemáticamente redundante (se reduce a solo `any()` — basta con que UNA palabra clave coincida, no todas). Esto era tolerable mientras las tuplas de keywords no compartían ninguna palabra, pero al agregar las dos reglas nuevas (ambas empiezan con "acuse") se volvía ambiguo: un título de pregunta como "Sube tu Acuse de Plan de Evaluación (PDF)" hubiera podido caer en el slot equivocado (`pdf_plan_evaluacion` en vez de `acuse_plan_evaluacion`), o las dos reglas de acuse no podían distinguirse entre sí. Se corrigió a `all(...)` estricto (exige TODAS las palabras clave) y se reordenó `KEYWORD_SLOTS` para que las reglas de acuse (más específicas) se evalúen antes que la regla genérica de "plan de evaluación".

⏭️ **Cédula → NO construido.** Depende de que exista el flujo del evaluador (no construido) — el candidato no puede generar este acuse por su cuenta.

**Grupo 3 — Verificación Interna del Proceso de Evaluación → NO es candidate-facing:**
Checklist de auditoría interna del Centro Evaluador. No va en el sitio del candidato — sería parte de una futura herramienta interna para el equipo de Diego (ver Backlog).

**⚠️ Posible documento faltante sin confirmar del todo:** Diego mencionó que en el documento de Humberto "Encuesta de Satisfacción" y "Encuesta de Satisfacción del Proceso de Evaluación - Certificación de competencias" aparecen como **dos documentos distintos**. Lo que ya está construido (`encuesta-satisfaccion.html`) coincide con el título largo (8 preguntas Likert, pág. 136 de Humberto). El corto probablemente corresponde a la pág. 138 ("Cédula de Evaluación del Servicio a Usuarios", escala Bueno/Regular/Malo sobre trato/instalaciones/comunicación/entrega del certificado) — **no confirmado con Diego, no construido todavía.**

### Google Drive API — ✅ CONECTADA Y FUNCIONANDO

- Proyecto de Google Cloud: `EC1375-Portafolios`, dueño de la cuenta: `de.minconsciente@outlook.com`
- Credenciales OAuth (tipo "Aplicación de escritorio") descargadas en:
  `/Users/diegogarzamx/Desktop/EC1375/client_secret_1005730568235-e1k1r7e2g41jr4sujmgob53sab7956hm.apps.googleusercontent.com.json`
- Token ya autorizado (primer login hecho) en:
  `/Users/diegogarzamx/Desktop/EC1375/_internal_no_publicar/token.json`
- Ambos archivos están en `.gitignore` (`client_secret*.json`, `token.json`, `_internal_no_publicar/`) — **nunca deben subirse a GitHub**
- Scope usado: `drive.readonly`
- Verificado con `_internal_no_publicar/test_drive_connection.py`: la API lista correctamente la carpeta "Evidencia EC1375 (File responses)"
- Si el token expira/falla, volver a correr `_internal_no_publicar/setup_drive_auth.py` (abre el navegador real del usuario para reautorizar — nunca ingresar credenciales por Claude)

### Plantilla del Instrumento de Evaluación de Competencia (IEC) — ✅ GENERADA

Derivada del PDF de Humberto (páginas 35-117, 83 páginas), con todas las marcas del evaluador blanqueadas para reutilizar como plantilla en blanco por candidato.

**Ubicación:** `_internal_no_publicar/plantilla_IEC_blanco.pdf` (gitignored, no subir a GitHub — se deriva de un documento con datos reales de un tercero)

**Qué se blanqueó (proceso documentado por si hay que rehacerlo):**
1. 210 celdas de columnas SÍ/NO en tablas de reactivos — los checks eran **dibujados a mano** (curvas vectoriales), no texto, así que se blanquearon por posición de celda (`pdfplumber.find_tables()` + estado persistente de columnas entre páginas, ya que muchas páginas continúan una tabla sin repetir el encabezado)
2. 37 respuestas de preguntas de opción múltiple ("Respuesta Elejida: b)" — el documento oficial tiene un typo, "Elejida" con J)
3. Firmas manuscritas al pie de las 83 páginas (banda blanca y=655-792 en coords PDF; las firmas empiezan tan arriba como y=674, hay que dejar margen generoso)
4. Nombre de evaluador/candidato en la portada del IEC (página 35), con coordenadas precisas para no tapar las etiquetas del formulario

**⚠️ Artefacto cosmético conocido sin resolver:** aparece la palabra "text0" en un espacio vacío de la portada (pág. 1 del IEC), invisible en el original, probablemente un choque de recursos de fuente entre `reportlab` (usado para generar los overlays blancos) y `pypdf` (usado para fusionarlos). No tapa contenido real. **Revisar antes de usar con un candidato real** — si molesta, hay que investigar más a fondo el merge_page de pypdf o regenerar esa página específica con otra técnica.

**Script usado para generar la plantilla** (no quedó guardado como archivo — se corrió inline vía Bash/Python en la sesión). Si hay que regenerar: usar `pdfplumber` para detectar tablas y columnas SÍ/NO página por página con estado persistente entre páginas, `reportlab` para dibujar rectángulos blancos, `pypdf` (`PdfReader`, `PdfWriter`, `merge_page`) para fusionar el overlay con cada página original.

### Portafolio simulado (prueba de concepto) — ✅ generado y entregado

Se generó un portafolio de prueba completo (candidata ficticia "Ana Sofía Ramírez López") corriendo datos simulados a través de las 4 páginas reales del sitio, capturando la salida real de `jsPDF` (interceptando `.save()` para obtener el PDF en base64 en vez de descargarlo), y fusionando todo con `pypdf` + una portada/índice generados con `reportlab`. Confirma que el pipeline técnico de ensamblado funciona de principio a fin. Sirvió para validar estructura contra el documento de Humberto antes de construir el script de producción.

### 📐 Estructura EXACTA del expediente final (verificada página por página contra Humberto)

```
1.  Portada                                         (generada — datos del candidato)
2.  Índice                                          (generado — fijo, mismo para todos)
3.  "1. Datos del Candidato" (separador)
4.  Ficha de Registro del candidato                 (cubierto por datos personales del Autodiagnóstico)
5.  CURP oficial (constancia)                        extraído del Form/Drive
6.  INE (frente y reverso)                           extraído del Form/Drive
7.  Autodiagnóstico (142 reactivos)                 generado por el candidato → SUBIDO al Form
8.  "2. Recopilación de Evidencias" (separador)
9.  Plan de Evaluación                              generado por el candidato → SUBIDO al Form
10. Instrumento de Evaluación de Competencia (IEC)   plantilla en blanco (83 págs.) — LO LLENA el evaluador
11. Ficha de Registro del usuario/paciente (sesión)  extraído del Form/Drive
12. Carta de Consentimiento Informado (del paciente) extraído del Form/Drive
13. Plan de Sesión (del paciente)                    extraído del Form/Drive
14. Plan de Seguimiento (del paciente)               extraído del Form/Drive
15. Referencia al video de la sesión                 página con liga a YouTube/plataforma
16. "3. Cierre de la Evaluación" (separador)
17. Cédula de Evaluación                             plantilla en blanco — LO LLENA el evaluador
18. Encuesta de Satisfacción                        generada por el candidato → SUBIDA al Form
19. "4. Anexos" (separador)
20. Acuse de Recibido — Tríptico Derechos y Obligaciones  (dato ya capturado: `triptychAccepted` del Autodiagnóstico)
```

Importante: el INE/CURP del candidato van cerca de la portada (sección "Datos del Candidato"), **no** junto a las evidencias de la sesión — esas evidencias (Ficha/Carta/Plan de Sesión/Plan de Seguimiento) son del **paciente real** de la sesión práctica, no del candidato, y van después del IEC.

### ✅ Paso 4 completado — script de ensamblado construido

`_internal_no_publicar/assemble_expediente.py` (nunca en el repo público — maneja datos personales reales). Uso:

```bash
cd _internal_no_publicar
python3 assemble_expediente.py "Nombre Completo Del Candidato" ["liga al video, opcional"]
```

Qué hace:
1. Usa la **Google Forms API** (no Drive directamente) para leer las respuestas del Form "Evidencia EC1375" y encontrar la respuesta cuyo "Nombre completo" coincide (fuzzy match) con el candidato buscado — esto es necesario porque Google organiza los archivos subidos **por pregunta**, no por candidato, así que sin leer la respuesta específica no hay forma de saber qué archivo pertenece a quién
2. Descarga cada archivo de esa respuesta desde Drive, convierte imágenes a PDF con Pillow si hace falta (los PDFs subidos se usan tal cual)
3. Genera dinámicamente con `reportlab`: portada, índice (con lista de avisos de lo que falte), separadores de sección, Cédula de Evaluación en blanco, y la página de referencia al video
4. Inserta `plantilla_IEC_blanco.pdf`
5. Fusiona todo con `pypdf` en el orden verificado contra Humberto
6. Guarda en `_internal_no_publicar/expedientes/Portafolio_EC1375_[Nombre].pdf`

**Diseño clave:** si falta cualquier evidencia (no subida, o la pregunta todavía no existe en el Form real), el script **no falla** — genera el expediente igual y lista cada cosa faltante en rojo en la página de Índice del propio PDF, además de imprimirlo en consola. Ya probado end-to-end con datos simulados (portada, índice con avisos, Cédula) — se ven correctamente.

**Scopes de Google ampliados:** el token pasó por 3 rondas de reautorización a lo largo de la sesión (cada una abrió el navegador real de Diego para el consentimiento):
1. `drive.readonly` (inicial)
2. + `forms.responses.readonly` + `forms.body.readonly` (para leer respuestas y estructura del Form — Diego habilitó "Google Forms API" en el proyecto de Cloud)
3. + `forms.body` en vez de `forms.body.readonly` (permiso de escritura, para agregar preguntas al Form vía API)

Si el token expira, volver a correr `setup_drive_auth.py` (ya tiene los 3 scopes finales).

**✅ Ya resuelto:** se agregó vía API la pregunta de texto **"Liga al video completo (YouTube u otra plataforma)"** al Form real (`add_text_question.py`, dejado como referencia). `assemble_expediente.py` ya la lee automáticamente de la respuesta del candidato (slot `video_link`) — ya no depende únicamente del argumento manual.

**❌ Descubrimiento importante — límite real de la API de Google:** se intentó agregar las 4 preguntas de "subir archivo" faltantes (Autodiagnóstico, Plan de Evaluación, Encuesta, Foto para diploma) vía `forms().batchUpdate()` y Google la rechaza explícitamente:
```
400 INVALID_ARGUMENT: Creation of file_upload question not supported.
```
Es una restricción intencional de Google (no se puede evitar con otro scope ni otro método) — las preguntas de tipo archivo **solo se pueden crear desde la interfaz web de Google Forms**, nunca por API. Queda documentado en `add_form_questions.py`.

**⚠️ Bloqueadores para probar con datos reales (Paso 5), pendientes de que Diego los resuelva:**
1. **El Form real tiene 0 respuestas enviadas.** Hay carpetas de Drive creadas para cada pregunta de archivo (evidencia de que se seleccionaron archivos en algún intento), pero están vacías y `forms().responses().list()` devuelve 0 — probablemente el formulario se abrió y se seleccionaron archivos pero nunca se le dio clic final a "Enviar". Hay que completar un envío real de principio a fin para poder probar.
2. **Diego debe agregar manualmente 4 preguntas tipo "Subir archivo" en la interfaz de Google Forms** (no se puede por API, ver arriba): "Sube tu Autodiagnóstico (PDF)", "Sube tu Plan de Evaluación (PDF)", "Sube tu Encuesta de Satisfacción (PDF)", "Foto para tu diploma". El script las detecta automáticamente por palabras clave en el título en cuanto existan — no hace falta tocar el código, solo agregarlas en Forms.
3. **Acuse de Recibido del Tríptico** (Anexos): el dato `triptychAccepted` vive solo en el `localStorage` del candidato — el script no lo incluye todavía. Pendiente de decidir cómo capturarlo (ej. otra pregunta de texto/checkbox en el Form, igual que se hizo con la liga al video).

**Scripts de diagnóstico/setup auxiliares** (en `_internal_no_publicar/`, no forman parte del flujo de producción por candidato): `explore_drive_structure.py`, `explore_forms_api.py`, `find_response_sheet.py`, `check_drive_files_detail.py`, `add_text_question.py`, `add_form_questions.py` (intento fallido, documentado arriba).

### 🔮 Backlog — no urgente, pero anotado para cuando escale a más candidatos

1. **Autenticación por candidato:** usuario/contraseña o token de un solo uso por alumno — hoy cualquiera con el link accede, sin identidad verificada.
2. **Panel de aprobación/filtrado para el equipo:** ver en qué etapa está cada candidato y aprobar/rechazar antes de ensamblar/entregar.
3. **Persistencia centralizada:** hoy todo vive en `localStorage` del navegador del candidato — si limpia caché o cambia de dispositivo, pierde su avance. Necesita base de datos real antes de invitar candidatos externos.
4. **Recuperar PDFs perdidos:** si el candidato pierde sus 3 PDFs antes de subirlos al Form, hoy no hay forma de regenerarlos (mismo motivo que el punto 3).
5. **Multi-evaluador:** número de WhatsApp y nombre de evaluador están fijos en el código.
6. **Anti-duplicados:** validar que un mismo CURP no se registre dos veces.
7. **Notificación de estado al candidato:** página tipo "así va tu proceso" en vez de preguntar por WhatsApp.

### ⚠️ Puntos abiertos sin resolver

1. **"Foto para el diploma" y "Certificados de formación":** no se encontró su lugar exacto en el expediente de Humberto — por ahora van en Anexos, ajustar si la evaluadora indica otra cosa.
2. **"Formato de Atención a Usuarios"** (págs. 2-3 de Humberto) y **"Verificación Interna"/"Formato Servicio a Usuarios"** (págs. 137-138): parecen documentos de admisión/auditoría interna del Centro Evaluador, no generados por el candidato — se omiten del expediente estándar salvo que la evaluadora confirme que se requieren.
3. **Cédula de Evaluación y IEC llenos:** ambos los llena el evaluador después de revisar el video/evidencias — el script de ensamblado los inserta en blanco; falta un segundo flujo (fuera de este alcance por ahora) para que el evaluador los llene digitalmente y se regenere el expediente ya completo.
4. **Google Calendar en `plan-evaluacion.html`:** el candidato pidió que fuera "horarios fijos recurrentes" en vez de un calendario en tiempo real tipo Calendly — **todavía no se configuró**, el placeholder `GOOGLE_CALENDAR_BOOKING_URL` sigue vacío y usa el fallback de WhatsApp.

---

## 🔐 CREDENCIALES Y CONFIGURACIÓN

### Mercado Pago
```
Public Key: APP_USR-2465263038921252-072114-fce315dcc9b9550df49c635de92e696f-724130873
Client ID: 2465263038921252
Payment Link: https://mpago.la/1QeeSHo
Precio: $2,000 MXN (apartado)
```

**Ubicación en código:**
- `index.html` línea 1210: `const publicKey = '...'`
- `index.html` línea 1249: `window.location.href = 'https://mpago.la/1QeeSHo'`

### Transferencia Bancaria
```
Banco: Banorte
Titular: Jose Fernando Villarreal Flores
Cuenta: 4189143315836695
CLABE: 072580006971824032
```

### Contacto y WhatsApp
```
Teléfono: +52 81 3607 1342
Email: posturalia.d817@gmail.com
WhatsApp: https://wa.me/528136071342
```

---

## 🚀 DEPLOYMENT Y CI/CD

### Flujo de Deployment

```
1. Editar archivos locales
2. git add / git commit
3. git push origin main
4. ↓ (Automático)
5. Vercel detecta push
6. Vercel construye y despliega
7. Landing live en 30-60 segundos
```

### Comandos Git Útiles

```bash
# Ver cambios sin commitar
git status

# Agregar archivos específicos
git add index.html

# Commit con mensaje descriptivo
git commit -m "Descripción del cambio"

# Push a main (trigger deploy automático)
git push origin main

# Ver últimos commits
git log --oneline -5
```

### Verificar Deployment

- Vercel dashboard: https://vercel.com/re-infinito/ec1375-posturalia
- Landing live: https://ec1375-posturalia.vercel.app
- Tiempo típico: 30-60 segundos después de push

---

## 📊 ESTRUCTURA DE LA LANDING PAGE (v2.0)

### Secciones Actuales

1. **Header** (sticky)
   - Logo Posturalia
   - Nav links: ¿Por Qué?, Proceso, Preguntas, Apartar Ahora

2. **Hero Section** (emoción + urgencia)
   - Pill badge: "ÚLTIMO DÍA • CUPO LIMITADO • SEPTIEMBRE"
   - Headline: "Tu vocación es ayudar personas. NO VIVIR CON MIEDO"
   - Subheadline: Deja de ejercer con MIEDO → TRANQUILIDAD
   - Copy narrativo: Resonancia vocacional
   - Countdown regresivo (⏰ Quedan Xh Ym Zs)
   - CTA: "SÍ, QUIERO DORMIR TRANQUILO"
   - Secondary CTA: "Ver Mi Transformación"
   - Social proof: "156+ Terapeutas ya inscritos"

3. **Antes/Después Emocional** (NUEVA - v2.0)
   - Bloque izquierdo (Rojo): "TRABAJAS CON MIEDO"
     - 5 puntos de miedo con ✗ rojo
   - Arrow divider (Dorado)
   - Bloque derecho (Azul): "TRABAJAS CON TRANQUILIDAD"
     - 5 puntos de tranquilidad con ✓ verde

4. **Miedos** (reescrito v2.0)
   - Título: "ESTOS MIEDOS SON REALES & TÍ LOS VIVES"
   - 3 tarjetas emocionales: Miedo a COFEPRIS, Pérdida de credibilidad, Daño sin saber
   - 3 tarjetas de solución: Protección legal, Credibilidad real, Libertad sin culpa

5. **Timeline / Cómo Funciona**
   - Paso 1: Apartado ($2k, hoy)
   - Paso 2: Alineación ($4.25k, 2-3 semanas)
   - Paso 3: Evaluación ($6k, 1-2 semanas)
   - Paso 4: Entrega ($2.5k, 60-90 días)
   - Total: $14,750 MXN

6. **Testimonios** (expandidos v2.0)
   - María C. (Masajista Holística - Monterrey)
   - Alberto H. (Terapeuta Manual - CDMX)
   - Laura G. (Acupunturista - Guadalajara)
   - Cada uno: Antes/Ahora/Emoción

7. **Opciones de Pago**
   - Transferencia bancaria (Banorte)
   - Mercado Pago (link directo)

8. **FAQ** (acordeones expandibles)
   - 6 preguntas frecuentes resueltas

9. **Final CTA** (v2.0 emocional)
   - Título: "¿HASTA CUÁNDO VAS A ESPERAR?"
   - Copy: Comparación social (otros ya se certifican)
   - Countdown regresivo
   - CTA: "SÍ, QUIERO DORMIR TRANQUILO"
   - Contacto: Teléfono, WhatsApp, Email

10. **Sticky CTA** (flotante)
    - Aparece al scrollear
    - CTA: "Apartar Ahora"

---

## 🎨 DISEÑO Y ANIMACIONES

### Colores
```css
--dark: #050a1a              /* Fondo principal */
--dark-light: #0f1428        /* Cards/secciones */
--primary: #0088FF           /* Azul Cyan - confianza */
--primary-light: #00CCFF     /* Azul claro - hover */
--accent: #FFD700            /* Dorado - énfasis */
--text: #D0D0D0              /* Texto secundario */
--text-bright: #FFFFFF       /* Texto principal */
--danger: #FF3333            /* Rojo - miedos */
--success: #00FF88           /* Verde - tranquilidad */
```

### Animaciones
- `fadeInUp`: Cards, timeline steps, testimonios (cascada con delay)
- `hover`: Buttons con shine effect (::before pseudo-element)
- `pulse`: Countdown box (urgencia)
- Smooth scroll behavior (scroll-behavior: smooth)

### Responsive
- Mobile-first approach
- Breakpoint: 768px
- Grids se colapsan a 1 columna
- Buttons full-width en mobile
- Font sizes ajustables (clamp)

---

## 📱 FUNCIONALIDADES JAVASCRIPT

### updateCountdown()
- Calcula diferencia entre ahora y 2026-07-21 23:59:59
- Actualiza cada segundo
- Muestra: "⏰ Quedan Xh Ym Zs"
- Cierra oferta cuando countdown llega a 0

### handleMercadoPagoPay()
- Redirige a: https://mpago.la/1QeeSHo
- Trigger: Todos los botones "SÍ, QUIERO DORMIR TRANQUILO"

### Sticky CTA Visibility
- Aparece cuando scroll < 100px antes de final-cta
- Se oculta cuando llega a final-cta

### FAQ Toggle
- Expande/colapsa respuestas
- Rotación del toggle icon

### copyToClipboard(text)
- Copia CLABE al portapapeles
- Muestra confirmación

---

## 📸 ASSETS Y MEDIA (Pendientes)

### Fotos Necesarias
- [ ] Logo Posturalia (ya existe: Logo Posturalia.jpeg)
- [ ] Foto/video hero: Terapeuta en consultorio profesional
- [ ] Foto/video transformación: Antes vs. Después
- [ ] Avatares testimonios: María, Alberto, Laura (reales si es posible)
- [ ] Iconos para secciones de miedos

### Video Script (Pendiente - Fernando Villarreal)
**Duración:** 30-60 segundos  
**Propósito:** Introduce el problema y la solución de manera emocional

---

## 🔄 HISTORIAL DE CAMBIOS PRINCIPALES

### v2.0 - Rediseño Emocional (21 JUL 2026)
- ✅ Hero: Nueva pregunta emocional
- ✅ Nueva sección Antes/Después visual
- ✅ Miedos: Narrativa emocional profunda
- ✅ Testimonios: Estructura Antes/Ahora/Emoción
- ✅ CTA: Cambio a "SÍ, QUIERO DORMIR TRANQUILO"
- ✅ Estilos CSS para antes/después

### v1.5 - Integración Mercado Pago (21 JUL 2026)
- ✅ SDK Mercado Pago integrado
- ✅ Payment link configurado
- ✅ Credenciales en .env.local
- ✅ Botones redirigen a pago

### v1.4 - Logo y Tipografía (21 JUL 2026)
- ✅ Logo Posturalia agregado al header
- ✅ Tamaño logo aumentado (50px)
- ✅ Mayúsculas en títulos

### v1.3 - Animaciones y Contraste (21 JUL 2026)
- ✅ Botones con shine effect
- ✅ Cards con fade-in cascada
- ✅ Colores con mayor contraste
- ✅ Countdown box pulsante

### v1.0 - Landing inicial (20 JUL 2026)
- ✅ Estructura básica 8 secciones
- ✅ Dark mode tema
- ✅ Responsive design
- ✅ FAQ funcionando

---

## 📊 ESTRUCTURA DE LA SUCCESS PAGE (v1.0)

### Secciones de success.html

1. **Celebration Section**
   - Checkmark emoji grande (✅)
   - Título: "¡LO HICISTE!"
   - Subtítulo: "Tu primer paso hacia la tranquilidad está confirmado"
   - Animación: slideUp con fade-in

2. **Payment Confirmation Box**
   - Borde verde (#00FF88)
   - Muestra: Monto ($2,000 MXN), Concepto, Estado (✓ Pagado), Próximo paso
   - Líneas separadoras sutiles
   - Animación: slideUp con delay

3. **High-Commitment CTA: Alignment Session** ⭐ NEW
   - Box azul con shimmer animation en borde superior
   - Título: "🎯 Próximo Paso: Sesión de Alineación"
   - Descripción: 2-3 semanas, $4,250, preparación evaluación
   - Features list con 4 beneficios (50min gabinete, 1h práctica, simulación, feedback)
   - Botón grande: "📅 AGENDAR SESIÓN DE ALINEACIÓN"
   - Subtexto: "O espera contacto del equipo en 24-48h"
   - **Objetivo:** Convertir inmediatamente siguiente venta ($4,250)

4. **WhatsApp Community Invitation**
   - Titulo: "📱 Únete a la Comunidad"
   - Descripción: 156+ terapeutas transformando vidas
   - Botón principal: "📱 UNIRME AL GRUPO DE WHATSAPP"
   - Copy-paste alternativa si no abre WhatsApp
   - Mensaje personalizado: incluye specialty del quiz

5. **What's Next Timeline**
   - 5 pasos con timeline markers (✓, 1, 2, 3, 4)
   - HOY: Apartado confirmado ($2,000 ✓)
   - 24-48h: Contacto WhatsApp + Bienvenida
   - 2-3 semanas: Sesión Alineación ($4,250)
   - 1-2 semanas después: Evaluación ($6,000)
   - 60-90 días: Certificado Oficial ($2,500) ✓ REGULARIZADO
   - Visual: Blue timeline con circles numerados

6. **Trust & Security Section**
   - 🔒 Información protegida 100%
   - Comunicaciones SOLO sobre certificación
   - Trust logos: Mercado Pago, SEP-CONOCER, RENEC
   - Fondo: Subtle green tint

7. **Footer Contact**
   - "¿Urgencia? Contacta directamente:"
   - 3 opciones: WhatsApp, Teléfono, Email
   - Links funcionales y hover effects

---

## 📊 MÉTRICAS Y OBJETIVOS DE CONVERSIÓN

### Objetivo Principal
- **Lead → Apartado:** $2,000 MXN (pagado vía Mercado Pago)
- **Apartado → Inversión Total:** $14,750 MXN (4 pagos)

### Flujo de Conversión
```
Landing page visit (100%)
    ↓
Scroll a antes/después (?) %
    ↓
Ver miedos relacionados (?) %
    ↓
Click CTA "Dormir tranquilo" (?) %
    ↓
Completa pago Mercado Pago (?) %
    ↓
Recibe confirmación + WhatsApp de equipo (Conversión ✓)
```

### KPIs a Monitorear
- Tasa de click en "SÍ, QUIERO DORMIR TRANQUILO"
- Tasa de completar pago en Mercado Pago
- Tiempo promedio en página
- Scroll depth (% que ven cada sección)
- Dispositivo (desktop vs. mobile)

---

## 🔗 REFERENCIAS Y RECURSOS

### Documentación Interna
- `ASSETS_GUIDE.md` - Cómo agregar fotos/videos
- `MERCADO_PAGO_SETUP.md` - Setup detallado de pagos
- Plan emocional: `/Users/diegogarzamx/.claude/plans/mejoras-emocionales-landing.md`

### Externa
- [Mercado Pago Developers](https://www.mercadopago.com.mx/developers/)
- [SEP-CONOCER](https://www.conocer.gob.mx/)
- [RENEC Registro](https://www.gob.mx/renec)
- [Vercel Docs](https://vercel.com/docs)

### Git Repository
- GitHub: https://github.com/re-infinito/ec1375-posturalia
- Branch principal: `main`
- Usuario Git: Posturalia

---

## 💡 PRÓXIMAS MEJORAS SUGERIDAS

### Corto Plazo (1-2 semanas)
1. Agregar fotos/videos de testimonios reales
2. Video script de Fernando Villarreal (30-60s)
3. A/B testing en headlines
4. Analítica en Vercel

### Mediano Plazo (1 mes)
1. Página de éxito post-pago
2. Email automation (confirmación)
3. Pixel de conversión (Facebook, Google)
4. Landing en English (opcional)

### Largo Plazo (3+ meses)
1. Página de testimonios ampliada
2. Blog de tips para terapeutas
3. Calculadora de ROI (6 meses vs. inversión)
4. Community/grupo privado post-certificación

---

## 👤 CONTACTOS PRINCIPALES

**Founder/CEO:**
- Nombre: Diego Garza
- Email: re-infinito@outlook.com
- Teléfono: (disponible vía WhatsApp)

**Facilitador:**
- Nombre: Fernando Villarreal (Jose Fernando Villarreal Flores)
- Rol: Explica e invita a la certificación
- Video pendiente: 30-60s

**Equipo de Soporte:**
- WhatsApp: +52 81 3607 1342
- Email: posturalia.d817@gmail.com

---

## 🎯 INSTRUCCIONES PARA FUTURAS SESIONES

### Si necesitas editar la landing:

1. **Cambios de copy:**
   ```bash
   # Editar /Users/diegogarzamx/Desktop/EC1375/index.html
   # Hacer cambios
   git add index.html
   git commit -m "Descripción del cambio"
   git push origin main
   ```

2. **Agregar fotos/videos:**
   - Ver `ASSETS_GUIDE.md` para carpetas correctas
   - Compress antes de agregar
   - Actualizar rutas en HTML
   - Git add + commit + push

3. **Cambios de diseño:**
   - Editar CSS en `<style>` tag (líneas 11-821)
   - Test en mobile (375x812)
   - Commit + push

4. **Integrar nuevos pagos:**
   - Ver `MERCADO_PAGO_SETUP.md`
   - Actualizar .env.local (no commitar)
   - Cambiar payment link en función `handleMercadoPagoPay()`

5. **Monitorear conversiones:**
   - Vercel Analytics: https://vercel.com/re-infinito/ec1375-posturalia
   - Mercado Pago dashboard: Ver pagos completados

---

## 📝 NOTAS IMPORTANTES

- **NO commitar .env.local** - Solo crear localmente con credenciales reales
- **Mercado Pago link actualizado:** https://mpago.la/1QeeSHo (verificar periódicamente)
- **Countdown:** Actualmente fijo a 2026-07-21 23:59:59 (cambiar si es necesario)
- **Logo:** Espera que sea Logo Posturalia.jpeg en raíz del proyecto
- **Dominio:** Usar Vercel URL o configurar custom domain si se requiere

---

**Última actualización:** 21 de julio, 2026  
**Versión:** v2.0 (Rediseño Emocional)  
**Mantenedor:** Claude Code + Diego Garza
