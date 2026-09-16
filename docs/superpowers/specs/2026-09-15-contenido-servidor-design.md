# Contenido al servidor + PWA + Realtime — design spec (proyecto 4)

**Fecha:** 15 de septiembre, 2026
**Estado:** Implementado en código; publicación pendiente de Diego (SQL + `publicar_contenido.py`)

## Decisiones tomadas con Diego

| Decisión | Elección |
|---|---|
| Dónde vive el contenido servido | Supabase (tabla `contenido_ec1375` + bucket privado `contenido-imagenes`, RLS por fase pagada / admin / bypass). Cero funciones nuevas de Vercel. |
| Copia maestra | El script también sube el paquete completo al Nextcloud (`Contenido/<versión>/`). El NAS no sirve contenido a candidatos: solo es alcanzable servidor a servidor y serlo obligaría a una función proxy (límite de 12) y a depender del NAS para estudiar. |
| `ruta-alineacion.html` | Protegida: exige sesión con Alineación pagada (admins y bypass exentos). En la sesión en vivo la proyecta el instructor con su cuenta admin. |
| PWA offline | Solo la app (páginas, JS, CSS, logo, iconos). El contenido nunca se cachea. |
| Alcance | Todo: Ruta de estudio (datos, media, 121 diapositivas, 19 imágenes), Ruta de Alineación (57, 2), 39 reactivos del examen, guion maestro, 142 reactivos del autodiagnóstico. |

## Arquitectura

- **`contenido.js`** (módulo compartido, tras `auth.js`): `Contenido.cargar(clave, {fallback})`, `Contenido.imagenes(rutas)` (URLs firmadas 1 h), `reemplazarImagenes`, `rutasEnHtml`, `errorHtml(err)` con 5 estados: sin sesión, sin acceso (fase no pagada), sin conexión, no publicado, desconocido. Caché en memoria por carga de página.
- **Bloques y fase requerida:** `ruta-estudio:data|media|slides` (registro), `ruta-alineacion:data|slides` (alineacion), `examen:reactivos` (evaluacion), `guion:secciones` (evaluacion), `autodiagnostico:reactivos` (registro). Diapositivas como `{html, slides}` con `{{img:<fase>/<archivo>}}` en lugar de data URIs; imágenes en el bucket bajo `<fase>/…` (la política de storage usa el primer segmento).
- **Páginas:** la envoltura de `ruta-estudio` (nuestra, no el motor) carga datos+media+diapositivas+imágenes y luego inyecta el motor; en `ruta-alineacion` la IIFE del motor pasa a `window.__arrancarAlineacion` y el bloque final carga y arranca; examen/guion cargan antes de `render()`; autodiagnóstico carga perezosamente en los pasos e1–e4/firma/resultado. Mientras el HTML conserve el bloque inline (antes de `shell`), se usa como respaldo (transición sin corte).
- **`publicar_contenido.py`** (`_internal_no_publicar/01-scripts/`): `extraer` (parsea las páginas → paquete local con `paquete.json`, versión = fecha + sha), `publicar` (upsert a la tabla vía REST con service role, imágenes al bucket, copia al Nextcloud), `shell` (deja las páginas sin contenido, idempotente; transforma la IIFE de `ruta-alineacion`), `todo`. Verificado: 8 bloques, 21 imágenes (3.9 MB); cascarones 5.4 MB → 281 KB (`ruta-estudio`), 704 KB → 82 KB (`ruta-alineacion`).
- **PWA:** `manifest.json`, `sw.js` (HTML red-primero con respaldo; estáticos caché-primero; nunca Supabase/`/api/`/CDN; página offline mínima), iconos `icons/` generados del logo, registro y botón "Instalar aplicación" desde `crm-shell.js` (`beforeinstallprompt`).
- **Realtime:** `admin-crm.html` se suscribe a `candidatos_fase_pagos`, `inscripciones_alineacion`, `utilidades_pagos` (toast + recarga con debounce). Las tablas se agregan a la publicación `supabase_realtime` en el SQL.

## Pasos de publicación (Diego)

1. Correr `_internal_no_publicar/02-sql/2026-09-15-contenido-ec1375.sql` (tabla, función `puede_leer_contenido`, política, bucket, política de storage, publicación realtime).
2. `vercel env pull _internal_no_publicar/01-scripts/.env` (o copiar las variables a mano) — nunca comitear.
3. `cd _internal_no_publicar/01-scripts && python3 publicar_contenido.py extraer && python3 publicar_contenido.py publicar`.
4. Probar en producción con un candidato real o la cuenta bypass (las páginas ya cargan de Supabase aunque el HTML aún traiga el inline).
5. `python3 publicar_contenido.py shell` → commit → push. A partir de ahí el contenido no viaja en el HTML.

## Fuera de alcance / siguientes

Biblioteca como presentación maestra independiente del motor (pregunta abierta de Diego, ver Claude.md backlog); wizards con avance/autosave visible y barra inferior móvil (prioridad 2 de la crítica de diseño).
