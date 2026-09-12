# Almacenamiento automático en Nextcloud (Portafolios EC1375)

**Fecha:** 12 de septiembre, 2026
**Estado:** Diseño aprobado, pendiente de plan de implementación

## Contexto

Hoy, cada documento del proceso de certificación (PDFs generados por el sitio con jsPDF, y evidencias como INE/CURP/capturas de Zoom) sigue el mismo patrón manual y frágil: el candidato **descarga** el PDF a su equipo y luego lo **vuelve a subir** a mano a un Google Form (`evidencias.html`), o Diego/Humberto lo reciben y lo guardan localmente. `documentos-sesion.html` lo dice explícitamente en su UI: *"Descarga cada uno y súbelo a la pregunta correspondiente en el formulario de Evidencias."*

Humberto (evaluador/operador con su propio servidor) instaló Nextcloud en un TrueNAS SCALE, expuesto vía Cloudflare Tunnel (sin puertos abiertos) en un subdominio propio, con una cuenta de servicio de solo-WebDAV (no su usuario personal, no acceso SSH/servidor). Las 3 credenciales (URL, usuario, contraseña de aplicación) ya están guardadas como variables de entorno en Vercel (`NEXTCLOUD_URL`, `NEXTCLOUD_USERNAME`, `NEXTCLOUD_APP_PASSWORD`), en Production y Preview.

**Objetivo de este proyecto:** que todos los documentos del proceso — tanto los que el sitio genera (jsPDF) como las evidencias que hoy van al Google Form — se suban automáticamente a este Nextcloud, sin descarga/re-subida manual, y que la subida exitosa sea una condición (además del pago) para avanzar a la siguiente fase.

## Alcance

**Incluye:**
- Endpoint serverless `api/subir-portafolio.js` que sube archivos a Nextcloud vía WebDAV.
- Reemplazo de `doc.save()`/descarga manual por subida automática en los ~9 PDFs generados por el sitio (Autodiagnóstico, Acuse NDA, Acuse Tríptico, Plan de Evaluación, su Acuse, 4 PDFs de Documentos de Sesión, Encuesta).
- Reemplazo del Google Form embebido en `evidencias.html` por `<input type="file">` nativos para lo que el sitio NO genera: capturas de sesión Zoom, Identificación oficial (INE), Comprobante CURP, Foto para diploma, y opcionalmente Certificados/diplomas de formación.
- Un "filtro" (bloqueo duro) entre fases: no se puede avanzar a la siguiente fase hasta que los documentos de la fase actual estén confirmados en Nextcloud.
- Manejo de fallas de subida con reintento manual + descarga de respaldo, para que el candidato nunca se quede sin su archivo.

**Fuera de alcance (explícitamente pospuesto):**
1. Migrar `assemble_expediente.py` (script Python, hoy lee de Google Forms/Drive) para que lea de Nextcloud en vez de Google Drive. Se hace después, una vez esta tubería esté probada en producción con candidatos reales.
2. El bucket de Supabase Storage `certificados-previos` (certificados de formación previa, agregado el 8 de septiembre de 2026) se queda exactamente como está — ya es automático y nunca pasó por el problema de "se guarda en el equipo de alguien", así que no es parte del dolor que resuelve este proyecto.
3. Un panel de administración con override manual para el caso "Nextcloud caído por horas". Si hace falta, Diego edita el JSONB directo desde el Table Editor de Supabase — mismo mecanismo de emergencia que ya usa para autorizar pagos manuales. No se construye UI nueva para esto ahora.
4. La liga al video de la sesión (`planData.videoLink` en `evidencias.html`) no cambia — ya es un campo de texto nativo, nunca pasó por el Google Form.

## Arquitectura

### `api/subir-portafolio.js` (nuevo endpoint serverless)

**Request:** `POST` con body `{ email, fase, nombre, curp, filename, fileBase64 }` y header `Authorization: Bearer <access_token>` (el `access_token` de la sesión activa de Supabase del candidato, obtenido vía `Auth.getSession()`). `nombre`/`curp` vienen de `personalData` (ya está en el estado local de cada página desde el paso `personal` del Autodiagnóstico) y se usan solo para resolver el nombre de carpeta — no se validan contra ninguna tabla en este endpoint.

