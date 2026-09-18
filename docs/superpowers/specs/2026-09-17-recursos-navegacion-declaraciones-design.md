# Recursos, navegación entre secciones y declaraciones del candidato — diseño

**Fecha:** 17 sep 2026 · **Aprobado por:** Diego (en conversación)
**Fuera de este diseño (en pausa):** circuito del Centro Evaluador (etapas, Cédula, portafolio desde el panel).

## Objetivo

Cuatro mejoras que suben el valor percibido y protegen al Centro Evaluador:

- **A.** Regresar a secciones ya llenadas para corregir o agregar información.
- **B.** Tutoriales mudos de cómo usar la plataforma, paso a paso.
- **C.** Toolkit profesional descargable (formatos para el consultorio del candidato).
- **D.** Declaraciones que el candidato acepta explícitamente: requisitos, material, sin reembolsos y autenticidad de evidencias.

Orden de implementación: **A → D → C → B** (B es lo más largo por las grabaciones; D es corto y tiene valor legal inmediato).

---

## A. Regresar a secciones ya llenadas

Mismo patrón que ya está en producción en `documentos-sesion.html` (commit `a3216b7`).

### Autodiagnóstico (`autodiagnostico.html`)
- Secciones navegables: Datos personales (`personal`), Acuerdo de Confidencialidad (`nda`), Elemento 1–4 (`e1`…`e4`), Firma (`firma`), Resultado (`resultado`). `intro` y `auth` no se listan.
- **Selector "Ir a otra sección"** arriba de cada sección (donde hoy está la barra de navegación del wizard).
- **Tarjeta "Regresar a una sección"** en la pantalla de Resultado, con las 8 secciones como botones.
- **Límite:** solo hasta la primera sección incompleta (`isStepValid`); las posteriores salen deshabilitadas. Validar los Elementos exige los reactivos cargados: usar `cargarReactivos()` antes de calcular el límite (mismo bug que resolvió `e4898e1`).
- Al corregir, la resubida por versión (`documentos-nas.js`) resube los 4 PDF de Registro.
- **Limitación aceptada:** si cambia respuestas después de dar su visto bueno de Reforzamiento, `ruta_estudio_data` no se recalcula (el estado solo se siembra si no existe).

### Plan de Evaluación, Encuesta y Evidencias
- Son una sola pantalla con estado "generado" en memoria. En su pantalla de resultado se agrega **"✏️ Editar mis respuestas"**: `generated = false; render()` — vuelve al formulario con todo lo llenado.
- La resubida por versión ya cubre Plan y Encuesta; Evidencias sube archivos al elegirlos.

### Pruebas
- Navegador (copia local con sesión simulada, como en `a3216b7`): salto desde Resultado y desde el selector, límite con una sección incompleta, "Editar" en las 3 páginas, 375 px sin desborde.

---

## D. Declaraciones del candidato

Textos modelo redactados por nosotros; **conviene que los valide el evaluador o un abogado** antes de darlos por definitivos. Cada aceptación se guarda con fecha y versión del texto, así queda como evidencia.

### Plan de Evaluación — antes de "Generar mi Plan"
Tres casillas obligatorias, debajo de "Acepto el Plan de Evaluación descrito arriba":
1. **Requisitos:** "Confirmo que cumplo con todos los requisitos del Estándar de Competencia EC1375 y del proceso de evaluación, y que la información y documentos que proporciono son verídicos."
2. **Material:** "Confirmo que dispongo del material, equipo y espacio descritos en «Requerimientos para la Evaluación» para realizar mi evaluación práctica."
3. **Sin reembolsos:** "Entiendo que, una vez realizado cualquier pago o anticipo, no aplican reembolsos, salvo que la causa sea responsabilidad del Centro Evaluador."

- Datos: `planData.declaraciones = { version: '2026-09-17', requisitos: <ISO>, material: <ISO>, sinReembolsos: <ISO> }` (fecha al marcar; se borra al desmarcar).
- `getValidationStatus().completo` exige las tres.
- **No se agregan al PDF del Plan** (formato validado contra el expediente de Humberto). Se excluyen de la huella de `huellaDocsAlineacion()` para no resubir el Plan por marcarlas.
- Candidatos que ya generaron su Plan: al abrir la página ven las casillas sin marcar; el Plan ya subido no cambia, pero "Generar" pide marcarlas.

### Evidencias — antes de "Confirmar Entrega"
Casilla obligatoria **"Declaración de autenticidad"**:
> "Declaro bajo protesta de decir verdad que las evidencias que entrego —video, capturas, documentos e identificaciones— son auténticas, corresponden a una atención real realizada por mí y no fueron alteradas. Cualquier falsificación o alteración es mi exclusiva responsabilidad, y libero al Centro Evaluador y a Paideia Tech de toda responsabilidad derivada de ella."

- Datos: `planData.declaracionAutenticidad = { version, fecha }`; `updateGenerateButton()` la exige.
- Va en el comprobante interno de Evidencias (`generatePDF()`), que ya dice que no forma parte del portafolio oficial.

### Sin reembolsos en los puntos de pago
Ya existe el aviso de texto en los 5 puntos (landing, confirmación de pago, Alineación, Evaluación en Documentos de Sesión, Entrega). No se cambia: la aceptación explícita queda en el Plan de Evaluación, antes del pago de Evaluación (40 %).

