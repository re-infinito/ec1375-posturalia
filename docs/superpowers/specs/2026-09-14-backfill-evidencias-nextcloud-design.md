# Backfill: evidencias del Google Form viejo → Nextcloud

**Fecha:** 14 de septiembre, 2026
**Estado:** Diseño aprobado, pendiente de plan de implementación

## Contexto

La integración con Nextcloud (`docs/superpowers/specs/2026-09-12-nextcloud-portafolio-storage-design.md`) reemplazó el Google Form de `evidencias.html` por subida directa hace 2 días. Los candidatos que llegaron a esa pantalla **antes** de ese cambio subieron sus archivos (capturas de Zoom, INE, CURP, foto de diploma, certificados) al Form viejo — esos archivos existen de verdad en Google Drive (la misma carpeta "Evidencia EC1375 (File responses)" que ya lee `_internal_no_publicar/01-scripts/assemble_expediente.py`), pero nunca llegaron a Nextcloud.

Este es el subsistema **B** de dos proyectos de backfill identificados (ver spec original de Nextcloud): el otro (**A**, regenerar vía navegador headless los PDFs de jsPDF que nunca se guardaron como archivo en ningún lado) se aborda por separado, después de este.

**Por qué B primero:** los archivos de B ya existen — es mover bytes de un lugar a otro. No necesita automatización de navegador ni mintear sesiones de candidatos reales, así que tiene mucha menos superficie de riesgo que A.

## Objetivo

Un script de una sola corrida que, para cada candidato que ya subió sus evidencias al Form viejo pero todavía no las tiene en Nextcloud, descargue esos 4 archivos de Drive y los suba a la carpeta correcta en Nextcloud, dejando además el registro de Supabase consistente (para que el gate de `entrega.html` deje de bloquearlos).

## Alcance

**Incluye:** capturas de Zoom, INE, CURP, foto de diploma — los 4 ítems que hoy bloquean el gate de `entrega.html` (`documentosFaseCompletos()` exige exactamente estas 4 claves en `evidencias_data.documentosNextcloud`).

**Fuera de alcance:**
- **Certificados/diplomas de formación** (el 5º ítem, opcional, del Form viejo) — no bloquea ningún gate, y ya existe un mecanismo más nuevo y directo (`certificados-previos`, bucket de Supabase Storage agregado el 8 de septiembre) para ese mismo propósito. No vale la pena migrar el respaldo viejo y opcional.
- **Subsistema A** (regenerar los PDFs de jsPDF que nunca se guardaron como archivo) — proyecto aparte, brainstorm/spec/plan propios después de que este quede resuelto.
- Migrar `assemble_expediente.py` para leer de Nextcloud en vez de Drive — sigue fuera de alcance (ya documentado como pendiente en `Claude.md`).

## Arquitectura

### Ubicación y stack

`_internal_no_publicar/01-scripts/backfill_evidencias_nextcloud.py` — mismo directorio y lenguaje que `assemble_expediente.py` (Python; ese directorio completo está gitignored porque maneja PII real, y ahí ya viven las credenciales OAuth de Google — `token.json` con scopes `drive.readonly` + `forms.responses.readonly` + `forms.body` — que este script reutiliza sin pedir nada nuevo).

**Reutiliza, no duplica:** las funciones de `assemble_expediente.py` que (a) leen las respuestas del Form "Evidencia EC1375" vía la Forms API y (b) hacen fuzzy-match de un nombre buscado contra el campo "Nombre completo" de cada respuesta. Son código ya probado (incluye la corrección de un bug real de normalización de acentos) — se importan directamente en vez de reescribirlas.

### Flujo, candidato por candidato