**Qué hace, en orden:**
1. Verifica el `access_token` contra Supabase (`supabase.auth.getUser(token)`). Si no es válido, o el email del token no coincide con el `email` del payload, responde 401/403. Esto evita que un candidato autenticado suba o sobreescriba documentos en la carpeta de otro.
2. Valida `fase` contra las 4 fases conocidas (`registro|alineacion|evaluacion|entrega`) y que `fileBase64` decodificado no exceda **15MB**.
3. Normaliza `NEXTCLOUD_URL`: quita sufijos conocidos como `/login` o `/index.php/login` y una barra final, antes de construir la ruta WebDAV. (Ver nota de riesgo abajo — hay que confirmar con Diego cuál es el endpoint base real antes de probar en producción.)
4. Resuelve el nombre de carpeta del candidato a partir de sus datos personales (recibidos en el payload junto con `email`/`fase`): `{Nombre}_{Apellidos}_{CURP}`, slugificado (sin acentos, espacios → `_`).
5. Construye la ruta completa: `{NEXTCLOUD_URL}/remote.php/dav/files/{NEXTCLOUD_USERNAME}/Portafolios/{carpeta-candidato}/{NN-Fase}/{filename}`, donde `NN-Fase` es `01-Registro`, `02-Alineacion`, `03-Evaluacion` o `04-Entrega`.
6. Crea las carpetas que falten con `MKCOL`, una por una desde la raíz (`Portafolios`, luego `Portafolios/{candidato}`, luego `.../{fase}`) — trata una respuesta 405 ("ya existe") como éxito, no como error.
7. Sube el archivo con `PUT` + Basic Auth (`NEXTCLOUD_USERNAME` / `NEXTCLOUD_APP_PASSWORD`).
8. Responde `{ success: true, path }` o `{ success: false, error }`.

Nunca expone las credenciales de Nextcloud al navegador — viven solo en las variables de entorno del servidor, igual que `MERCADOPAGO_ACCESS_TOKEN`/`SUPABASE_SERVICE_ROLE_KEY` en los endpoints existentes.

### Cliente: helper `subirDocumento()` (duplicado por página)

Siguiendo la convención ya establecida del proyecto ("páginas estáticas sin módulos compartidos", salvo `auth.js`), cada HTML que genera o recibe documentos implementa su propia copia de un helper pequeño:

```
async function subirDocumento(fase, filename, blob) {
  // 1. Convierte blob → base64 (FileReader)
  // 2. POST a /api/subir-portafolio con Authorization: Bearer <access_token de Auth.getSession()>
  // 3. Devuelve { success, path } o { success:false, error }
}
```

El resultado (ruta si tuvo éxito, o ausente/`null` si falló) se guarda en el mismo campo JSONB que la página ya sincroniza a Supabase, bajo una nueva clave `documentosNextcloud`, p. ej.:

```json
"documentosNextcloud": {
  "autodiagnostico": "Portafolios/.../01-Registro/Autodiagnostico_EC1375_....pdf",
  "acuseNda": "Portafolios/.../01-Registro/Acuerdo_Confidencialidad_....pdf",
  "acuseTriptico": null
}
```

Una clave con ruta (string) = subido con éxito. `null`/ausente = pendiente o falló.

### Mapeo documento → fase → carpeta

| Fase (carpeta) | Página que genera | Documentos |
|---|---|---|
| `01-Registro` | `autodiagnostico.html` (pantalla `resultado`) | Autodiagnóstico, Acuse NDA, Acuse Tríptico |
| `02-Alineacion` | `plan-evaluacion.html` (pantalla final) | Plan de Evaluación, su Acuse |
| `03-Evaluacion` | `documentos-sesion.html` (pantalla `resultado`) | Ficha de Registro, Consentimiento, Plan de Sesión, Plan de Seguimiento |
| `03-Evaluacion` | `encuesta-satisfaccion.html` | Encuesta de Satisfacción |
| `03-Evaluacion` | `evidencias.html` | Capturas de Zoom, INE, CURP, Foto de diploma, Certificados (opcional) |
| `04-Entrega` | — | Nada por ahora (`entrega.html` es solo confirmación) |

### `evidencias.html` — retiro del Google Form

De las 13 líneas actuales del checklist (`EVIDENCIAS_REQUERIDAS`), 7 piden re-subir PDFs que el sitio ya generó en pasos anteriores (Ficha, Consentimiento, Plan de Sesión, Plan de Seguimiento, Autodiagnóstico, Plan de Evaluación, Encuesta, Acuse Tríptico, Acuse Plan de Evaluación) — con la subida automática, esas líneas se **eliminan** del checklist porque ya están garantizadas por el filtro de la fase anterior.

El `<iframe>` del Google Form se reemplaza por `<input type="file">` nativos, uno por cada ítem que el sitio de verdad no genera:
- Capturas de sesión Zoom (puede ser más de un archivo)
- Identificación oficial (INE) — frente y reverso
- Comprobante CURP
- Foto para diploma
- Certificados/diplomas de formación (opcional, sigue siendo respaldo — no reemplaza al bucket `certificados-previos`)

La liga al video (`planData.videoLink`) no cambia, ya es un campo de texto nativo fuera del Form.

## El "filtro" entre fases (bloqueo duro)

