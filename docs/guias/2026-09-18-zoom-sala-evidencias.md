# Sala de evidencias en Zoom — lo que hace Diego (18 sep 2026)

## 1. Correr el SQL (una vez)
SQL Editor de Supabase → pegar y correr `_internal_no_publicar/02-sql/2026-09-18-sala-evidencias.sql`.
Si todavía no corriste `2026-09-18-centro-evaluador.sql`, córrelo antes.

## 2. Configurar la sala en la plataforma
Panel del equipo → Sesiones de Alineación → pestaña **🎥 Sala de evidencias**:
1. Pega el enlace de invitación, el ID y la clave de la reunión "PAIDEIA | Grabación de evidencias". Guarda.
2. Plantilla semanal: días, horas de inicio, 90 min + 15 de colchón, rango de fechas → Vista previa → Crear.

## 3. Ajustes en Zoom (zoom.us → Configuración → Grabación)
- Grabación en la nube: **activada**, automática (ya está en la reunión).
- Activar **"Mostrar el nombre de los participantes en la grabación"** y **"Agregar una marca de tiempo a la grabación"**.
- Vista: pantalla compartida con orador activo (y galería si quieres).
- En la reunión: **sala de espera apagada** (no hay anfitrión que admita), "Permitir unirse en cualquier momento" encendido.
- **Prueba una vez**: entra tú solo con otra cuenta, sin el anfitrión, 3 minutos; confirma que aparece la grabación en Grabaciones.
- **Almacenamiento**: Zoom Pro trae 5 GB y cada sesión pesa 0.3–0.8 GB. Las grabaciones se quedan en Zoom hasta que se entrega el certificado. Revisa el espacio (Administración de cuenta → Almacenamiento) y amplíalo antes de abrir muchos horarios: **cuando se llena, Zoom deja de grabar**.

## 4. App de Zoom para copiar grabaciones al NAS (10 min)
1. Entra a https://marketplace.zoom.us con la cuenta dueña de la sala → **Develop → Build App → Server-to-Server OAuth App**. Nombre: "Paideia Sala Evidencias".
2. Copia **Account ID**, **Client ID** y **Client Secret**.
3. Information: nombre de la empresa y correo de contacto.
4. Scopes → Add Scopes: busca y marca
   - ver una reunión (`meeting:read:meeting:admin` o "View a meeting"),
   - listar grabaciones de usuario (`cloud_recording:read:list_user_recordings:admin` o "View all user recordings"),
   - ver las grabaciones de una reunión (`cloud_recording:read:list_recording_files:admin` o "Get meeting recordings"),
   - borrar grabaciones de una reunión (`cloud_recording:delete:meeting_recording:admin` o "Delete meeting recordings").
   (Zoom cambia los nombres; si no aparecen exactos, elige los de "recording" y "meeting" que digan lo mismo.)
5. **Activate your app**.
6. Vercel → proyecto ec1375-posturalia → Settings → Environment Variables (Production), marcar como Sensitive:
   `ZOOM_ACCOUNT_ID`, `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET`. Luego **Redeploy**.

## 5. Después de cada sesión
Centro Evaluador → candidato → **Grabación de la sesión** → Buscar grabación en Zoom → marcarla → Ligar → **Copiar al expediente (NAS)**.
Queda en `Portafolios/<Nombre_CURP>/03-Evaluacion/Grabacion_Sesion_<fecha>_<hora>.mp4`.
"Borrar de Zoom" se habilita cuando la copia está verificada **y** el certificado se marcó como entregado (va a la papelera de Zoom, 30 días recuperable).
