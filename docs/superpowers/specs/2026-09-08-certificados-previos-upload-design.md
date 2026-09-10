# Certificados de formación previa — captura obligatoria en el Autodiagnóstico

**Fecha:** 8 de septiembre, 2026
**Estado:** Aprobado, pendiente de implementación

## Objetivo

Hoy, `evidencias.html` (último paso del funnel post-pago) tiene una pregunta opcional en su Google Form embebido: "Certificados/diplomas de formación previa". El candidato solo llega a esa pregunta al final de todo el proceso, y es opcional, así que en la práctica casi nadie la llena.

Este cambio mueve la captura de certificados previos al paso **"personal"** de `autodiagnostico.html` — el mismo paso donde ya se capturan Nombre/CURP/domicilio/etc. — y la vuelve una captura real con archivo (no solo texto), condicionalmente obligatoria.

## Alcance

Solo `autodiagnostico.html` (paso "personal"), `auth.js` (helper de subida), un script SQL nuevo para políticas de Storage, y 3 archivos que leen el dato derivado (`documentos-sesion.html`, `evidencias.html`, `plan-evaluacion.html`) — cambio de una línea en cada uno.

**Fuera de alcance** (documentado, no se toca en esta iteración):
- `assemble_expediente.py` no se actualiza para leer del bucket nuevo — sigue usando el Google Form/Drive como única fuente de evidencias para el expediente final.
- No se construye ningún panel de administración para ver/descargar los archivos subidos — quedan accesibles desde el dashboard de Supabase (Storage) directamente.
- No hay migración de datos de candidatos que ya estén a medias en el wizard con la selección vieja de especialidades (`selectedCertificaciones`/`otraCertificacionText`). Volumen bajo, sesión de una sola sentada — no se justifica el esfuerzo.
- Migración a Cloudflare Storage (mencionada como plan futuro por el usuario, pendiente de que Humberto integre esa pieza) — sin cambios de código relacionados ahora. Cuando esté lista esa integración será un cambio aparte.
- El ítem "Certificados / diplomas de formación" ya existente en el checklist de `evidencias.html` se queda igual, sin cambios — decisión explícita del usuario de mantenerlo como respaldo opcional.

## Qué se elimina

En `autodiagnostico.html`, todo el subsistema del acordeón de especialidades:
- Constante `CERTIFICACIONES_EC1375`
- Estado: `selectedCertificaciones`, `otraCertificacionText`, `openCertCategories`
- Funciones: `renderCertAccordion`, `onCertDetailsToggle`, `toggleCertificacion`, `updateOtraCertificacion`, `renderCertChips`
- CSS: `.cert-accordion`, `.cert-category`, `.cert-items`, `.cert-item-row`, `.cert-count` (se puede dejar `.cert-chip`/`.cert-chips` si se reutiliza visualmente, ver sección UI)

`syncEscolaridad()` se mantiene como concepto (sigue existiendo una función que recalcula `personalData.escolaridad`), pero su fuente de datos cambia (ver siguiente sección).

## Qué se agrega — estado y datos

Nuevo estado en `autodiagnostico.html`:

```js
let certificados = []; // [{ nombre: string, path: string|null, fileName: string|null, size: number|null, uploadedAt: string|null, uploading: boolean }]
let sinCertificadosPrevios = false;
```

`loadProgress()` / `saveProgress()`: reemplazar `selectedCertificaciones`/`otraCertificacionText` por `certificados`/`sinCertificadosPrevios` en el objeto que se guarda a `localStorage.autodiagnosticoData` y se sincroniza a Supabase vía `Auth.syncToSupabase('autodiagnostico_data', data, ...)`. Solo se guardan metadatos (nombre, `path`, `fileName`, `size`, `uploadedAt`) — nunca el contenido del archivo ni un data URL.

`syncEscolaridad()` nuevo comportamiento:
```js
function syncEscolaridad() {
    personalData.escolaridad = sinCertificadosPrevios
        ? 'Sin certificaciones previas'
        : certificados.filter(c => c.nombre && c.nombre.trim()).map(c => c.nombre.trim()).join(', ');
    saveProgress();
}
```

## UI — paso "personal"

Reemplaza el bloque actual de "Grado de estudio o Certificaciones (EC1375)":

```
Label: "Certificados de formación previa *"
Hint: "Sube el certificado o diploma de cada especialidad en la que ya te has formado. Escribe el nombre tal cual aparece en el documento."

☐ No tengo ningún certificado o diploma de formación previa

[si no está marcado, se muestra:]

┌─ Certificado 1 ──────────────────────────────┐
│ [Nombre de la certificación tal cual aparece  │
│  en tu certificado________________________]   │
│ [Elegir archivo] (PDF o imagen, máx. 10MB)     │
│ Estado: Subiendo... / ✓ Subido / ⚠ Error       │
│ [Quitar]                                       │
└────────────────────────────────────────────────┘
┌─ Certificado 2 ── (si existe) ────────────────┐
...
└────────────────────────────────────────────────┘

[+ Agregar otro certificado]
```