Cada página gateada agrega **un eslabón más** a la cadena de verificaciones que ya existe (sesión activa → Autodiagnóstico completo → NDA aceptado → pago de la fase, según la página) — el mismo patrón usado para agregar el gate de NDA. Como RLS ya permite a cada candidato leer su propia fila, la verificación es una simple lectura del JSONB de la fase anterior (vía el mismo mecanismo que ya usa `Auth.pullMyRow()`), sin necesidad de una función RPC nueva:

- `alineacion.html` → + verifica que Registro (`documentosNextcloud` de `autodiagnostico_data`) esté completo
- `documentos-sesion.html` → + verifica que Alineación (`documentosNextcloud` de `plan_evaluacion_data`) esté completo
- `encuesta-satisfaccion.html` → + verifica que los 4 PDFs de Documentos de Sesión estén subidos
- `evidencias.html` → + verifica que la Encuesta esté subida
- `entrega.html` → + verifica que las evidencias de Evaluación (`evidencias.html`) estén subidas

Si falta algo, se muestra el mismo `blockedScreen()` visual ya usado para NDA/pago, con un link de regreso a la página que genera lo pendiente.

**En la página que genera cada documento:** al terminarlo se intenta subir automáticamente una vez. Por cada documento se muestra su estado:
- ✅ Subido — nada más que hacer.
- ❌ No subido — botones "🔄 Reintentar subida" (manual, sin reintento automático en bucle, para no golpear un servidor casero durante una caída) y "⬇️ Descargar (respaldo)" para que el candidato siempre se quede con su archivo aunque Nextcloud esté caído.

El botón/link para avanzar a la siguiente fase permanece deshabilitado hasta que **todos** los documentos requeridos de esa pantalla muestren ✅.

## Seguridad y manejo de errores

- **Autenticación:** el endpoint exige un `access_token` real de Supabase y rechaza si no coincide con el `email` del payload — evita que un candidato autenticado escriba en la carpeta de otro.
- **Límite de tamaño:** 15MB por archivo (sobra para PDFs y fotos; evita cargas lentas o abuso sobre el túnel casero).
- **`NEXTCLOUD_URL`:** actualmente guardada como `https://nextcloud.paideiatech.net/login` — probablemente la URL de la pantalla de login del navegador, no el endpoint base correcto. El código la normaliza defensivamente, pero **hay que confirmar con Diego/Humberto cuál es el endpoint base real** antes de probar contra el servidor real (ver Riesgos).
- **Nextcloud caído / timeout / credenciales inválidas:** el endpoint responde `success:false` con el motivo; el cliente entra en el estado de reintento ya descrito. El candidato nunca se queda sin su archivo.

## Riesgos conocidos

1. **Dependencia de un servidor casero:** el bloqueo duro entre fases depende de que el Nextcloud de Humberto (TrueNAS + Cloudflare Tunnel) esté disponible. Si cae por un periodo largo, candidatos en ese momento del proceso quedan temporalmente atorados — decisión explícita del usuario (prefirió bloqueo duro + descarga manual de respaldo sobre un filtro solo informativo).
2. **URL base de Nextcloud sin confirmar** (ver arriba) — bloqueante para probar en producción real hasta confirmarla.
3. **Carpeta de candidato depende de CURP/Nombre ya capturados:** esto ya se cumple siempre, porque el paso `personal` (captura Nombre+CURP) ocurre antes que cualquier paso que genere un documento en `autodiagnostico.html` (`STEPS = ['intro','auth','personal','nda','e1','e2','e3','e4','firma','resultado']`).

## Testing / verificación

1. Sintaxis: `node --check` sobre `api/subir-portafolio.js` y sobre cada `<script>` modificado.
2. Endpoint aislado: probar `subir-portafolio` con un archivo de prueba pequeño contra el Nextcloud real (una vez confirmada la URL base), verificar que la carpeta se crea y el archivo aparece.
3. Rechazo de auth: probar que un token que no coincide con el `email` del payload es rechazado.
4. Flujo completo en `autodiagnostico.html` (stub de Supabase + fetch mockeado primero, luego un candidato de prueba real): generar los 3 documentos de Registro, confirmar que se suben, que el botón "Ir a mi Alineación" se habilita solo cuando los 3 muestran ✅, y que simular una falla de red muestra el estado ❌ + reintento + descarga.
5. Repetir el punto 4 para cada fase (Alineación, Evaluación con sus 3 páginas, Entrega).
6. `evidencias.html`: confirmar que el checklist ya no pide los 7 ítems eliminados, que los `<input type="file">` nuevos suben correctamente, y que "Confirmar Entrega" respeta el nuevo estado de subida además de sus condiciones actuales (video link, checkbox, firma).
7. Consola limpia en cada página modificada, con y sin datos previos.
8. Publicar y verificar en producción (una vez confirmada la URL de Nextcloud) con al menos un documento real de prueba.