### Visibilidad para el equipo
En el detalle de `admin-candidatos.html`, bloque **"Declaraciones aceptadas"** con fecha de cada una o "Pendiente". `admin_lista_candidatos()` ya regresa `plan_evaluacion_data` y `evidencias_data` (sin firmas), no requiere SQL.

### Pruebas
- Solo navegador: la validación vive dentro de cada página (patrón actual del proyecto), sin helper compartido que probar en Node.
- Navegador: botón deshabilitado hasta marcar todo, fechas guardadas, desmarcar borra la fecha, comprobante de Evidencias con la declaración, detalle en admin.

---

## C. Toolkit profesional descargable

### Contenido
| Formato | PDF personalizado | Word editable |
|---|---|---|
| Aviso de Privacidad | ✅ | ✅ |
| Consentimiento Informado | ✅ | ✅ |
| Plan de Sesión | ✅ | ✅ |
| Plan de Seguimiento | ✅ | ✅ |
| Hoja terapéutica | "Próximamente" (se trabaja en otra sesión) | — |

- **Personalización:** nombre, domicilio y contacto del candidato como responsable / prestador (de su Autodiagnóstico; el Aviso usa los mismos datos editables de Documentos de Sesión si ya los ajustó), y espacios en blanco para cada paciente.
- **Sin logos de RED CONOCER ni ICE México:** son del expediente oficial; en formatos de su consultorio podrían leerse como aval institucional. Pie discreto: "Formato elaborado conforme al Estándar de Competencia EC1375".
- **Fuente única de textos:** nuevo módulo `formatos-consultorio.js` con `avisoPrivacidadBloques()` (se mueve desde `documentos-sesion.html`, que pasa a cargarlo) y la estructura de cada formato. Los generadores PDF (jsPDF) y Word leen la misma estructura.
- **Word:** `.docx` real con la librería `docx` desde CDN, cargada solo al descargar. Confirmar al implementar que existe un build UMD en cdnjs o jsdelivr; si no, se documenta la alternativa antes de construir.

### Acceso
- Se desbloquea **al completar Evidencias** (paso 9 hecho según `FlowStatus.getSteps()`), su última acción. Supuesto de "al terminar su proceso"; se ajusta fácil cuando exista el circuito del Centro Evaluador.
- Antes: el toolkit se ve bloqueado con "Se desbloquea al terminar tu proceso" (incentivo). Admins y cuenta demo: desbloqueado.

### Pruebas
- Node: `formatos-consultorio.js` (bloques del aviso con y sin datos, estructura de cada formato).
- Navegador: descarga de los 8 archivos, apertura de los PDF (render a PNG) y de los .docx (extraer texto), bloqueo antes de Evidencias.

---

## B. Tutoriales de la plataforma (animaciones mudas)

### Lista (en el orden del flujo)
1. Iniciar sesión (contraseña en blanco: no se teclean contraseñas) · 2. Tu panel · 3. Autodiagnóstico · 4. Reforzamiento · 5. Alineación (reservar sesión y ruta) · 6. Biblioteca · 7. Plan de Evaluación · 8. Documentos de Sesión · 9. Práctica · 10. Examen de Conocimientos · 11. Encuesta · 12. Evidencias · 13. Entrega y pagos.

### Grabación
- Con el código real del sitio y la candidata demo (datos ficticios), sin tocar el Chrome de Diego.
- Sin audio: cada acción lleva un **letrero en pantalla** inyectado durante la grabación ("Paso 2: escribe tu correo…").
- Formato: **MP4** (H.264, sin audio, 30–90 s), ligero; carpeta `tutoriales/` servida por el sitio.
- **Riesgo técnico:** grabar video depende de la herramienta de navegador disponible (Playwright o capturas encadenadas con ffmpeg). Primero una **prueba con un solo tutorial**; si no sale con calidad aceptable, se decide con Diego antes de grabar los 13.

### Dónde se ven
- **Página nueva `recursos.html`** ("Recursos" en el menú del candidato): sección "Tutoriales de la plataforma" (tarjetas con video, en orden) + sección "Tu toolkit profesional" (C). Mientras un tutorial no exista: "Próximamente".
- **Botón "▶ Ver cómo se hace"** en cada paso, que abre su tutorial en un modal sin salir:
  - Páginas con shell: lo pone `crm-shell.js` en el encabezado según `data-crm-page` (sin tocar cada página).
  - `estudio.html` (rail): su propio botón junto a "Ayuda", según el modo.
- **Fuente única:** lista `TUTORIALES` (id, título, paso, archivo, descripción) en `crm-shell.js`, que ya concentra la navegación; `recursos.html` y `estudio.html` la leen de ahí.
- **Service worker:** excluir `/tutoriales/` (los videos piden rangos y `cache.put` falla con respuestas 206).

### Pruebas
- Node: helpers puros de `TUTORIALES` (tutorial por página, orden).
- Navegador: página Recursos, botón en 3 pasos distintos, modal y reproducción, "Próximamente", 375 px sin desborde.

---

## Riesgos y hallazgos relacionados

- **Límite de 4.5 MB por petición en Vercel** (documentado): `api/subir-portafolio.js` acepta hasta 15 MB, pero Vercel rechaza antes cualquier cuerpo mayor a 4.5 MB. En base64, un archivo de más de ~3.3 MB (p. ej. una foto de celular en Evidencias) falla con 413. No es parte de este diseño; se registra como pendiente y afecta también al futuro portafolio.
- Textos legales (D) y aviso de privacidad (C) son modelos: validar con el evaluador.