Estilo: reutilizar `.field-group`, `.card`, y variantes de `.cert-*` ya existentes donde aplique (p.ej. una caja con borde similar a `.cert-accordion` para cada fila de certificado); agregar solo el CSS incremental necesario (fila de certificado, estados de subida en color `var(--success)`/`var(--danger)`, botón "Quitar" pequeño).

Comportamiento:
- Marcar el checkbox "No tengo ninguno" oculta la lista de certificados (no borra las filas ya agregadas del estado — si lo desmarcan, reaparecen tal cual estaban).
- Al elegir un archivo en una fila: validar client-side tipo (`application/pdf`, `image/jpeg`, `image/png`, `image/webp`) y tamaño (≤10MB) antes de subir. Si falla la validación, mostrar el error en esa fila y no subir nada.
- Si pasa la validación: marcar la fila como `uploading: true`, llamar a `Auth.uploadCertificado(file, path)`, y al resolver guardar `path`/`fileName`/`size`/`uploadedAt` (éxito) o mostrar estado de error con opción de reintentar (falla).
- "Quitar" una fila: solo elimina la entrada del estado local (no borra el archivo ya subido al bucket — archivo huérfano aceptado como trade-off, sin lógica de limpieza).
- El botón "Siguiente" del wizard permanece deshabilitado (patrón ya existente de `updateNavButtons()`/`isStepValid()`, sin texto de ayuda adicional en este paso, igual que hoy) hasta que: `sinCertificadosPrevios === true`, o `certificados.length > 0 && certificados.every(c => c.nombre?.trim() && c.path && !c.uploading)`.

## Validación — `isStepValid('personal')`

```js
if (step === 'personal') {
    const certificadosOk = sinCertificadosPrevios ||
        (certificados.length > 0 && certificados.every(c => c.nombre && c.nombre.trim() && c.path));
    return personalData.nombre && personalData.curp && personalData.domicilio &&
           personalData.escolaridad && personalData.telefonoCelular && personalData.email &&
           personalData.fecha && certificadosOk;
}
```

## Backend — Supabase Storage

1. **Bucket nuevo, privado:** `certificados-previos`. Se crea manualmente en el dashboard de Supabase (Storage → New bucket → Private) — paso manual del usuario, igual que otras configuraciones del proyecto documentadas en Claude.md.
2. **Convención de ruta:** `{user_id}/{timestamp}-{nombre-archivo-sanitizado}` — cada candidato solo puede leer/escribir dentro de su propia carpeta (prefijo = su `auth.uid()`).
3. **Script SQL nuevo** (`_internal_no_publicar/02-sql/supabase_setup_v6_certificados_storage.sql`, gitignored igual que los demás scripts SQL del proyecto): políticas RLS sobre `storage.objects` para el bucket `certificados-previos`:
   - INSERT permitido solo si `auth.uid()::text = (storage.foldername(name))[1]`
   - SELECT permitido solo bajo la misma condición (para que el propio candidato pueda ver su archivo ya subido si vuelve a cargar el paso)
   - Sin política de UPDATE/DELETE por ahora (no se necesita — "Quitar" en la UI no borra del bucket, ver arriba)
4. **`auth.js`** — nueva función:
   ```js
   async uploadCertificado(file, path) {
       try {
           const { error } = await supabaseClient.storage.from('certificados-previos').upload(path, file);
           if (error) return { path: null, error };
           return { path, error: null };
       } catch (e) {
           return { path: null, error: e };
       }
   }
   ```
   Requiere sesión activa (ya garantizado — el paso "personal" viene después del paso "auth" en `STEPS`).

## Cambios en los 3 archivos consumidores

En `documentos-sesion.html` (~línea 335-336), `evidencias.html` (~línea 186-187) y `plan-evaluacion.html` (~línea 605-606), reemplazar:
```js
const especialidades = Array.isArray(saved.selectedCertificaciones) ? [...saved.selectedCertificaciones] : [];
if (saved.otraCertificacionText && saved.otraCertificacionText.trim()) especialidades.push(saved.otraCertificacionText.trim());
```
por:
```js
const especialidades = Array.isArray(saved.certificados)
    ? saved.certificados.map(c => c.nombre).filter(n => n && n.trim())
    : [];
```
Sin ningún otro cambio en esos 3 archivos — el resto del código que consume `especialidades` (chips, dropdowns, tablas de PDF) sigue igual porque la forma del array (`string[]`) no cambia.

## Testing / verificación manual

- Flujo feliz: marcar "no tengo ninguno" → avanza. Desmarcar, agregar 1-2 certificados con archivo real (PDF e imagen) → avanza solo cuando ambos tienen nombre y archivo subido.
- Archivo inválido (tipo no permitido, >10MB) → error inline, no bloquea otras filas.
- Refrescar la página a medio llenar (con sesión activa) → los certificados ya subidos se restauran desde `localStorage`/Supabase con su `path` (no se vuelve a pedir el archivo).
- Verificar en el dashboard de Supabase Storage que el archivo aparece bajo `{user_id}/...` y que otro usuario (sesión distinta) no puede leerlo vía la API (RLS).
- Verificar que `documentos-sesion.html`, `evidencias.html` y `plan-evaluacion.html` siguen mostrando la especialidad/nombre del certificado correctamente después del cambio.