1. **Candidatos a revisar:** consulta a Supabase (con `SUPABASE_SERVICE_ROLE_KEY`, mismo patrón que los endpoints server-side del proyecto) sobre `candidatos_ec1375` JOIN `candidatos_fase_pagos`, trayendo `personalData.nombre`/`.curp` (de `autodiagnostico_data`) y el JSONB `evidencias_data` completo — **filtrado a candidatos con la fase `evaluacion` pagada/autorizada**. Quien no llegó a esa fase nunca pudo haber usado `evidencias.html` (ni el Form viejo ni el flujo nuevo), así que está genuinamente fuera del universo de este backfill — no aparece ni como "sin match", simplemente no se considera.
2. **Filtro de "ya migrado":** dentro de ese universo, si `evidencias_data.documentosNextcloud` ya tiene las 4 claves (`zoom`, `ine`, `curp`, `fotoDiploma`) con valor — se salta. Esto hace la corrida **idempotente**: correrlo dos veces no duplica trabajo ni sube nada dos veces.
3. **Emparejado:** de los que quedan (pagaron Evaluación, pero no tienen sus 4 documentos en Nextcloud — es decir, probablemente usaron el Form viejo), busca el nombre entre las respuestas del Form (fuzzy-match, mismo umbral que ya usa `assemble_expediente.py` para considerar un match "bueno"). Dos resultados posibles, y ambos se reportan explícitamente — nunca se omite uno en silencio:
   - **Match claro:** un solo candidato del Form supera el umbral de similitud → pasa a migración.
   - **Sin match claro** (nadie supera el umbral, o dos o más respuestas empatan) → nunca se adivina, va a la lista de "revisar a mano" del reporte.
4. **Descarga:** para el match encontrado, ubica las 4 preguntas de archivo (mismo mapeo título→slot de `assemble_expediente.py`, acotado a estos 4 slots) y descarga cada archivo de Drive a un directorio temporal local.
5. **Subida a Nextcloud:** cada archivo se sube vía WebDAV directo — **no** a través de `api/subir-portafolio.js` (ese endpoint exige un `access_token` real de sesión del candidato, que aquí no existe ni hace falta: el script actúa como el operador de confianza, con las credenciales de servicio de Nextcloud + el Service Token de Cloudflare Access, exactamente igual a como se verificó manualmente que funciona en la sección "Nextcloud" de `Claude.md`). Mismo naming que usa el flujo normal: `Portafolios/{Nombre}_{CURP}/03-Evaluacion/`, con las capturas de Zoom prefijadas por timestamp para evitar colisiones (igual que `handleFileUpload()` en `evidencias.html`).
6. **Actualiza Supabase:** al terminar de subir los 4 archivos de un candidato, hace `update` de `evidencias_data.documentosNextcloud` en `candidatos_ec1375` con las rutas nuevas (mismo shape que ya escribe el flujo normal: `zoom` como array de rutas, `ine`/`curp`/`fotoDiploma` como string). **Este paso es obligatorio, no opcional** — sin él, el candidato seguiría bloqueado en `entrega.html` aunque sus archivos ya estén en Nextcloud, porque el gate lee exactamente este campo.

### Modo dry-run (default) vs. corrida real

- **`python3 backfill_evidencias_nextcloud.py`** (sin flags) → **dry-run**. No descarga nada de Drive, no sube nada a Nextcloud, no escribe en Supabase. Solo recorre los pasos 1-3 (consulta candidatos, filtra ya-migrados, hace el emparejado) y genera un reporte legible: para cada candidato pendiente, su nombre en Supabase, el nombre que encontró en el Form, el puntaje de similitud, y si el match fue claro o quedó para revisión manual.
- **`python3 backfill_evidencias_nextcloud.py --ejecutar`** → corrida real. Solo se usa después de que Diego revise el reporte del dry-run y confirme que los emparejamientos se ven bien.

### Manejo de errores

Un candidato que falla en cualquier paso (Drive no responde, Nextcloud rechaza la subida, la actualización a Supabase falla) **no detiene el script** — se registra en el reporte final como "falló" junto con el motivo, y se continúa con el resto. Al final se imprime un resumen: cuántos se migraron, cuántos fallaron, cuántos quedaron para revisión manual.

## Testing

1. Antes del dry-run real: probar la función de matching (importada de `assemble_expediente.py`) contra 2-3 nombres conocidos — por ejemplo el candidato de prueba de Diego (`_internal_no_publicar/05-pruebas-diego/`) — para confirmar que encuentra el match esperado.
2. Correr en modo dry-run contra los datos reales de producción (es inherentemente seguro, no escribe nada) y revisar el reporte con Diego antes de continuar.
3. Corrida real. Después, verificar a mano 1-2 candidatos migrados: que los 4 archivos aparezcan en la carpeta correcta de Nextcloud, y que `entrega.html` (o `evidencias.html`) ya no los marque como pendientes.
4. Volver a correr el script en modo dry-run una vez más — debe reportar cero candidatos pendientes para los que ya se migraron (confirma la idempotencia).
