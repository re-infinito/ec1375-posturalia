# Claude.md — EC1375 Paideia Tech

**Última actualización:** 17 de septiembre, 2026
**Qué es:** Sitio de certificación oficial EC1375 (SEP-CONOCER) para terapeutas alternativas en México. Landing de alta conversión (marca "Paideia Tech", antes "Posturalia") + portal post-pago donde el candidato completa todo el proceso de certificación desde el navegador (autodiagnóstico, alineación, evaluación, entrega de evidencias) sin papeleo.
**URL en vivo:** https://sepconocer.paideiatech.com (alias activo en paralelo: `ec1375-posturalia.vercel.app`, mismo proyecto de Vercel)
**Estado:** Todo lo descrito en este documento está en producción salvo que diga lo contrario. Precio de referencia: $14,750 MXN en 4 pagos (Registro 15% / Alineación 30% / Evaluación 40% / Entrega 15%), negociable por candidato.

---

## 🎯 Prueba definitiva — expediente real de Diego (`de.minconsciente@outlook.com`)

**Qué es:** Diego recorre el flujo completo con su **documentación real** y el portafolio resultante se entrega a la SEP, que debe aprobarlo. Es la primera corrida real de punta a punta desde que el contenido vive en Supabase, y la **primera ejecución de `assemble_expediente.py` contra un candidato real**. Todo lo de esta sección se verificó el 16 sep por la noche.

### ✅ Ya verificado — listo para empezar
- **La cuenta va por el flujo real**, aunque sea admin. La única exclusión de sincronización/subida es la cuenta demo, y compara contra un **correo exacto**: `is_current_user_flow_bypass_admin()` hace `auth.jwt()->>'email' = 'paideia.tech@outlook.com'` y `auth.js` usa `CANDIDATE_FLOW_BYPASS_EMAIL`. `isAdmin` no aparece en ninguna subida ni sincronización. Sus documentos se sincronizan con Supabase y suben a Nextcloud.
- **Políticas RLS de Storage** (`fotos-candidato`, `certificados-previos`): probadas subiendo archivos reales con una sesión de usuario — guardar y leer en la carpeta propia **permitido**, guardar en la carpeta de otro usuario **bloqueado** ("new row violates row-level security policy"). Los archivos de prueba se borraron.
- `api/subir-portafolio` vivo en producción; plantilla del IEC limpia; todas las migraciones de `02-sql/` aplicadas.
- **Dejar el Autodiagnóstico a medias y volver** funciona desde el 17 sep: antes "Continuar donde me quedé" no hacía nada si ya había datos personales y Acuerdo firmados (ver "Cambios recientes (17 de septiembre)").

### Estado de la cuenta ANTES de empezar
- Usuario de Auth confirmado. **La fila de `candidatos_ec1375` trae datos de pruebas anteriores** (actualizada el 15 sep): autodiagnóstico, plan de evaluación, documentos de sesión, encuesta, examen y ruta de estudio, más 2 PDFs viejos en Nextcloud (`Portafolios/Diego_Eugenio_Garza_Arroyo_<CURP>/02-Alineacion/`: Plan de Evaluación y su Acuse).
- `candidatos_precio.estado = 'administrador'` y el correo está en `admins`.
- Fases autorizadas a mano: registro, alineación, evaluación **y entrega** (esta última desde el 26 ago).

### Pasos de Diego antes de empezar
1. **Arrancar limpio — los dos lados, no solo uno.** `_flushPendingSync()` sube a Supabase la columna que cada página guarda, y `autodiagnostico.html` baja la nube al navegador cuando no hay progreso local. Si se limpia solo la base, el navegador vuelve a subir los datos viejos; si se limpia solo el navegador, la nube los vuelve a bajar.
   - **a) Base** (SQL Editor):
     ```sql
     -- 1) respaldo: copiar el resultado antes de borrar
     select * from candidatos_ec1375
     where user_id = (select id from auth.users where email = 'de.minconsciente@outlook.com');

     -- 2) vaciar el progreso (conserva la fila, nombre y CURP)
     update candidatos_ec1375 set
       autodiagnostico_data = null, plan_evaluacion_data = null, documentos_sesion_data = null,
       encuesta_data = null, evidencias_data = null, examen_conocimientos_data = null,
       ruta_estudio_data = null, updated_at = now()
     where user_id = (select id from auth.users where email = 'de.minconsciente@outlook.com');
     ```
   - **b) Navegador:** borrar los datos del sitio `sepconocer.paideiatech.com` (almacenamiento local) en **cada** navegador y celular donde se haya usado esa cuenta, **antes** de volver a entrar. Desde el 17 sep los datos de la **cuenta demo** ya no son riesgo aunque se haya usado en ese navegador (`auth.js` los aparta, ver "Datos demo: una cuenta real nunca los usa ni los sube"), pero este paso **sigue siendo necesario**: el progreso viejo de las pruebas de esta misma cuenta no lleva marca `_demo` y se volvería a subir.
2. **Decidir sobre Entrega.** Está preautorizada; a un candidato real la libera el evaluador después de revisar. Para que la prueba refleje el flujo real (recomendado), revocarla hasta la aprobación:
   ```sql
   delete from candidatos_fase_pagos where email = 'de.minconsciente@outlook.com' and fase = 'entrega';
   ```
3. **Escribir nombre y CURP exactamente como en los documentos oficiales**: la carpeta de Nextcloud se nombra con ellos. Si cambian respecto a la prueba vieja se crea una carpeta nueva (el script lee las rutas de la base, así que no se mezclan; la vieja queda huérfana y se puede archivar).

### Diferencias conscientes vs. un candidato real (no afectan documentos)
Por ser admin: `protect.js` no se activa (sin marca de agua ni bloqueo de copia), aparece "Volver al panel de administrador" en el sidebar, y la cuenta queda fuera de KPIs y utilidades.

### Durante y después — orden
1. Recorrer los 10 pasos con los documentos reales.
2. En el panel, confirmar que los 15 documentos marquen **"subido"**, no solo "descargado": el script solo ensambla lo que está en Nextcloud.
3. El evaluador revisa el video y llena Cédula de Evaluación e IEC; liberar Entrega.
4. `python3 assemble_expediente.py "Nombre Completo"` desde `_internal_no_publicar/01-scripts/`.
5. **Revisar el PDF ensamblado página por página** contra `PORTAFOLIO HUMBERTO LOT 1375  .pdf` antes de entregarlo.

### ⚠️ Puede afectar la aprobación de la SEP — confirmar con el evaluador ANTES de ensamblar
- **Foto para el diploma y certificados de formación** se suben a Nextcloud, pero `assemble_expediente.py` **no los incluye en el PDF final**; su ubicación en el expediente oficial nunca se confirmó. Si la SEP los pide dentro del portafolio, hay que ajustar el script antes de generar el expediente.
- Cédula de Evaluación e IEC los llena el evaluador; el script inserta el IEC en blanco.

---

## Stack

- HTML5 + CSS3 + JS vanilla, **sin build step, sin framework**. Convención del proyecto: **páginas estáticas sin módulos compartidos** — cada `.html` es autocontenida. Tres excepciones deliberadas: `auth.js` (sesión/RLS), `flow-status.js` (los 10 pasos reales del flujo y qué cuenta como "completo" en cada uno) y `crm-shell.js` + `crm-shell.css` (sidebar/encabezado/tema del panel tipo CRM que envuelve cada página del flujo en tiempo de ejecución — un sidebar copiado 12 veces se desincroniza) — los tres son justo el tipo de lógica donde una copia desincronizada entre páginas es el modo de falla a evitar (ya pasó más de una vez). Orden de carga: `auth.js` → `flow-status.js` → `crm-shell.js` → script propio de cada página; ver secciones "Progreso del candidato" y "Shell CRM del candidato" abajo.
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
panel.html                           Login (email+password/login-maestro) Y, una vez logueado, panel de control
                                          tipo CRM (hero con cifras: pasos/documentos/fase pagada/próxima sesión +
                                          tarjetas de progreso, ruta, documentos del expediente, pagos, sesión de
                                          Alineación y "Requieren atención") — todo calculado de flow-status.js,
                                          pullMyRow, isPhaseAuthorized y api/mis-inscripciones-alineacion
recuperar.html                           Stub de redirección a panel.html (nombre viejo, 15 sep) — conserva query y hash
restablecer-password.html                Landing de "olvidé mi contraseña" (Supabase PASSWORD_RECOVERY)

autodiagnostico.html      142 reactivos EC1375, wizard de pasos, login+password aquí, foto+autorización RENAP,
                           certificados previos, firma — sube a Nextcloud el Autodiagnóstico, la Ficha de
                           Registro RENAP y sus Acuses (ver sección "Ficha de Registro RENAP" abajo)
alineacion.html           Gate fase Alineación · reserva de sesión en vivo (Google Calendar) · CTAs a estudio.html?modo=alineacion / ?modo=biblioteca
estudio.html              VISOR DE ESTUDIO UNIFICADO (17 sep) — ?modo=biblioteca | alineacion | reforzamiento | practica |
                           examen, con la misma navegación guiada. Ver sección "Visor de estudio unificado" abajo.
estudio-logica.js         Lógica pura del visor: estado V4.4 de Reforzamiento/Práctica (porte 1:1 del motor, paridad
                           verificada) + Examen de Conocimientos. Pruebas: tests/estudio-logica.test.js
estudio.css               Guía, barra inferior, modales y paneles del visor (se carga después de visor-diapositivas.css)
examen-pdf.js             Comprobante PDF del Examen (logos oficiales); estudio.html lo carga solo al descargar
visor-diapositivas.css/.js   Estilos de diapositiva (extraídos verbatim del <style> del pipeline) + catálogo/recomendados/
                           filtros/videos/quizzes/tema (tests/visor-diapositivas.test.js) + TEMA_A_CRITERIO del examen
biblioteca.html, ruta-alineacion.html, ruta-estudio.html, reforzamiento.html, practica.html, examen-conocimientos.html
                           REDIRECCIONES a estudio.html?modo=… (conservan &crit=, ?reintentar=1, ?boot= y #sid). El motor
                           V4.4 de 287 KB y el examen anterior ya no existen como páginas (están en el historial de git).
guion-maestro.html        Guion de apoyo para la sesión real con el usuario (abrir en otra pestaña o imprimir) —
                           enlazado desde plan-evaluacion.html, sin PDF ni gate de fase propio
plan-evaluacion.html      Tabla de 25 grupos (=142 reactivos), agenda cita, gate fase Evaluación
documentos-sesion.html    Wizard de 4 documentos (Ficha/Consentimiento/Plan Sesión/Seguimiento) de la sesión real con paciente
encuesta-satisfaccion.html  7 preguntas oficiales, formato de caritas (RED CONOCER/ICEMéxico)
evidencias.html           Checklist final + uploads nativos (Zoom, INE, CURP, foto diploma, certificados)
entrega.html              Gate fase Entrega, confirmación final (no enlazada desde el flujo — el equipo comparte el link manual cuando el evaluador aprueba)

admin-crm.html            Panel del equipo (home admin, 15 sep): hero con candidatos activos, ingresos vs proyectado,
                           utilidades pagadas vs pendientes e inscritos a próximas sesiones + tarjetas (candidatos por
                           paso, ingresos por fase, últimos pagos, próximas sesiones, utilidades por lote, requieren
                           atención, índice de módulos). Shell CRM en modo admin (`data-crm-mode="admin"`).
admin-candidatos.html     Lista tipo "pacientes": nombre, lote, estado, fase pagada, paso actual (FlowStatus.computeSteps
                           con la fila del RPC admin_lista_candidatos), documentos X/15, última actividad; búsqueda
                           (`?q=`), filtros y drawer de detalle con los 10 pasos y los 15 documentos con su ruta
admin-data.js             Módulo compartido SOLO de páginas admin: AdminData.cargar() (precio, pagos, reparto,
                           utilidades_pagos, RPCs admin_lista_nombres/admin_lista_candidatos, /api/sesiones-alineacion)
                           + kpis()/utilidades()/candidatos()/porPaso()/ultimosPagos()/atencion() — port exacto de las
                           fórmulas de admin-kpis/admin-utilidades (que siguen con su copia local). Pruebas en
                           tests/admin-data.test.js.
admin-index.html          Stub de redirección a admin-crm.html (el índice de módulos vive ahí como tarjeta)
admin-precios.html        Montos por fase, altas de candidatos, status de pago, liberación manual por fase
admin-sesiones.html       Crea sesiones grupales de Alineación (Google Calendar/Meet), lista inscripciones
admin-kpis.html           Dashboard de KPIs (inscritos/completados/ingresos por fase) — GATEADO por `Auth.renderAdminGate()`,
                           lee `candidatos_precio`/`candidatos_fase_pagos` directo desde Supabase (sin API propia)
admin-utilidades.html     Reparto de utilidades por lote de ingresos entre 3 socios (Fernando/Lot/Diego, 16.67% c/u
                           por default) + colaborador opcional "Christherapy" (50%, deja 16.67% c/u a los socios) —
                           tabla `reparto_utilidades`, gateado por `Auth.renderAdminGate()`. Desde el 15 sep además
                           registra utilidades YA PAGADAS por socio y lote (tabla `utilidades_pagos`: alta, baja y
                           pagado vs pendiente por socio)
kpi-dashboard-live.html   ⚠️ Versión vieja del dashboard de KPIs — SIN gate de autenticación, público a quien tenga
                           la URL, y ya no está enlazada desde ningún lado del sitio. Redundante con admin-kpis.html
                           (que sí está gateado) — candidato a retirar, ver backlog #13.

firma-candidato.js        "Usar la misma firma de mi Autodiagnóstico" (17 sep) — módulo compartido, ver sección
                           "Firma reutilizable del candidato". Pruebas: tests/firma-candidato.test.js.
auth.js                   Supabase Auth (email+password) + sync + gates + admin bypass — módulo compartido
flow-status.js            Fuente única de los 10 pasos del flujo y de qué cuenta como "completo" en cada uno —
                           módulo compartido (ver "Progreso del candidato" abajo)
contenido.js              Carga del contenido protegido desde Supabase (proyecto 4, 15 sep): tabla `contenido_ec1375` +
                           bucket privado `contenido-imagenes` (URLs firmadas 1 h), RLS por fase pagada/admin/bypass
                           (`puede_leer_contenido(fase)`). `Contenido.cargar(clave, {fallback})`, `imagenes()`, `errorHtml()`.
                           Publica `_internal_no_publicar/01-scripts/publicar_contenido.py` (extraer → publicar → shell).
                           Ver sección "Contenido al servidor" abajo. Pruebas: tests/contenido.test.js.
manifest.json, sw.js, icons/   PWA instalable: el service worker cachea SOLO la app (nunca contenido, Supabase ni /api/),
                           TODO red primero — la caché solo se usa sin conexión (16 sep; antes JS/CSS iban caché primero y
                           la primera visita tras un deploy mezclaba HTML nuevo con JS viejo);
                           botón "Instalar aplicación" en el sidebar (crm-shell.js). Iconos generados del logo con PIL.
protect.js                Disuasión de copia/captura (15 sep): marca de agua en mosaico con correo+fecha, bloqueo de
                           selección/copiar/arrastrar/clic derecho (no en campos de formulario), atajos F12/Ctrl+Shift+I-J-C-K/
                           Ctrl+U/Ctrl+S/Ctrl+P/PrintScreen y vista de impresión en blanco. Se activa solo con sesión NO
                           exenta (exentos: cuenta bypass y correos en `admins`); `?protect=1` fuerza activarla para probar.
                           `data-protect-print="allow"` permite imprimir (solo guion-maestro.html). Cargado en las 11
                           páginas del flujo (las reales + estudio.html + guion-maestro). NO bloquea
                           screenshots de verdad (imposible en web) — es disuasión y rastreo. Pruebas: tests/protect.test.js.
crm-shell.js, crm-shell.css   Shell CRM del candidato: CrmShell.mount() envuelve el DOM de la página con sidebar
                           (10 pasos con ✓/▶/🔒 + badge de pendientes) + encabezado (hamburguesa, toggle de tema,
                           usuario); CrmShell.renderDashboard() pinta el panel de panel.html. Tema claro por
                           default con toggle a oscuro (localStorage 'paideia-theme'), vía los 9 tokens compartidos
                           + --border/--surface-2. Modo rail (<script data-crm-mode="rail">) en ruta-estudio/
                           ruta-alineacion: solo iconos, sin tema. Helpers puros probados con `node --test tests/*.test.js`.
tests/crm-shell.test.js   Pruebas en Node (sin dependencias) de los helpers puros de crm-shell.js
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
- **Candidato:** `Auth.renderAuthGate()` en `auth.js` — **primero revisa si ya hay sesión guardada y entra directo** (15 sep; antes siempre arrancaba en el paso de correo aunque Supabase ya tuviera la sesión persistida, por eso había que teclear la contraseña en cada visita); si no hay sesión: correo → "ya tengo contraseña" (signin) / "primera vez" (signup) / "olvidé mi contraseña" (`resetPasswordForEmail` → `restablecer-password.html`, escucha el evento `PASSWORD_RECOVERY`). Casilla **"Mantener mi sesión iniciada en este dispositivo"** (marcada por default) en los pasos de contraseña: el cliente de Supabase usa un adaptador de storage (`authStorageAdapter`) que guarda la sesión en `localStorage` o, si se desmarca, en `sessionStorage` (se borra al cerrar el navegador); la elección vive en `localStorage['paideia-remember']` (`'0'` = no recordar). Para cambiar de cuenta: "Cerrar sesión" en el sidebar.
- **Admin** (cuenta con `is_admin()`): `Auth.renderAdminGate()` — mismo patrón pero comprueba `is_admin()` en el paso de correo, **antes** de ofrecer signin/signup (si no, una cuenta admin que nunca puso contraseña no tenía a dónde ir en "primera vez").
- **Login-maestro:** cualquier correo con ≥1 fase pagada + contraseña universal **`Paideia2026`** (env var `MASTER_LOGIN_PASSWORD`) inicia sesión como ese candidato — pensado para que el equipo ayude en llamadas sin esperar un correo de restablecimiento. `api/master-login.js` verifica la contraseña maestra ANTES de tocar el correo (mensaje 401 genérico si falla), confirma que el correo tenga al menos una fila en `candidatos_fase_pagos`, y emite sesión vía Admin API (`generateLink` tipo magiclink → el cliente canjea con `verifyOtp`). Nunca expone la service role key ni la contraseña maestra al navegador. `Auth._handleSignIn()` cae a esto automáticamente si el signin normal falla (mismo mensaje de error en ambos casos, no revela el motivo).
- **Bypass de navegación libre** (solo `paideia.tech@outlook.com`, `CANDIDATE_FLOW_BYPASS_EMAIL` en `auth.js`): salta el pago de "registro" y **siembra datos FICTICIOS en TODO el flujo** (15 sep: Autodiagnóstico con foto y certificado demo, Plan de Evaluación, los 19 pasos de Documentos de Sesión con paciente "Carlos Ejemplo Torres", Encuesta, Evidencias y Examen ya presentado — candidata demo "Ana Sofía Demo Ramírez", `Auth.ADMIN_PLACEHOLDER_AUTODIAGNOSTICO()` / `ADMIN_PLACEHOLDER_DOWNSTREAM()` en `auth.js`, cada objeto con `_demo: true`) y **no tiene ningún candado** (`FlowStatus.getSteps()` pone `locked=false` en los 10 pasos para esta cuenta), para que Diego grabe videos explicando qué llena cada candidato. Como `Auth._flushPendingSync()` nunca sincroniza esta cuenta a Supabase (a propósito), su progreso se lee de `localStorage` vía `FlowStatus.getRow()` (misma forma que la fila real) — de otro modo ningún paso posterior al Autodiagnóstico se marcaría hecho. `ensureAdminPlaceholderData()` siembra solo lo que falte o no sea demo (respeta lo que el admin edite durante el video — ver "Datos demo: lo editado se conserva" abajo); "🔄 Reiniciar demo" (sidebar) borra todo el progreso local (incluido `ec1375-state` del motor de estudio) y vuelve a sembrar. Si una página cambia el esquema de lo que guarda en localStorage, hay que actualizar el placeholder correspondiente. Verificado server-side vía RPC `is_current_user_flow_bypass_admin()` (nunca confía en `session.user.email` del cliente, que se puede falsificar). La barra fija de admin (`Auth.renderAdminBar()`) se retiró el 15 sep — el sidebar del shell CRM la sustituye; el botón "🔄 Reset demo" (limpia el progreso downstream sin borrar el placeholder) ahora aparece en el sidebar solo para esta cuenta. Entrega nunca se marca "done"/autorizada para esta cuenta sin importar lo que diga `candidatos_fase_pagos` — es dinero real y una decisión real del evaluador, no algo que la cuenta de pruebas deba poder simular (`FlowStatus.getSteps()` lo fuerza a `false` explícitamente). Detalle completo: `docs/superpowers/specs/2026-09-12-admin-flow-bypass-design.md`.

- **Datos demo: lo editado se conserva (17 sep).** Hasta el 17 sep lo documentado arriba no se cumplía: cada página arma su objeto desde cero al guardar (`saveProgress`/`savePlanProgress`, y el guardado del examen al reiniciarlo — hoy `guardarExamen()` en estudio.html) y **ninguna copiaba `_demo`**, así que el siguiente `render()` llamaba `ensureAdminPlaceholderData()`, tomaba la edición por datos de otra persona y la reemplazaba con los ficticios. Pasaba en las 6 páginas con datos demo (Autodiagnóstico, Plan de Evaluación, Documentos de Sesión, Encuesta, Evidencias, Examen). **Arreglo en un solo lugar (`auth.js`), sin tocar páginas:** todo guardado de progreso escribe localStorage y justo después llama `Auth.syncToSupabase(columna, …)`; ahí, si `Auth._isBypassSession === true`, `_conservarMarcaDemo(columna)` vuelve a poner `_demo: true` en la llave de esa columna (`Auth.DEMO_COLUMNAS`, las 6 que se siembran). **Decisión: `_demo` sigue siendo la señal, en vez de una llave aparte de "ya sembré"**, porque viaja con los datos: una llave aparte no distinguiría lo que editó el admin de lo que un candidato real dejara después en el mismo navegador, y dejaría de reemplazarse. Cuentas reales: la marca nunca se agrega (la bandera viene del RPC server-side) y `_flushPendingSync` sigue sin sincronizar la cuenta demo. `tests/datos-demo.test.js` carga `auth.js` en `vm` y exige: la edición sobrevive en las 6 llaves, una cuenta real (bandera `false` o aún sin verificar) nunca recibe `_demo`, los datos ajenos se siguen reemplazando, `DEMO_COLUMNAS` cubre exactamente lo sembrado, y **cada página sigue llamando `syncToSupabase` con su columna justo después de `setItem`** (lee el HTML: si una página deja de hacerlo, la prueba falla antes de que vuelva el bug). **Verificado en navegador** con sesión simulada: Supabase respondido por Playwright (RPC de bypass `true`, lecturas vacías); el código de las páginas corre tal cual. No se pudo entrar con la cuenta demo real: iniciar sesión exige teclear la contraseña. Resultados: reproducido antes del arreglo (`savePlanProgress` `_demo=false` → resiembra desde `auth.js`); después, en Plan de Evaluación, un campo editado, una firma dibujada y "Usar esta firma" sobreviven a render y recarga; Encuesta y Evidencias (desde la interfaz), Documentos de Sesión y Autodiagnóstico (con su `saveProgress` real) y el examen reiniciado (con su `saveExamState`: sus reactivos no cargan sin contenido real) sobreviven a recorrer 7 páginas que resiembran. 0 escrituras a Supabase. Con cuenta real simulada: sin `_demo` en localStorage ni en el upsert. "Reiniciar demo" sigue resembrando desde cero. **Límite conocido (previo, no cambió):** Plan, Documentos de Sesión, Encuesta y Evidencias cargan su progreso en `load` ANTES del `ensure` de su `render()`. Si datos de otra cuenta llegaran al navegador con la sesión demo ya abierta (p. ej. dos pestañas con "no recordar"), esa primera pantalla mostraría los datos ajenos, y ahora un guardado ahí los marcaría como demo. En el uso normal no pasa: al iniciar sesión como demo, `panel.html` resiembra antes de abrir cualquier página del flujo.

- **Datos demo: una cuenta real nunca los usa ni los sube (17 sep).** localStorage es del navegador, no de la cuenta, y `signOut()` no borraba el progreso local. Si la cuenta demo se usó en un navegador y después entraba ahí una cuenta real, cada página cargaba los objetos `_demo` como propios y el siguiente guardado los subía a **la fila real**, con `curp = DERA900515MNLMMN08` y `nombre = "Ana Sofía Demo Ramírez"` (esos dos se escriben en las columnas de la fila, no solo en el JSON). **Reproducido con Playwright** (Supabase simulado, archivos del worktree servidos desde disco, `sw.js` bloqueado; la cuenta demo entra en `panel.html`, siembra y cierra sesión): la cuenta real que entra desde el gate del Autodiagnóstico sube `autodiagnostico_data` ficticio sin tocar nada (`handleAuthVerified` → `saveProgress()`), y la que entra por `panel.html` ve a la candidata demo en el Plan de Evaluación y sube `plan_evaluacion_data` al editar un campo, y el Examen (`estudio.html?modo=examen`) sube `examen_conocimientos_data` al abrirse. **Arreglo en `auth.js`, sin tocar páginas:** mientras no se confirme que la sesión es la demo, los objetos con `_demo: true` de `DEMO_COLUMNAS` se **apartan** a la llave `paideia-demo-apartado`: las páginas no los encuentran y arrancan limpias. Quién decide:
  - **Al cargar `auth.js`** (antes que cualquier script de página) se apartan, salvo que la sesión guardada por supabase-js sea de `paideia.tech@outlook.com` (`_correoSesionGuardada()`: lee `user.email` de `sb-numsuiuwrvpprhnxovmh-auth-token`, llave que ahora se pasa explícita como `storageKey`, mismo valor que el default). Es una pista del navegador y **solo sirve para esconder, nunca da acceso**; hace falta porque Plan, Documentos de Sesión, Encuesta y Evidencias cargan su progreso en `load` antes de preguntarle nada al servidor.
  - **`isBypassSession()`** (RPC server-side): demo → se restauran (`_restaurarDatosDemo`, sin pisar lo demo que ya esté en uso); otra cuenta confirmada → se borran (`_descartarDatosDemo`); sin sesión o sin respuesta del servidor → se quedan apartados. Si la pista decía "demo" y el servidor dice que no, también se borran.
  - **`signOut()`** los aparta al momento.
  - **Respaldo en `_flushPendingSync()`:** una cuenta no demo nunca sube un guardado con el curp o el nombre demo (o con `_demo`). La marca sola no alcanza ahí: cada página arma su objeto sin `_demo` antes de llamar a `syncToSupabase`.
  - **Decisión: apartar en vez de borrar** hasta que el servidor confirme, para que la cuenta demo recupere lo editado en un video si cierra sesión y vuelve a entrar. "Reiniciar demo" también borra el apartado (`DEMO_LOCAL_KEYS`). Los datos sin `_demo` nunca se tocan.
  - **Pruebas:** `tests/datos-demo.test.js` agrega 10 (suite completa: 65): cuenta real con sesión guardada, sin sesión y luego entra la demo (recupera la edición y no resiembra) o una real (se borran), sesión demo guardada (siguen a la vista), pista falsa, servidor sin respuesta, datos reales intactos, `signOut`, el respaldo del upsert y el apartado en `DEMO_LOCAL_KEYS`. Con el `auth.js` anterior fallan 8; las 2 que pasan son las de "no tocar" (sesión demo y datos reales).
  - **Verificado en navegador** con los mismos 3 recorridos de la reproducción más uno de la cuenta demo con sesión abierta: la cuenta real llega al Autodiagnóstico en portada limpia y, al entrar, a "Datos personales" vacío; en `panel.html` → Plan y Examen no ve a la candidata demo; **0 upserts** en los tres. La cuenta demo: edita el Plan, cierra sesión, abre el Plan sin sesión (datos apartados), vuelve a entrar y la edición sigue ahí; con sesión abierta recorre Plan, Documentos de Sesión, Encuesta, Evidencias y Autodiagnóstico con sus datos a la vista y la edición sobrevive; 0 upserts. supabase-js 2.116 guarda `user.email` dentro de la sesión (confirmado en el navegador).
  - **Riesgo que sigue abierto (no es de la cuenta demo):** el progreso local de **otra cuenta real** en el mismo navegador no lleva marca y se sigue tratando como propio. Por eso el paso 1b de la "Prueba definitiva" se queda.

**Pagos por fase:** `candidatos_precio` (email → `total_acordado`, default $14,750, se edita a mano en Supabase) + `candidatos_fase_pagos` (email+fase → pagado) + RPC `is_fase_authorized(email, fase)`. Cada página gateada exige la fase anterior autorizada **y** sus documentos ya subidos a Nextcloud (doble compuerta). Transferencias bancarias se autorizan a mano en el Table Editor de Supabase; pagos por Mercado Pago los autoriza `api/mercadopago-webhook.js` automáticamente.

---

## Progreso del candidato (`flow-status.js`)

Módulo compartido que define los **10 pasos reales** del flujo (Autodiagnóstico → Reforzamiento → Alineación → Plan de Evaluación → Documentos de Sesión → Práctica → Examen de Conocimientos → Encuesta → Evidencias → Entrega) y calcula, para cada uno, `done`/`current`/`locked` — reutilizando siempre el MISMO gate que la página siguiente ya usa para dejar pasar, nunca una condición inventada aparte. Expone:
- `FlowStatus.getSteps()` — el arreglo de 10 pasos con su estado.
- `FlowStatus.renderProgressBar` ya no existe (15 sep) — la barra de chips fue reemplazada por el sidebar de `crm-shell.js` (`CrmShell.mount({ currentPageId, steps })`), que consume el mismo `getSteps()`. Los wizards largos (Autodiagnóstico, Documentos de Sesión) conservan su barra de progreso INTERNA.
- `FlowStatus.renderNextStepCTA(steps, currentPageId, container)` — botón "Siguiente: X →" calculado del estado real, nunca un href escrito a mano por página.

**Entrega es un caso especial siempre:** nunca es "current" (depende de que el equipo la autorice a mano tras revisar la evaluación real), y su razón de bloqueo es siempre `esperando_evaluador`. Para la cuenta de bypass, Entrega nunca se marca "done" sin importar lo que diga `candidatos_fase_pagos` — es dinero real y una decisión real del evaluador.

`panel.html` usa este módulo para mostrar, justo después de iniciar sesión, un dashboard completo del proceso (resuelve lo que antes era el backlog "página de estado del proceso para el candidato").

---

## Ficha de Registro RENAP + foto del candidato

Documento oficial de autorización de publicación de datos en el RENAP (Registro Nacional de Personas con Competencias Certificadas), construido en el paso "personal" del Autodiagnóstico junto con la foto del candidato:
- **Foto:** obligatoria para avanzar. Se reescala a máx. 500px de ancho (canvas, JPEG calidad 0.85) y se incrusta directamente en el PDF como preview — la subida del archivo original a Storage es solo respaldo y su falla no bloquea el avance.
- **Autorización RENAP:** checkbox voluntario, NO bloquea el avance. El PDF marca `SI ( X ) NO ( )` según la respuesta, con el texto legal RENAP verbatim.
- Bucket privado de Supabase Storage `fotos-candidato` (RLS por `user_id`, mismo patrón que `certificados-previos`). `Auth.uploadFotoCandidato(file, path)` en `auth.js` (con `upsert:true`, a diferencia de `uploadCertificado`).
- `generateFichaRegistroPDFBlob()` genera el PDF; se sube a Nextcloud junto con el resto de los documentos de Registro (mismo mecanismo `subirDocumento('registro', ...)` que el Autodiagnóstico) y aparece en el checklist de resultado como "🪪 Ficha de Registro".
- En `assemble_expediente.py`: slot dedicado `ficha_registro_candidato` (detectado por palabras clave "ficha de registro"/"renap", distinto del slot preexistente `ficha_registro_paciente`), insertado justo después del separador inicial, antes de CURP/INE — orden verificado contra un expediente real.

**✅ Listo (16 sep):** el bucket privado `fotos-candidato` se creó vía la API de Storage y Diego corrió las 2 políticas RLS de `supabase_setup_v7_foto_candidato_storage.sql` en el SQL Editor. **Verificado con una prueba real**, no solo leyendo configuración: con sesión de usuario, guardar y leer en la carpeta propia está permitido, y guardar en la carpeta de otro usuario lo bloquea RLS. La subida sigue siendo respaldo — la foto va incrustada en el PDF — pero ya no falla.

---

## Documentos → Nextcloud (reemplaza Google Form para uploads generados)

`api/subir-portafolio.js` sube automáticamente cada PDF que el sitio genera (Autodiagnóstico + Ficha de Registro RENAP + sus Acuses, Plan de Evaluación + Acuse, los 4 de Documentos de Sesión, Encuesta) a `Portafolios/{Nombre_CURP}/{01-Registro|02-Alineacion|03-Evaluacion|04-Entrega}/` en el Nextcloud de Humberto (TrueNAS SCALE + Cloudflare Tunnel, cuenta de servicio solo-WebDAV), validando el `access_token` real de la sesión antes de aceptar (evita que un candidato sobreescriba la carpeta de otro). Estado por documento vive en el JSONB de cada página (`documentosNextcloud: {clave: ruta}`) — sin tablas ni RPCs nuevas.

**Cadena de gates (bloqueo duro):** Alineación exige Registro subido → Documentos de Sesión exige Alineación → Encuesta exige Documentos de Sesión → Evidencias exige Encuesta → Entrega exige Evidencias. `documentosFaseCompletos()` (duplicada en cada archivo gateado) acepta subido-O-descargado como "completo" — ver "Cambios recientes" abajo.

El Google Form de evidencias se retiró — `evidencias.html` ahora usa `<input type="file">` nativos solo para lo que el sitio no genera: capturas de Zoom, INE, CURP, foto de diploma, certificados (opcional).

**✅ Verificado end-to-end (14 sep 2026):** el Nextcloud además está detrás de Cloudflare Access (Zero Trust, capa aparte del Tunnel) — sin credenciales, cualquier request quedaba atrapada en una pantalla de login por correo antes de llegar a Nextcloud. Humberto generó un Service Token (`CF_ACCESS_CLIENT_ID` / `CF_ACCESS_CLIENT_SECRET`, mandados como headers `CF-Access-Client-Id`/`CF-Access-Client-Secret` en cada request) que lo evita para tráfico servidor-a-servidor. Con eso, se probó la secuencia real completa (MKCOL en cascada + PUT) directo contra `nextcloud.paideiatech.net` — 201 en los 4 pasos, confirmando URL, Service Token y contraseña de aplicación correctos.

Spec: `docs/superpowers/specs/2026-09-12-nextcloud-portafolio-storage-design.md`. Plan: `docs/superpowers/plans/2026-09-12-nextcloud-portafolio-storage.md`.

---

## Sesiones de Alineación en vivo (Google Calendar + Zoom)

`alineacion.html` deja al candidato reservar un horario real: `api/sesiones-alineacion.js` lista cupos, `api/inscribir-alineacion.js` inscribe (agrega invitado al evento de Calendar vía `events.patch` preservando invitados existentes, envía email de confirmación por Resend), `api/mis-inscripciones-alineacion.js` consulta las propias. El admin crea/borra sesiones desde `admin-sesiones.html` vía `api/crear-evento-google.js` / `api/eliminar-evento-google.js`. El evento en sí sigue viviendo en Google Calendar (eso es lo que le manda la invitación al calendario del candidato vía `sendUpdates: 'all'` al inscribirse — funciona sin importar el proveedor de email del candidato), pero la videollamada es por **Zoom**, no Google Meet (no tenemos membresía de Google Meet — el límite de 1h en llamadas grupales de la cuenta gratuita obligaba a agendar bloques de 2h como colchón para una sesión que en realidad duraba 1h). El link de Zoom tampoco se autogenera: el admin agenda la reunión en zoom.us y pega el link (columna `zoom_link`) al crear la sesión. `api/enviar-recordatorios.js` (cron por hora) manda recordatorios 24h y 1h antes, comparando siempre en hora de México (`Intl.DateTimeFormat` con `timeZone: 'America/Mexico_City'`) porque Vercel corre en UTC.

Tablas: `sesiones_alineacion` (columna `zoom_link`, renombrada de `google_meet_link` el 15 sep), `inscripciones_alineacion`, `emails_enviados_alineacion` (auditoría de envíos).

**✅ Ya aplicado** (verificado 16 sep contra la API REST): `sesiones_alineacion.zoom_link` responde 200 y `google_meet_link` ya no existe, así que el renombre de `2026-09-15-rename-google-meet-link-to-zoom-link.sql` corrió y el código está alineado con la columna real.

---

## KPI Dashboard y Reparto de Utilidades (admin)

- **`admin-kpis.html`** — versión gateada (`Auth.renderAdminGate()`) del dashboard de KPIs: inscritos/completados/en-progreso e ingresos por fase, leyendo `candidatos_precio` + `candidatos_fase_pagos` directo de Supabase client-side (sin API propia). Es la que hay que usar/compartir de aquí en adelante.
- **`kpi-dashboard-live.html`** — la versión vieja, **sin ningún gate**, sigue viva en esa URL aunque ya no está enlazada desde ningún lado del sitio. Ver backlog #13.
- **`admin-utilidades.html`** — reparto de utilidades por lote de ingresos entre los 3 socios (Fernando/Lot/Diego, 16.67% cada uno por default) más un colaborador opcional "Christherapy" (50% cuando participa, deja 16.67% c/u a los socios en vez de 33.33%). Configuración por lote guardada en la tabla `reparto_utilidades`, gateado por `Auth.renderAdminGate()`.
- **`api/kpi-data.js`** sigue existiendo (usado originalmente por `kpi-dashboard-live.html`) — confirmar si `admin-kpis.html` todavía lo necesita o si puede eliminarse junto con la página vieja.

---

## Certificados de formación previa (candidato)

En el paso "personal" del Autodiagnóstico, el candidato escribe el nombre de cada certificación tal cual aparece en su certificado y sube el archivo (PDF/imagen, máx. 10MB) — obligatorio marcar "no tengo ninguno" o subir al menos uno. Archivos en bucket privado de Supabase Storage `certificados-previos` (RLS por `user_id`, primer segmento de la ruta). `Auth.uploadCertificado(file, path)` en `auth.js`. El campo "Escolaridad/Certificaciones" del PDF oficial se llena desde estos nombres.

**✅ Listo (16 sep):** bucket privado `certificados-previos` (creado el 9 sep) con sus 2 políticas RLS, que Diego volvió a correr con `drop policy if exists` por precaución. **Verificado con una prueba real** igual que `fotos-candidato`: carpeta propia permitida, carpeta ajena bloqueada. (Las políticas no se pueden leer desde la API — PostgREST no expone `pg_policies` —, por eso se prueba el comportamiento.)

---

## Firma reutilizable del candidato (`firma-candidato.js`, 17 sep)

Pedido de Diego: que el candidato pueda replicar la firma que ya usó en el Autodiagnóstico en los demás lugares donde se le pide firma. Arriba de cada recuadro de firma aparece **"¿Usar la misma firma de tu Autodiagnóstico?"** con la vista previa de esa firma y el botón **"Usar esta firma"**. Es opcional: puede seguir dibujando o escribiendo otra, y si no existe firma que reutilizar no aparece nada.

- **Dónde aparece:** Plan de Evaluación, Encuesta de Satisfacción, Evidencias y el paso "Firma" del propio Autodiagnóstico. En ese paso la fuente es la firma del **Acuerdo de Confidencialidad**, que se firma antes (orden de `STEPS`: `personal` → `nda` → reactivos → `firma`). En las demás páginas la fuente es la firma principal del Autodiagnóstico o, si todavía no existe, la del Acuerdo.
- **Dónde NO aparece, a propósito:** `documentos-sesion.html`. Sus 3 recuadros (`usuarioFicha`, `usuarioConsentimiento`, `usuarioSeguimiento`) son del **usuario/paciente**; ofrecer ahí la firma del candidato permitiría firmar como otra persona en documentos que van a la SEP. La firma del candidato en esos PDFs ya se toma sola del Autodiagnóstico (`loadAutodiagnosticoResult()`).
- **Qué copia:** un duplicado de `mode` + `dataUrl` (dibujada) o `typedName` (escrita) al estado propio de la página, que lo guarda como si el candidato hubiera firmado ahí. No es un vínculo vivo: cambiar después la firma del Autodiagnóstico no altera documentos ya firmados.
- **De dónde la lee:** primero `localStorage['autodiagnosticoData']`; si ese dispositivo nunca abrió el Autodiagnóstico, la fila de Supabase vía `FlowStatus.getRow()` (que también cubre la cuenta demo).
- **Seguridad:** una firma "dibujada" solo cuenta si es `data:image/…` y el nombre escrito se escapa en la vista previa (probado con `<b>` en el nombre: sale como texto).
- **Módulo compartido** porque la regla de qué firma cuenta y dónde vive no debe copiarse en cada página. Cada página solo agrega `<div id="usarFirmaAuto">`, la llamada a `FirmaCandidato.ofrecer(...)` tras renderizar y una función `usarFirmaAutodiagnostico(f)`. Está en el precache de `sw.js` (`paideia-app-v4`). Suite completa: `node --test tests/*.test.js` (46 desde el 17 sep).
- **Verificado en navegador:** firma dibujada en las 3 páginas (vista previa idéntica, lienzo con la firma, "✓ Completado", se guarda), firma escrita, paso "Firma" desde el Acuerdo, caso sin firma (no aparece nada) y móvil 375px (0px de desborde).
- ~~**⚠️ Al probar con la cuenta demo:** el guardado sí ocurre, pero el siguiente `render()` llama a `Auth.ensureAdminPlaceholderData()`, que ve el objeto guardado sin `_demo` y lo reemplaza con los datos ficticios.~~ — **resuelto el mismo 17 sep** en `auth.js`, sin tocar páginas: ver "Datos demo: lo editado se conserva" en Autenticación y gates. Verificado: "Usar esta firma" y una firma dibujada en el Plan de Evaluación sobreviven a render y recarga con la cuenta demo.

---

## Ensamblado del expediente final (fuera del sitio — script de Diego/equipo)

`_internal_no_publicar/01-scripts/assemble_expediente.py` (nunca en el repo público, maneja datos personales reales):
```bash
cd _internal_no_publicar/01-scripts
pip3 install -r requirements.txt      # primera vez
cp .env.example .env                  # primera vez, y llenar con los valores reales (ver abajo)
python3 assemble_expediente.py "Nombre Completo Del Candidato" ["liga al video, opcional"]
```
**Migrado 15 sep de Google Forms/Drive a Supabase + Nextcloud** (resuelve el backlog #8 que existía) — ya NO depende de que nadie suba nada a mano a un Google Form aparte. Busca al candidato en `candidatos_ec1375` (Supabase REST, con `SUPABASE_SERVICE_ROLE_KEY` para poder leer cualquier fila, no solo la propia como permite RLS con la anon key), lee `documentosNextcloud` de cada columna `*_data` (jsonb) — la misma ruta exacta que cada página del sitio ya guardó ahí al subir el PDF a Nextcloud — y descarga cada archivo directo del WebDAV (mismo esquema de carpetas/auth que `api/subir-portafolio.js`, ver esa función para el detalle). La liga al video se toma de `evidencias_data.planData.videoLink` si no se pasa como argumento. Con esto, el único requisito real para generar el expediente de un candidato es que haya completado el flujo normal del sitio — no hay ningún paso manual de carga aparte.

Variables de entorno requeridas (mismas que ya están en Vercel, copiarlas de ahí a `.env`, nunca comitear): `SUPABASE_SERVICE_ROLE_KEY`, `NEXTCLOUD_URL`, `NEXTCLOUD_USERNAME`, `NEXTCLOUD_APP_PASSWORD`, `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET` — ver `.env.example`. Ya no usa `token.json` ni las credenciales de Google (esas siguen ahí y siguen sirviendo para los demás scripts de exploración del Form viejo — `explore_forms_api.py`, `check_drive_files_detail.py`, etc. — pero `assemble_expediente.py` ya no las toca).

Genera con `reportlab` portada/índice/separadores/Cédula en blanco (validados 15 sep contra el expediente real de Humberto — ver sección "Validación de formato" arriba), inserta la plantilla del IEC (83 págs., `_internal_no_publicar/01-scripts/plantilla_IEC_blanco.pdf`), y fusiona todo con `pypdf` en el orden verificado contra un expediente real (Portada → Índice → Datos del Candidato/CURP/INE/Autodiagnóstico → Recopilación de Evidencias/Plan de Evaluación/IEC/Ficha-Carta-Plan de Sesión-Plan de Seguimiento del paciente/video → Cierre/Cédula/Encuesta → Anexos/Acuses). Si falta cualquier documento (o quedó marcado como enviado por la ruta alterna de `evidencias.html` en vez de subido de verdad a Nextcloud), **no falla** — genera el expediente igual y lo lista en rojo en el propio Índice, distinguiendo "no lo subió" de "lo mandó por el formulario alterno, revisar a mano". Verificado end-to-end con datos simulados (fila de Supabase + rutas de Nextcloud de prueba): las 12 categorías de documento, el orden final y los 2 tipos de aviso funcionan correctamente — no se ha corrido todavía contra un candidato real desde la migración.

**✅ Resuelto 16 sep — la plantilla del IEC ya está limpia.** El hallazgo del 15 sep era cierto, pero con un matiz importante: los datos de Humberto **no se veían** al abrir o imprimir el PDF, pero **sí estaban dentro del archivo**, escritos en el contenido de las 83 páginas — no eran campos de formulario (el archivo no tiene AcroForm). Se podían seleccionar, copiar, encontrar con Ctrl+F y extraer con cualquier herramienta, así que cualquier expediente generado llevaba el nombre de otra persona en su capa de texto. El archivo lo había armado `pypdf` extrayendo páginas del portafolio real de Humberto.
- **Qué se quitó**, exactamente 5 cadenas: su nombre y el de su evaluadora en el pie "Rubrica" de las 83 páginas; esos mismos nombres pegados a sus etiquetas en la página 1 (se conservó la etiqueta "NOMBRE DEL CANDIDATO:", solo se quitó el nombre); y la fecha de aplicación "agosto 23 2025". También una anotación olvidada en la página 1 que dibujaba la palabra "texto". **No había marcas de juicio del evaluador**: las columnas de cumplimiento y las "Respuesta Elegida" ya se renderizaban vacías.
- **Verificación:** texto extraído con 0 coincidencias de cualquier nombre o de la fecha, conservando las etiquetas ("Rubrica" ×166 = 83×2). **82 de 83 páginas idénticas píxel por píxel** al original; la única diferencia, en la página 1, cae exactamente en el rectángulo de la anotación "texto". O sea: todo lo personal que se quitó era invisible y el instrumento visible no cambió. Prueba de fusión igual a la del script: 1 + 83 + 1 = 85 páginas, sin datos personales (aislado el PDF pesa 4 MB, fusionado 1.3 MB).
- **No hizo falta tocar código**: `assemble_expediente.py` busca `plantilla_IEC_blanco.pdf` por nombre (línea 65). El original quedó respaldado como `plantilla_IEC_ORIGINAL_con_datos_de_Humberto_NO_USAR.pdf` en la misma carpeta (gitignored). `FORMATO PORTAFOLIO-1375-2026 copia.pdf` sigue sin servir como fuente del IEC: su sección son solo 2 páginas separadoras.

**15 sep — segunda ronda de validación contra `FORMATO PORTAFOLIO-1375-2026 copia.pdf`, y decisión final:** Diego señaló este archivo (blanco, con marcador de página por cada documento) como posiblemente más autoritativo que el expediente real de Humberto — el nombre sugiere que es el formato vigente 2026, mientras que el de Humberto es una entrega real de agosto 2025. Se probó agregar de ahí a `draw_portada()`/`draw_cedula_evaluacion_blanco()` los renglones "Fecha:"/"Lote:", el campo "Incidencias:" y un bloque de acuse al final de la Cédula, y mover el "Acuse de Recibido - Tríptico" a la sección 1 del índice (esta plantilla no lista "4. Anexos" como ítem, aunque la página separadora sí existe más adelante en el mismo archivo). **Decisión de Diego: quedarse con el formato de Humberto** — "ya lo entregó y se lo aceptaron" (evidencia real de que ese formato funciona, contra una plantilla cuya vigencia/aceptación no está confirmada). Se revirtieron los 4 cambios de esta ronda: Portada y Cédula quedaron exactamente como se validaron el 15 sep temprano (contra el expediente real de Humberto — ver párrafo de arriba), y el índice/orden de `ordered_files` no se tocaron (el Tríptico sigue en 4. Anexos). `FORMATO PORTAFOLIO-1375-2026 copia.pdf` queda descartado como fuente para futuras validaciones de este script — usar siempre `PORTAFOLIO HUMBERTO LOT 1375  .pdf` como única fuente de verdad.

**Puntos abiertos sin confirmar con Diego:**
- "Foto para el diploma" y "Certificados de formación" no se incluyen hoy en el PDF final ensamblado (sí se suben a Nextcloud, solo no se agregan al merge) — ubicación exacta en el expediente oficial sin confirmar.
- ~~Posible documento faltante: "Encuesta de Satisfacción..." corta podría ser distinta de la ya construida~~ — resuelto 14 sep: el formato oficial (RED CONOCER/ICEMéxico, verificado contra el expediente de Humberto) es la encuesta de 7 preguntas con escala de 4 caritas, ya implementada. No hay una encuesta corta separada.
- Cédula de Evaluación y el IEC los llena el evaluador después de revisar el video — el script los inserta en blanco (el IEC genuinamente en blanco desde el 16 sep, ver arriba); falta un flujo para que el evaluador los llene digitalmente (ver backlog #7).

---

## Validación de formato contra el expediente real de Humberto

Diego pidió (14 sep) que cada documento que el sitio genera haga match al 100% con las mismas tablas/formato que la SEP ya aprobó — verificado contra `PORTAFOLIO HUMBERTO LOT 1375  .pdf` en `_internal_no_publicar/03-documentos-referencia/` (expediente real, confidencial). Esta tabla es la fuente de verdad de qué ya se comparó **página por página** contra ese expediente y qué falta — **actualizar esta sección en cuanto se termine de validar/corregir cada documento, antes de pasar al siguiente, para no repetir la investigación.**

| Documento | Estado | Notas |
|---|---|---|
| Encuesta de Satisfacción | ✅ Validado 14 sep | Formato de caritas verbatim contra el expediente (ver sección "Cambios recientes"). |
| Ficha de Registro RENAP | ✅ Validado 14 sep | Texto legal RENAP y layout construidos contra el expediente desde el inicio. |
| Plan de Evaluación | ✅ Validado 14 sep | Comparado imagen por imagen contra las 12 páginas reales (pp. 23-34): las 29 filas numeradas, encabezado, tabla Resultado del Diagnóstico, Requerimientos, las dos tablas de Acuerdo (con Horario separado), Nota, lista de 4 puntos, y el 97.64 real del Primer criterio. |
| Autodiagnóstico | ✅ Validado 14 sep | Comparado imagen por imagen contra las 12 páginas reales (pp. 9-21 del expediente). Los conteos de la Valoración por Elemento (6/13/3/2, 40/12/5/3, 19/13, 16/10) coinciden exactamente con el documento real — confirma que `AUTODIAGNOSTICO_DATA` (142 reactivos) es correcto. Se corrigieron banners de categoría faltantes, numeración 1./2./3. por reactivo, la sección "Perfil recomendado" que faltaba por completo, el banner negro de "IMPORTANTE", el boxing de la fila Firma en Datos Personales, formato de fecha DD-MM-YYYY, y la etiqueta de Actitudes en Valoración. |
| Documentos de Sesión — Ficha de Registro | ✅ Validado 14 sep | Fuente de verdad: fila 14 (PRODUCTOS, Elemento 2) del Plan de Evaluación (las páginas sueltas de este documento específico con datos reales del paciente no se lograron ubicar en las 146 del expediente de referencia). Folio (reusa `expedienteNo`) y nueva sección "Información médica adicional" — médico tratante/profesional de la salud, información toxicológica, resumen de resultados de laboratorio y gabinete — agregados tanto al wizard (paso "Ficha de Registro") como al PDF. Verificado con Playwright: los 3 campos se capturan, persisten en `sessionData`/localStorage, y aparecen en el PDF generado. |
| Documentos de Sesión — Carta de Consentimiento | ✅ Validado 14 sep | Fuente de verdad: fila 24 (PRODUCTOS, Elemento 3) del Plan de Evaluación. Edad/Fecha de nacimiento/Domicilio/Familiar a avisar + Aviso de Privacidad (ya validado antes) más una nueva tabla "Condiciones del servicio" con zonas del cuerpo a abordar, vestimenta recomendada, reacciones/sensaciones posibles, limitantes de aplicación del servicio (campos nuevos, agregados al paso "Explicación de la Terapia" y al paso "Consentimiento" del wizard) y condiciones de preparación/número de sesiones y duración/objetivos y efectos generales (ya se capturaban en el paso Plan de Sesión, ahora también se muestran aquí, que es donde el original los pide). |
| Documentos de Sesión — Plan de Sesión | ✅ Validado 14 sep | Fuente de verdad: fila 29 (PRODUCTOS, Elemento 4) del Plan de Evaluación. `generatePlanSesionPDF()` reescrito de fondo: el contenido anterior (condiciones de preparación/No. de sesiones/objetivos) en realidad pertenecía a Consentimiento/Plan de Seguimiento, no aquí — se removió de este documento (sigue capturándose en el wizard y ahora se muestra en Consentimiento). El documento ahora integra: nota de que se enlaza con Plan de Seguimiento, sesión No. 1 con fecha y hora de inicio/término (campos nuevos), signos vitales ya capturados, técnica aplicada, notas de evolución y pronóstico, y recomendaciones/tareas para casa. |
| Documentos de Sesión — Plan de Seguimiento | ✅ Parece alineado, sin cambios de contenido | Fuente de verdad: fila 28 (PRODUCTOS, Elemento 4). `generatePlanSeguimientoPDF()` no cambió de contenido (fechas/horarios, medio de contacto, sesiones programadas, nota de evolución/pronóstico/recomendaciones siguen aquí, ahora también duplicadas en Plan de Sesión por sesión) — solo se corrigió el formato de fecha a DD-MM-YYYY. No se comparó imagen por imagen contra un original real (no localizado), pero el contenido ya cubre razonablemente los puntos de esa fila. |
| Cédula de Evaluación / IEC | N/A — no los genera el sitio | Los llena el evaluador a mano después de revisar el video; el sitio/script solo inserta la plantilla oficial en blanco (`plantilla_IEC_blanco.pdf`, 83 págs.). Vale la pena confirmar en algún momento que esa plantilla sigue siendo la vigente, pero no es una tabla que el sitio "arme" con datos del candidato. |
| Acuse de Recibido — Tríptico (`autodiagnostico.html`, `generateAcuseTripticoPDFBlob`) | ✅ Validado 15 sep | Comparado contra la página real 140. Le faltaban los renglones "Evaluadora:" y "Centro de Evaluación:" en la tabla de encabezado (ambos en blanco, mismo patrón ya usado en Plan de Evaluación/Cédula) — agregados. Título, texto del acuso y bloque de firma ya coincidían. Verificado con Playwright (sesión bypass): genera sin errores/warnings, texto extraído coincide línea por línea con el original. |
| Acuse de Recibido — Plan de Evaluación (`plan-evaluacion.html`, `generateAcusePlanEvaluacionPDFBlob`) | ✅ Validado 15 sep | Mismo hallazgo y mismo fix que el de arriba (comparado contra la página real 142) — le faltaban "Evaluadora:"/"Centro de Evaluación:", agregados. Verificado igual con Playwright. |
| Ensamblado del expediente (`assemble_expediente.py`) — portada/índice/separadores/Cédula en blanco | ✅ Validado 15 sep | Comparado directamente contra el expediente real de Humberto (pp. 1, 4-5, 22, 134-135, 139). Encontrado y corregido: `draw_portada()` no tenía el renglón "Evaluadora:" (existe en el real, en blanco para llenarse a mano); `draw_indice()` omitía por completo la sección "4. Anexos" del texto del índice aunque el PDF sí incluye ese separador + los acuses; `draw_cedula_evaluacion_blanco()` le faltaban el renglón de JUICIO ("_____ (COMPETENTE / NO COMPETENTE)"), las 2 notas legales de ratificación/pago, el campo "Observaciones" y la nota de pie de página — y tenía un bug real donde el texto de continuación del Estándar de Competencia (2 líneas) nunca se dibujaba porque el loop solo dibujaba `value` cuando `label` no estaba vacío. Títulos de separadores ajustados para calzar exacto ("1. Datos del Candidato/a", "3. Cierre de Evaluación" sin "la", "4. ANEXOS" en mayúsculas). Verificado generando cada página con reportlab de forma aislada (sin necesitar Google Forms/Drive) y comparando visualmente — todo cabe en una sola página cada uno, sin overflow. Este script vive en `_internal_no_publicar/` (gitignored) — los cambios no se ven en git, solo en el archivo local. |

**Con esto, todos los documentos que el sitio genera Y que forman parte del expediente oficial (están en `ordered_files` de `assemble_expediente.py`) están validados contra el expediente real de Humberto — no queda ningún documento pendiente en ese sentido.** Documentos generados por el sitio que **no** se comparan contra el formato oficial porque no son parte del expediente CONOCER (confirmado revisando `ordered_files`, no están ahí):
- Acuerdo de Confidencialidad / NDA (`autodiagnostico.html`, `generateAcuseNdaPDFBlob`) — documento interno de Paideia Tech (protege el contenido del Cuestionario/IEC), no existe un equivalente en el expediente de Humberto.
- PDF del Examen de Conocimientos (`examen-conocimientos.html`) — autoevaluación de práctica, nunca se sube al expediente oficial.
- Comprobante interno de `evidencias.html` (`generatePDF()`) — el propio PDF dice explícitamente "no forma parte de tu Portafolio de Evidencias final".

---

## Shell CRM del candidato (`crm-shell.js` / `crm-shell.css`)

Panel tipo CRM (referencia: dashboard de "Quiropráctica 360" que Diego compartió el 15 sep) que envuelve TODAS las páginas post-pago del candidato: sidebar fijo con logo, "Panel", los 10 pasos (✓ hecho / ▶ actual resaltado / 🔒 bloqueado con tooltip, badge amarillo con documentos pendientes del paso actual, barra dorada "estás aquí"), Recursos (Biblioteca, Guion Maestro), usuario (iniciales/nombre/correo), botón de tema y "Cerrar sesión". Encabezado sticky con hamburguesa (< 1024px, sidebar off-canvas con backdrop y Esc), título de la página, toggle ☀️/🌙 y chip de usuario.

- **Auto-montaje:** cada página del flujo carga `<script src="crm-shell.js" data-crm-page="<id del paso>">`; al `load`, si hay sesión, el módulo llama `FlowStatus.getSteps()` y monta el shell en CUALQUIER pantalla de esa página (gate de fase, wizard, resultado) — no depende de dónde la página llame a `mount()`. (Las llamadas explícitas `CrmShell.mount(...)` que quedaron donde antes iba `renderProgressBar` son inofensivas: `mount` es idempotente.) `panel.html` no usa `data-crm-page` (monta a mano tras el login, con `currentPageId: 'panel'`).
- `CrmShell.mount({ currentPageId, steps, mode, title, row, degraded })` — idempotente; mueve (sin clonar) todos los hijos del `<body>` salvo `<script>` dentro de `<main class="crm-main">`. Sin sesión no hay shell. Si `steps` viene vacío/`degraded`, pinta los pasos sin estado y un aviso "reintentar". Para la cuenta bypass agrega el botón "🔄 Reset demo" al sidebar.
- `mode: 'rail'` (`<script src="crm-shell.js" data-crm-mode="rail">`) en `ruta-estudio.html` y `ruta-alineacion.html`: rail fijo de 64px solo con iconos (botón para expandir), sin mover su DOM y SIN inyectar tokens de tema (sus tokens son propios — `--accent` ahí es azul). En móvil, botón flotante.
- `CrmShell.renderDashboard(container, data)` — solo `panel.html`.
- **Tema:** claro por default, toggle a oscuro, persistido en `localStorage['paideia-theme']`. Los tokens (`html[data-theme="light"|"dark"]`, los 9 compartidos + `--border`/`--surface-2`) se inyectan inline en `<head>` al parsear el script, antes del primer pintado (sin flash). Cada página del flujo define `--border`/`--surface-2` en su `:root` (valores oscuros) y ya no usa `rgba(255,255,255,x)` ni el gradiente del body. Fuera del tema: landing, quiz, retornos de pago, `restablecer-password`, contenido interno de `ruta-estudio`/`ruta-alineacion`, páginas admin. Los PDF no cambian (jsPDF dibuja sus colores; firmas en `#000`).
- Barras fijas inferiores existentes (`.nav-bar`, `.sticky-submit`, `.toast`) se desplazan 260px en desktop desde `crm-shell.css`, sin tocar cada página.
- Verificación: `node --test tests/*.test.js` (helpers puros) + navegador (ver plan). Spec: `docs/superpowers/specs/2026-09-15-crm-shell-candidato-design.md`. Plan: `docs/superpowers/plans/2026-09-15-crm-shell-candidato.md`.

**Proyectos siguientes acordados con Diego (15 sep), en orden:** (2) `protect.js` — disuasión de copia/captura: marca de agua con el correo, bloqueo de selección/copiar/clic derecho/imprimir, atajos de DevTools, difuminado al perder foco, headers anti-embed en Vercel (bloquear screenshots de verdad es imposible en web — acordado); (3) CRM del equipo `admin-crm.html` — lista de candidatos con paso actual/fase pagada/documentos faltantes, requiere RLS admin sobre `candidatos_ec1375` y dividir `FlowStatus.getSteps` en una función pura; (4) contenido al servidor — tabla `contenido_ec1375` con RLS por fase pagada + bucket privado para las imágenes de `ruta-estudio` (4.7MB de sus 5.4MB son base64), sin funciones nuevas de Vercel (ya hay 12).

---

## Modo claro/oscuro en Ruta de Estudio y Ruta de Alineación (16 sep)

> **Histórico (17 sep):** `ruta-estudio.html` y `ruta-alineacion.html` ya son redirecciones; el visor unificado `estudio.html` usa el mismo botón de tema (`VisorDiap.enlazarBotonTema`, llave `paideia-theme`) con los tokens de `visor-diapositivas.css`. Lo de abajo explica por qué los `--navy-*` no cambian entre temas.

Diego pidió **invertir la decisión del 15 sep** ("esas páginas siempre son oscuras"). `ruta-estudio.html` (Biblioteca/Reforzamiento/Práctica) y `ruta-alineacion.html` tienen ahora su PROPIO toggle ☀️/🌙 en el topbar (`#btn-theme`), porque `crm-shell.js` sigue sin tocar `data-theme` en modo rail (ver "Shell CRM del candidato" arriba): el shell y estas dos páginas manejan el tema por separado, pero comparten la MISMA llave `localStorage['paideia-theme']`, así que la elección del candidato viaja entre el panel y la Biblioteca.

- **El punto de partida era distinto en cada archivo.** `ruta-estudio.html` nacía oscuro duro: su `:root` base YA traía los valores oscuros y los bloques `[data-theme="dark"]`/`prefers-color-scheme` repetían esos mismos valores a propósito — le faltaba por completo el bloque `:root[data-theme="light"]`, que es lo que se agregó. `ruta-alineacion.html` es al revés: su `:root` base siempre fue claro y el oscuro vive en `[data-theme="dark"]` + `prefers-color-scheme`, así que solo necesitó el toggle. Por eso **el default no cambió en ninguna de las dos**: Estudio sigue abriendo en oscuro y Alineación sigue al tema del sistema, hasta que el candidato toca el botón (el `<script>` anti-flash del `<head>` aplica la preferencia guardada antes del primer pintado).
- **Los tokens `--navy-*` NO cambian entre temas, a propósito:** los componentes con texto blanco fijo (`.videoslide`, `.cover`, `.divider`, `table.t th`, badges `.mk-*`, `.media`) pintan su PROPIO fondo navy, así que siguen legibles en claro. Verificado con una auditoría de luminancia sobre las 121 diapositivas: **0 casos** de texto claro sobre fondo claro.
- **Ojo con `--cyan`/`--cyan-dk` en `ruta-estudio.html`:** pese al nombre, ahí son el DORADO de marca (`#FFD700`/`#C9A227` en oscuro) y se usan como color de TEXTO en 10 lugares — en claro valen `#B8860B`/`#8A6508`, **no** el teal que `ruta-alineacion.html` usa con esos mismos nombres.
- **Dos bugs previos que salieron al probar y quedaron corregidos:** (a) `crm-shell.css` ponía `body.crm-active{background:var(--dark)}`, pero estas dos páginas no definen `--dark` → el `var()` quedaba inválido y el body transparente, con el canvas **blanco** detrás del contenido oscuro; ahora esa regla excluye el modo rail (`body.crm-active:not(.crm-rail)`) y cada página pinta su fondo con su propio `--page`. (b) El topbar no cabía en una línea entre ~900px y ~1500px (en modo boot se le inyectan "Volver" y "Ruta de Alineación completa (con video)") y, como `.tb-actions` no encoge, empujaba scroll horizontal a TODA la página (medido: 1426px de contenido en 1185px de viewport, ya desbordaba 120px antes de agregar el botón de tema) — ahora envuelve antes de desbordar.
- **Si se regeneran estas páginas desde el pipeline externo** hay que volver a aplicar, además de lo ya documentado (Módulo 7, ligas de compra, scripts de shell/protect/contenido): el `<script>` anti-flash del `<head>`, el bloque `:root[data-theme="light"]`, el botón `#btn-theme` del topbar con sus funciones de tema, el grupo "MÓDULO 7" del índice de la Biblioteca y los ajustes responsivos del topbar.

**⚠️ Al probar cambios de CSS/JS en local:** (histórico — desde el 16 sep `sw.js` va red primero para JS/CSS, así que esto ya no debería pasar; si pasa, revisar que el SW activo sea `paideia-app-v3` o posterior) el Service Worker de la PWA cachea la app agresivamente y sirve copias viejas **aunque** se use `Network.setCacheDisabled`, `fetch(..., {cache:'no-store'})` o `Network.setBypassServiceWorker` — más de una vez pareció que un arreglo "no funcionaba" cuando el navegador nunca había visto el archivo nuevo. Lo que sí funciona: `page.route('**/sw.js', r => r.abort())` + `unregister()` + `caches.delete()`, o un `?cb=<random>` en la URL de la página.

---

## CRM del equipo (área admin)

Mismo shell CRM que el candidato, en modo admin (`<script src="crm-shell.js" data-crm-mode="admin" data-crm-page="admin-xxx">`): sidebar con Panel del equipo, Candidatos, Precios y pagos, Sesiones, KPIs, Utilidades y "Ver como candidato"; se monta solo si la sesión es de un correo en `admins` (`Auth.isAdmin`). `Auth.renderAdminGate()` entra directo si ya hay sesión admin y tiene la casilla "Mantener mi sesión iniciada". Las 4 páginas admin previas conservan su lógica; solo ganaron shell, tema claro/oscuro y tokens `--border`/`--surface-2`.

- **`admin-crm.html`** — home. Cifras y tarjetas calculadas por `admin-data.js`. Muestra avisos si falta correr SQL o si la API de sesiones no responde (local).
- **`admin-candidatos.html`** — paso real de cada candidato con `FlowStatus.computeSteps({ row, alineacionAuth, entregaAuth, esBypass })` (función pura extraída de `getSteps()`, la MISMA lógica que ve el candidato) sobre la fila que regresa el RPC `admin_lista_candidatos()`; documentos con `CrmShell._helpers`. Candidato en `candidatos_precio` sin fila en `candidatos_ec1375` = "Sin iniciar".
- **Utilidades pagadas** — `admin-utilidades.html` inserta/borra en `utilidades_pagos`; `AdminData.utilidades(datos, lote)` calcula a repartir / pagado / pendiente por socio con la misma fórmula que `calcularReparto`.
- Spec: `docs/superpowers/specs/2026-09-15-admin-crm-design.md`. Pruebas: `node --test tests/*.test.js` (18).

**✅ Los dos SQL de esta sección ya están aplicados** (verificado 16 sep contra la API REST):
- `2026-09-15-admin-lista-candidatos.sql` — el RPC `admin_lista_candidatos()` existe y responde (devuelve `[]` con la service role key porque su JWT no trae correo, así que el `is_admin()` interno da false; desde el navegador con sesión admin sí regresa filas). También existen ya las columnas `examen_conocimientos_data` y `ruta_estudio_data`.
- `2026-09-15-utilidades-pagos.sql` — la tabla `utilidades_pagos` responde 200.

---

## Contenido al servidor (proyecto 4)

El contenido valioso ya no debe viajar en el HTML: Ruta de estudio (datos, media, 121 diapositivas, 19 imágenes), Ruta de Alineación (57 diapositivas, 2 imágenes — ahora exige sesión con Alineación pagada; admins/bypass exentos), 39 reactivos del examen, guion maestro y 142 reactivos del autodiagnóstico viven en Supabase y se piden con sesión desde `contenido.js`. Las páginas conservan una **ruta de respaldo**: mientras su bloque inline exista, lo usan (transición sin corte); tras `publicar_contenido.py shell` quedan como cascarones (5.4 MB → 281 KB en `ruta-estudio`). El NAS (Nextcloud) recibe la **copia maestra** del paquete en `Contenido/<versión>/`; no sirve contenido a candidatos (solo es alcanzable servidor a servidor). Spec: `docs/superpowers/specs/2026-09-15-contenido-servidor-design.md`.

**Estado (16 sep, 9:45): ✅ COMPLETO Y EN PRODUCCIÓN.** SQL corrido, `publicar` ejecutado (8 bloques en `contenido_ec1375` + 21 imágenes en `contenido-imagenes`, versión `20260915-1810-ab603c0`, copia maestra en Nextcloud `Contenido/20260915-1810-ab603c0/`), verificado en producción con sesión real (121 y 57 diapositivas con imágenes firmadas, 39 reactivos, 19 secciones del guion, autodiagnóstico; anon sin sesión recibe `[]`), y `shell` aplicado: las 5 páginas ya NO llevan el bloque inline (`ruta-estudio` 5.4 MB → 287 KB, `ruta-alineacion` 711 KB → 85 KB, `guion-maestro` 42 KB → 23 KB). Sin sesión válida para la fase, las páginas muestran el error de `Contenido.errorHtml()` en vez del contenido.

**16 sep (tarde) — primera republicación de contenido ya editado, versión `20260916-1900-a3a3e9c`.** Se corrigieron dos textos de SVG que se cortaban contra el borde de su `viewBox`: en la diapositiva de RPBI/NOM-087 (`v3-24`) las dos etiquetas "Bolsa / recipiente hermético" (28 caracteres desde x=278, con la caja de fila terminando en 406) pasaron a "Bolsa/recipiente hermético" en x=274 — miden 123 unidades y cierran en 397; y en `v3-42` el descargo "Valor de referencia educativo. No constituye diagnóstico." se salía 8 unidades del viewBox de 420, y se le bajó a `font-size:9px` (no se podía recorrer a la izquierda: en la misma línea base está "SpO₂ 95 – 100 %" a 15px, y el texto es un descargo médico que no conviene acortar).

- **Cómo republicar contenido editado** (sin volver a `extraer`, que ya no sirve porque las páginas quedaron en cascarón): editar directo el JSON en `_internal_no_publicar/contenido/bloques/`, subir `version` en `paquete.json` (así la copia maestra del NAS no pisa la carpeta de la versión anterior) y correr `python3 publicar_contenido.py publicar`. Publica los 8 bloques por upsert, las 21 imágenes y la copia maestra en `Contenido/<versión>/`. No requiere deploy de Vercel: es dato, no código, así que el cambio se ve en producción de inmediato.
- **Para auditar cortes de texto en SVG usar `getBBox()`, NO `getComputedTextLength()`.** Con textos multilínea (`<tspan>`) el segundo devuelve la suma de todos los tramos y marca falsos positivos: en la primera pasada señaló 4 desbordes y 3 eran textos de varias líneas perfectamente bien puestos. `getBBox()` mide el trazado real.

**Credenciales del script:** viven en `_internal_no_publicar/01-scripts/.env` (gitignored). Las variables Sensitive de Vercel NO se pueden bajar con `vercel env pull` (deja `[SENSITIVE]`): se pegaron a mano la service role key de Supabase y las de Nextcloud/Cloudflare (documentos cifrados de Humberto `PAIDEIA_EC1375_nube_tokens.docx` / `PAIDEIA_EC1375_almacenamiento.docx`, en la raíz, ignorados por git). Si se regeneran `ruta-estudio`/`ruta-alineacion` desde el pipeline externo: volver a correr `todo` y re-aplicar los cambios manuales documentados (Módulo 7, ligas de compra, scripts del shell/protect/contenido, loader del final de `ruta-alineacion`). Para republicar contenido editado: `extraer` requiere las páginas CON bloque inline (restaurarlas con `git show <commit-anterior-al-shell>:<pagina>` o editar el paquete JSON en `_internal_no_publicar/contenido/` directamente y correr solo `publicar`).

**Realtime:** `admin-crm.html` escucha `candidatos_fase_pagos`, `inscripciones_alineacion` y `utilidades_pagos` (el mismo SQL las agrega a la publicación `supabase_realtime`).

---

## Visor de estudio unificado (`estudio.html`, 17 sep)

**Decisión de Diego:** "un solo visor de estudio" con la misma navegación guiada para todo, más lean y homologado; los formularios por pasos (Autodiagnóstico, Plan, Documentos, Encuesta, Evidencias) reciben la guía en una **segunda etapa, pendiente**. Spec: `docs/superpowers/specs/2026-09-17-visor-estudio-unificado-design.md`.

- **Modos:** `?modo=biblioteca` (133 pantallas, índice, búsqueda, "Para ti", `?crit=`), `alineacion` (57 pantallas; pasos = módulos M0–M7; "Terminé la ruta" lleva a la primera pendiente si faltan; vistas en `ec1375-alineacion-vistas`), `reforzamiento` (panel de temas → pantallas del tema → "Terminé este tema" → visto bueno), `practica` (20 temas: pregunta → fallo → "Repasar este tema" → pregunta de verificación distinta → acierto; formatos `mc`/`fill`/`col`; práctica voluntaria que no toca el estado) y `examen` (39 reactivos; al fallar se repasa el tema **dentro del visor** y se regresa a la misma pregunta lista para contestar; resultado con PDF, temas repasados y siguiente paso).
- **Misma navegación en todos:** guía superior (qué haces, "Paso X de 10 de tu proceso", pasos o barra de avance, instrucciones plegables), barra inferior fija con **una sola acción principal** (la que desbloquea el proceso: primero obligatorios, luego visto bueno, luego siguiente paso), pantallas "¡…completo!" con la siguiente acción, botón Ayuda (`?`), tras contestar la vista baja sola al resultado. Rail del shell con el paso correcto resaltado (`currentPageId` por modo).
- **Compuertas (sin cambios de fondo):** sesión (login regresa aquí vía `paideia-volver`); Reforzamiento/Práctica exigen Autodiagnóstico de 142 + NDA; Examen exige nombre del Autodiagnóstico; fases `registro` (Reforzamiento), `alineacion` (Biblioteca/Alineación), `evaluacion` (Práctica/Examen); admins y bypass exentos. Práctica además exige el visto bueno.
- **Datos (mismos contratos):** Reforzamiento/Práctica guardan el objeto V4.4 en `localStorage['ec1375-state']` + `ruta_estudio_data` (`guardarEstado()`); el Examen en `examenConocimientosData` + `examen_conocimientos_data` (`guardarExamen()`). `flow-status.js` sigue leyendo `diagnostic.approved`, `practice.completed` y `submitted`. El estado se siembra desde el Autodiagnóstico (fila o localStorage) si no existe.
- **Lógica portada (`estudio-logica.js`):** `normaliza/recalcula/avance`, brechas (orden por riesgo), obligatorios = NO en reactivo `critico`, visto bueno, rutas por criterio/objetivo, transiciones de práctica. **Paridad verificada** contra el motor original extraído: 3000 estados aleatorios con los datos reales (estado, brechas, visto bueno, pendientes, rutas de los 34 criterios y 600 transiciones de práctica) con 0 diferencias; un error inyectado hace fallar los 3000.
- **Bug corregido de paso:** la envoltura vieja precargaba la Alineación para la Práctica *antes* de cargar el contenido de Supabase (`EC1375_DATA` aún no existía), así que a un candidato sin ese estado la Práctica le quedaba bloqueada. Ahora `L.precargarAlineacion(S)` corre con los datos ya cargados.
- **No portado a propósito** (el flujo real no lo usaba): centro "Mi preparación", Evaluación 1/2 interna del motor, stepper de 5 pasos, matriz y herramientas. Sus campos se conservan al guardar.
- **Contenido:** sigue en Supabase; las diapositivas se cargan al primer recorrido (Examen/Práctica/Reforzamiento arrancan sin ellas). Ya **no hay HTML del pipeline que re-aplicar**: si se regenera contenido, solo se republican los bloques JSON (`publicar_contenido.py publicar`). Las fases `extraer`/`shell` del script quedan obsoletas.
- **Verificado:** local con sesión simulada y paquete real (Reforzamiento completo con visto bueno; Práctica 20/20 con repaso, verificación, columnas y voluntaria; Examen 39/39 con repaso y regreso, PDF generado; Alineación y Biblioteca; 375px sin desborde) y **en producción** con la cuenta bypass (los 5 modos, redirecciones `reforzamiento.html`, `practica.html`, `examen-conocimientos.html?reintentar=1`, `ruta-alineacion.html#vp-7`, `ruta-estudio.html?boot=library&crit=…`; 0 peticiones fallidas). Pruebas: 55.

---

## Biblioteca (`biblioteca.html`, 16 sep — backlog #18)

> **17 sep:** todo lo de esta sección vive ahora en `estudio.html?modo=biblioteca` (misma lógica y mismas llaves de localStorage); `biblioteca.html` es una redirección. Las menciones a `ruta-alineacion.html`/`ruta-estudio.html`/`examen-conocimientos.html` son históricas.

Visor propio de la Biblioteca, separado del motor `ruta-estudio.html`. **Decisiones de Diego:** alcance "solo visor" (Reforzamiento y Práctica NO cambian: siguen en el motor con sus mismas condiciones de hecho, `diagnostic.approved` y `practice.completed`) y acceso **desde Alineación pagada, como antes** (admins y cuenta bypass exentos). Diego pidió además simplificar lo duplicado sin perder lógica.

- **Qué muestra:** 133 pantallas = las 121 de `ruta-estudio:slides` + las 12 que SOLO existen en `ruta-alineacion:slides` (5 de introducción SEP/CONOCER/SCIAN y las 7 del Módulo 7 "Tu video práctico"), en 8 módulos con nombre (tomado de `ruta-alineacion:data`). `VisorDiap.catalogo()` las inserta en su lugar. Sin sesión → aviso; sin Alineación → aviso con liga a `alineacion.html`.
- **Índice lateral** (≥1100px columna fija; menos → cajón desde la derecha con botón "Índice"): búsqueda sin acentos en título, módulo, criterio, nombre del criterio, `#reactivo` **y el texto completo de cada diapositiva**; filtro por módulo; chips "Todo" / "Para ti"; ✓ en pantallas ya vistas y contador "X de 133 vistas" (`localStorage['ec1375-biblioteca-vistas']`, informativo, NO es gate ni se sincroniza; está en `Auth.DEMO_LOCAL_KEYS`).
- **"Para ti":** pantallas cuyo `rx` incluye un reactivo que el candidato marcó NO en el Autodiagnóstico (`Auth.REACTIVO_KEYS`, n = índice+1) o cuyo criterio corresponde a un tema que falló al primer intento en el Examen (`examen_conocimientos_data.firstAttemptCorrect` + `examen:reactivos`, que solo carga con fase Evaluación; sin ella, solo cuenta el Autodiagnóstico). Datos vía `FlowStatus.getRow()` (fila real o localStorage de la cuenta bypass). El marco muestra "Para ti" y los reactivos en NO van resaltados.
- **Desde el examen:** `examen-conocimientos.html` liga a `biblioteca.html?crit=E2·C4` (`VisorDiap.urlBiblioteca`); se muestra solo ese criterio (misma regla que `EC1375.routes.criterion`: route remedial/both) con aviso "Tema del examen" y botón "Ver todo"; "Volver" regresa al examen. `#sid` abre una pantalla y se sigue al navegar (también con `hashchange`).
- **Videos, quizzes, notas del presentador, presentación (P) y tema claro/oscuro** con las utilidades de `visor-diapositivas.js`; rail del shell con "Biblioteca" resaltada en Recursos (`currentPageId: 'biblioteca'`).
- **Simplificación hecha:** `ruta-alineacion.html` 85 KB → 24 KB (estilos a `visor-diapositivas.css`, sus funciones de videos/presentación/tema a `visor-diapositivas.js`, misma API `EC1375Alineacion` y mismos eventos); `ruta-estudio.html` perdió sus ramas de `boot=library` (gate, `crit`, "Volver al examen", liga a Alineación completa); `TEMA_A_CRITERIO` ya no está copiado en el examen; `Auth.REACTIVO_KEYS` expone la lista que ya existía en `auth.js` en vez de crear otra copia. El índice estático de la Biblioteca DENTRO del motor sigue ahí (es parte del HTML del pipeline y lo usan Reforzamiento/Práctica).
- **Si el pipeline regenera `ruta-alineacion.html`:** reemplazar `visor-diapositivas.css` con el `<style>` nuevo y dejar en la página solo el `<link>`; volver a cambiar sus funciones `montaMedios`/`pausaMedios`/`pres`/tema por las llamadas a `VisorDiap` (o dejar las copias del pipeline: también funcionan, solo duplican). `biblioteca.html` no depende del HTML de esas páginas, solo de los bloques publicados en Supabase.
- **Navegación guiada (17 sep, pedido de Diego: "extremadamente claro, con instrucciones y botones", sin tocar contenido):**
  - **Modo repaso** cuando se llega desde el examen (`?crit=`) o se elige "Para ti": tarjeta arriba de la diapositiva con el tema, pasos numerados clicables (✓ los vistos, "X de N vistas"), instrucciones plegables "Cómo repasar" (abiertas en la 1ª pantalla en móvil, siempre en escritorio) y "Ver toda la Biblioteca" para salir. La etiqueta superior cambia a "Modo repaso". En la última pantalla el botón se vuelve verde **"Terminé el repaso"** y abre **"¡Repaso completo!"** con "Volver a contestar el examen" / "Repasar otra vez" / "Explorar toda la Biblioteca" (en "Para ti": "Volver a mi panel").
  - **Barra inferior fija** con botones de 48px: Anterior · "Pantalla X de N" + "Sigue: <título de la siguiente>" · Siguiente pantalla. Al final de la lista completa: "Fin de la lista" deshabilitado y la pista de abrir el Índice.
  - **Ayuda** (botón en la barra superior y tecla `?`), abierta automáticamente la primera vez fuera del modo repaso (`localStorage['ec1375-biblioteca-guia']`). **"Retomaste donde te quedaste"** con "Ir al inicio" (`localStorage['ec1375-biblioteca-ultima']`, solo fuera del repaso). Ambas llaves están en `Auth.DEMO_LOCAL_KEYS`.
  - **Examen ↔ Biblioteca en la misma pestaña** (antes `target=_blank`, que dejaba dos pestañas del examen): el botón dice "Repasar este tema en la Biblioteca" con la nota de que el avance se guarda; "Volver al examen" y "Volver a contestar el examen" van a `examen-conocimientos.html?reintentar=1`, que borra la respuesta incorrecta de la pregunta actual para que aparezca lista para contestar (y limpia el parámetro). El botón del examen "Regresar a contestar" ahora dice "Contestar de nuevo sin repasar".
  - **Login con regreso:** si la Biblioteca se abre sin sesión guarda la URL en `sessionStorage['paideia-volver']`; `panel.html` (`handleVerified`) regresa ahí tras iniciar sesión (solo rutas del mismo sitio).
  - Móvil (≤760px): se ocultan contador, botón de presentación y el marco duplicado del tema en modo repaso; "Siguiente"/"Terminé" en versión corta. Verificado con una copia local que simulaba la sesión y leía el paquete real de contenido (escritorio 1440px y móvil 375px, 0px de desborde) **y en producción con la cuenta bypass** (repaso `?crit=E2·C4` de 4 pantallas → "Terminé el repaso" → "¡Repaso completo!" → examen con la respuesta incorrecta borrada y la pregunta lista; 0 peticiones fallidas; datos demo del examen restaurados).
- **Verificado en producción (16 sep, cuenta bypass):** 133 pantallas con las 19 imágenes firmadas, 0 peticiones fallidas; filtro `?crit=E2·C4` = las mismas 4 pantallas que el motor; búsqueda ("goniometro" → 2, "#61" → 6, sin resultados → aviso); Módulo 7; quiz; video con selector de 3 y pausa al cambiar de pantalla; tema claro; móvil 375px sin scroll horizontal con cajón sobre el botón flotante; "Para ti" simulando 2 reactivos en NO → 11 pantallas (datos demo restaurados); `ruta-alineacion.html` tras el refactor (videos + evento `media-play`, tema, índice, `#vp-7`); ligas del examen; redirect de `ruta-estudio.html?boot=library&crit=…#sid`. Pruebas: `node --test tests/*.test.js` (33).

---

## Cambios recientes (17 de septiembre, 2026)

- **Autodiagnóstico: "Continuar donde me quedé" ya reanuda.** Con datos personales y Acuerdo de Confidencialidad completos, el botón no hacía nada (`TypeError: … reading 'categorias'` en consola), y quien iniciaba sesión desde el gate de la propia página se quedaba en "Verifica tu correo". **Causa:** `resumeDiagnostico()` busca el primer paso incompleto con `isStepValid()`, y para `e1`…`e4` eso cuenta respuestas sobre `AUTODIAGNOSTICO_DATA`, que al volver a la página sigue vacío: desde el proyecto 4 los reactivos se piden a Supabase solo cuando `renderStep()` entra a un paso que los usa. **Arreglo:** esa carga pasó a `cargarReactivos()` (mismo spinner y mismo `Contenido.errorHtml` si falla), y `resumeDiagnostico()` la espera antes de validar el primer Elemento. Si faltan datos personales o el Acuerdo, ni siquiera se piden. La cuenta demo no pasa por aquí: va directo a Resultado. **Verificado con Playwright** (Supabase simulado, contenido real del paquete local, cuenta real): a medias sin reactivos → Elemento 1; Elemento 1 completo y Elemento 2 a medias → Elemento 2; 142 respondidos sin firma → Firma; todo completo → Resultado; sin foto → Datos personales (0 pedidos de contenido); sin sesión, entrando por el gate de la página → Elemento 1; contenido que no carga → aviso de `Contenido.errorHtml`. 0 errores de página. La versión anterior falla en los casos "a medias" y "gate de la página".
- **Datos demo: una cuenta real nunca los usa ni los sube** — ver ese punto en "Autenticación y gates".

---

## Cambios recientes (15 de septiembre, 2026)

- **Proyecto 4:** `contenido.js`, loaders en 5 páginas, `publicar_contenido.py`, PWA (`manifest.json`, `sw.js`, `icons/`, botón instalar), Realtime en el panel del equipo — ver sección "Contenido al servidor". Publicado y en cascarón el 16 sep.
- **UI lean (prioridades 1 y 3 de la crítica de diseño):** el shell usa un set de iconos SVG monocromos (`CrmShell.icon(nombre, tamaño)`, ~45 iconos estilo Feather) en vez de emojis; **encabezado único** — el `.top-bar` propio de cada página se oculta (`[data-crm-hidden]`) y su paso (`#topBarStep`/`#topBarProgress`) y avance (`#progressBarFill`/`#progressFill`) se reflejan en el encabezado del shell vía MutationObserver (`espejarTopBar`); esqueletos de carga (`CrmShell.skeleton('panel'|'table'|'cards')`); tokens claros con más contraste; controles tocables de 40px. `admin-candidatos.html`: columnas ordenables, exportar CSV, liberar/revocar fases desde el detalle (misma escritura que admin-precios) y **nota interna** por candidato (columna `candidatos_precio.nota_interna`, SQL `2026-09-15-nota-interna.sql` ✅ ya aplicado, verificado 16 sep). Pendientes de la crítica: wizards con avance/autosave visible + barra inferior móvil (prioridad 2), PWA y Realtime (junto con el proyecto 4).
- **`protect.js`** — disuasión de copia/captura en las 11 páginas del flujo (ver Estructura de archivos) + headers en `vercel.json` (`X-Frame-Options: DENY`, `Content-Security-Policy: frame-ancestors 'none'`, `X-Content-Type-Options`, `Referrer-Policy`) para que el sitio no pueda embeberse en otro dominio. Decisiones de Diego: sin difuminado al perder el foco (estorbaría en Documentos de Sesión durante el Zoom), cuenta bypass y admins exentos (videos), impresión permitida solo en el Guion Maestro. Lo que sigue para proteger de verdad el contenido es el proyecto 4 (contenido servido desde Supabase con RLS por fase pagada; ver Backlog).
- **CRM del equipo** — ver sección dedicada arriba: `admin-crm.html`, `admin-candidatos.html`, `admin-data.js`, utilidades pagadas, shell admin en todas las páginas admin, `admin-index.html` redirige. Los dos SQL ✅ ya están aplicados (verificado 16 sep).
- **Cuenta bypass en modo demo total:** datos ficticios precargados en las 6 páginas del flujo, cero candados, progreso desde localStorage (`FlowStatus.getRow()`), botón "Reiniciar demo" — ver "Bypass de navegación libre" en Autenticación y gates.
- **Sesión persistente:** el login entra directo si ya hay sesión guardada + casilla "Mantener mi sesión iniciada" (ver "Autenticación y gates"). Antes había que teclear la contraseña en cada visita.
- **`recuperar.html` → `panel.html`** (login + panel); `recuperar.html` queda como redirección. Barra fija de admin retirada (la sustituye el sidebar).
- **Shell CRM del candidato + panel de control** — ver sección dedicada arriba. `panel.html` (antes `recuperar.html`) reescrito como panel; `guion-maestro.html` y las 8 páginas del flujo montan el shell; `ruta-estudio`/`ruta-alineacion` en modo rail; tema claro/oscuro en las 10 páginas del flujo. `FlowStatus.renderProgressBar` eliminada.
- **Sesiones de Alineación: Google Meet → Zoom.** No tenemos membresía de Google Meet — el límite de 1h en llamadas grupales de la cuenta gratuita obligaba a agendar bloques de 2h como colchón para una sesión de 1h real. Se reemplazó Google Meet por Zoom en todo el flujo: `admin-sesiones.html` (label/placeholder/badge "✓ Zoom listo"), `api/crear-evento-google.js` (comentarios y campo `location`/descripción del evento), `api/inscribir-alineacion.js` (se quitó además el fallback muerto que intentaba leer un link de `conferenceData` — nunca aplicaba, porque el evento nunca se crea con conferenceData), `api/sesiones-alineacion.js`, `api/mis-inscripciones-alineacion.js`, `api/enviar-recordatorios.js`, `lib/send-email.js` (los 3 templates de email) y `sesiones-alineacion-component.js`. La creación del evento en Google Calendar y el envío automático de la invitación al calendario del candidato (`sendUpdates: 'all'`) **no cambiaron** — eso es una función de Calendar independiente de qué videollamada se use. Columna de Supabase renombrada de `google_meet_link` a `zoom_link` (ver "Sesiones de Alineación en vivo" arriba) — migración ✅ ya aplicada (verificado 16 sep).

**15 sep — noche, 6 reportes de Fernando por WhatsApp (captura de examen-conocimientos.html en el celular):**
1. ~~Práctica: al fallar la pregunta de VERIFICACIÓN (segundo intento del mismo tema), el motor solo ofrecía "Seguir con otro tema"/"Volver" — sin forma de repasar y reintentar de inmediato, dejando al candidato en el panel "Mi preparación" sin poder corregir.~~ — corregido: ahora también ofrece "Reforzar este tema", igual que el primer fallo; el ciclo falla→repasa→nueva pregunta se repite indefinido hasta acertar. Ver `ruta-estudio.html` `feedback()`, fase `'verificacion'`.
2. ~~Biblioteca sin modo claro ("formato de día")~~ — **resuelto 16 sep, invirtiendo la decisión del 15 sep** ("esas páginas siempre son oscuras"): Diego pidió explícitamente el modo claro. `ruta-estudio.html` y `ruta-alineacion.html` tienen ahora un toggle ☀️/🌙 propio en su topbar (botón `#btn-theme`), independiente del shell CRM — `crm-shell.js` sigue SIN tocar `data-theme` en modo rail, cada página se aplica el tema ella misma. Detalle en "Modo claro/oscuro en Ruta de Estudio y Ruta de Alineación" abajo.
3. ~~Biblioteca "le faltan completar" pantallas~~ — **resuelto 16 sep**. No había huecos: las 121 diapositivas de `META` tienen contenido real 1:1 (sin placeholders). Lo que faltaba era lo que Diego confirmó: las 7 pantallas del Módulo 7 de Alineación (`vp-1`…`vp-7`), que viven en `ruta-alineacion.html` y no en `META`. Se agregaron al Índice de la Biblioteca como grupo "MÓDULO 7 · Tu video práctico" (numeradas M7·1…M7·7 para no confundirlas con las 121), enlazando en pestaña nueva a `ruta-alineacion.html#vp-N` — esa página ya soportaba enlaces directos por `#sid`. **Ojo con el campo `sidIndiceBiblioteca`** del JSON de `ruta-alineacion.html`: pese al nombre, NO es un puntero a la Biblioteca ni lo lee nadie (0 usos en todo el repo, es residuo del pipeline externo) — no sirve como mecanismo de integración.
4. ~~Panel de admin: "Ver como candidato" no tenía forma de regresar al panel de administrador~~ — corregido: sidebar de candidato muestra "Volver al panel de administrador" cuando la sesión activa es de un correo admin (`crm-shell.js`, `mount()`).
5. ~~Scroll horizontal en móvil~~ — corregido: `.crm-main .container` sin `width:100%` desbordaba la página en CUALQUIER página con el shell en modo "full" (confirmado en plan-evaluacion.html y evidencias.html, ambas a 0px ahora); tabla "Criterios de tu Evaluación" envuelta en su propio `overflow-x:auto`; canvas de firma del NDA en autodiagnostico.html sin límite de ancho. **Verificado el 16 sep sobre las 29 páginas del sitio** (flujo del candidato, landing, retornos de pago, restablecer-password y los 7 paneles admin) a 375 y 414px: 0px de desborde en todas. `ruta-estudio.html` y `ruta-alineacion.html` además se midieron en 10 anchos de 375 a 1600px (ver "Modo claro/oscuro…" abajo: el topbar desbordaba entre ~900 y ~1500px). Las dos tablas de admin (`admin-candidatos.html`, `admin-precios.html`) se probaron **con filas inyectadas**, porque en local salen vacías (el RPC `admin_lista_candidatos()` sí existe, pero devuelve `[]` al llamarlo con la service role key porque su JWT no trae correo y el `is_admin()` interno da false) y una tabla vacía nunca desborda: ambas ya venían envueltas en contenedores con scroll propio (`.crm-table-wrap` / `.table-wrap`), así que la tabla scrollea sola sin arrastrar la página.
6. ~~"Panel de la segunda pantalla" en Práctica/Examen~~ — Práctica: resuelto vía el punto 1 (el ciclo repasa→pregunta ya no pasa por el panel salvo que el candidato elija "Volver" a propósito). Examen de Conocimientos: ya funcionaba bien desde el 15 sep temprano (botón "Regresar a contestar", Biblioteca en pestaña nueva) — no necesitó cambios.

**16 sep (tarde) — segunda tanda de Fernando:**
7. **Indicaciones oficiales para la foto** (`autodiagnostico.html`, `renderFotoCandidatoSection()`): arriba del selector de archivo va ahora la medida oficial (**25 mm × 30 mm**, tamaño infantil, a color, fondo blanco) y dos listas — correctas / incorrectas (sobreexpuesta, subexpuesta, demasiado cerca, demasiado lejos, adornos en la cabeza) — más la liga de WhatsApp para tramitar fotos instantáneas. En grid `auto-fit minmax(190px,1fr)` para que colapse a una columna en el celular; verificado a 390px con 0px de desborde.
8. **"No se ven bien las diapositivas"** — era un bug real de la plantilla, no una impresión: `.sfoot` (el pie con "IMAGEN SUGERIDA" + la fuente técnica) iba en `position:absolute` anclado al fondo, y `.pad/.pad-t` le reservaba `clamp(56px,7cqi,92px)`. Cuando el pie trae las dos cosas **no cabe** en ese hueco (medido: pie de 115px en 56px reservados) y, al estar fuera del flujo, **se encimaba sobre el contenido** — en la diapositiva de RPBI/NOM-087 la leyenda se imprimía sobre las filas "No anatómicos" y "Punzocortantes". Pasaba en móvil **y** en escritorio. Arreglo: el pie vuelve al flujo normal (`position:static`), así empuja en vez de encimar y, si el contenido crece, la diapositiva scrollea (`.slide` ya tenía `overflow-y:auto`). Verificado en 15 pantallas con pie: **0 choques**. **No tocar el `padding-bottom`**: se midieron 4 valores y entre MENOS padding MÁS scroll interno queda (el SVG se reescala a la caja) — con los 92px originales solo 5 de 15 pantallas scrollean 27px máx., contra 9 pantallas y 68px al reducirlo.
9. **"No se regresa" desde el examen** — quedaba pendiente de la primera tanda: el punto 1 arregló la Práctica (motor interno), pero la Biblioteca abierta DESDE el Examen de Conocimientos (`?boot=library&crit=…`, pestaña nueva) tenía el botón "← Volver" apuntando a `alineacion.html`, así que el candidato repasaba y no tenía camino de regreso a su pregunta. Ahora, cuando la URL trae `crit`, ese botón dice **"← Volver al examen"** y va a `examen-conocimientos.html` (que conserva sus respuestas en localStorage y retoma donde iba).
10. **Piso de legibilidad en móvil**: `.src`/`.imgsug` caían a 8px y `.kicker` a 9px, porque los `cqi` se calculan sobre un contenedor angosto. Se les puso un mínimo en `@media (max-width:700px)` (11px y 10.5px); escritorio y modo presentación no cambian.

## Cambios recientes (14 de septiembre, 2026)

- **Estadímetro:** liga de compra actualizada a un modelo distinto en `plan-evaluacion.html` y `ruta-alineacion.html`.
- **Examen de Conocimientos (`examen-conocimientos.html`), reescrito varias veces el mismo día — este es el estado final:** banco de **39 reactivos, 100% provenientes de `EC-1375-reactivos - actualizado.docx`** (se descartó por completo el banco anterior de 37 parafraseados de otra fuente; ver comentario en el código para el detalle de qué "relacionar columnas" del docx se omitieron y cuáles se reconstruyeron como opción múltiple). Las preguntas siguen el **orden del documento** (ya no se baraja el orden de las preguntas, solo el de las opciones de cada una — y solo entre las opciones que esa pregunta realmente tiene, corrigiendo un bug donde preguntas de 2-3 opciones mostraban casillas vacías clicables). Interfaz de **una pregunta por pantalla**: al responder, retroalimentación inmediata (correcto/incorrecto); si falla, se revela la respuesta correcta, un botón a la Biblioteca (pestaña nueva) y un botón "Regresar a contestar" — no avanza a la siguiente pregunta hasta acertar. Por diseño, todos terminan con el 100% de aciertos — **ya NO se muestra ningún resultado de Competente/No competente ni umbral alguno**: ese juicio es exclusivo del Centro Evaluador al calificar el Plan de Evaluación, las respuestas del examen y el resto del expediente. Sí se muestra, al final, la lista de temas que el candidato tuvo que repasar en el camino (informativo, no calificación).
- **Encuesta de Satisfacción (`encuesta-satisfaccion.html`):** rediseñada para replicar el formato OFICIAL de RED CONOCER/ICEMéxico (verificado contra el expediente de Humberto) — 7 preguntas (antes 8, una no era del formato oficial) con las 4 caritas de la escala siempre visibles por pregunta (Muy de acuerdo → Totalmente en desacuerdo, dibujadas a vector en el PDF) y una X sobre la opción elegida, en vez de una tabla de texto plano. Reduce el riesgo de que el formato choque con lo que la SEP espera ver en el expediente.
- **Ficha de Registro RENAP + foto del candidato:** nuevo documento oficial — ver sección dedicada arriba.
- **Autodiagnóstico:** PDF ampliado de un resumen de 6-7 páginas a las 11 páginas del formato oficial (portada, índice+presentación, datos personales, propósito/instrucciones, tablas de criterios existentes, Valoración con estadísticas reales calculadas).
- **Plan de Evaluación (`plan-evaluacion.html`):** agrega campos "Evaluadora:"/"Centro de Evaluación:" al encabezado del PDF y una sección "Criterios para obtener juicio de competente" (Primer/Segundo criterio, texto genérico sin inventar el 97.64% ahí) antes del bloque de firmas; firma del candidato movida a su columna correspondiente.
- **Progreso del candidato:** nuevo módulo compartido `flow-status.js` (ver sección dedicada arriba) — fuente única de los 10 pasos del flujo. `panel.html` se reescribió como dashboard completo de progreso además de login. Barra de progreso y CTA "Siguiente paso" conectados en `alineacion.html`, `documentos-sesion.html`, `plan-evaluacion.html`, `encuesta-satisfaccion.html`, `evidencias.html`, `entrega.html`, `examen-conocimientos.html` y `ruta-estudio.html` (que además ahora redirige a `panel.html` si se abre sin `?boot=`, en vez de mostrar el motor "pelón").
- **Admin:** nuevos paneles `admin-kpis.html` (KPIs gateado, reemplaza en uso a `kpi-dashboard-live.html` — ver backlog #13) y `admin-utilidades.html` (reparto de utilidades por lote entre socios — ver sección dedicada arriba).
- **`ruta-alineacion.html`:** botón real de "completado" en la última pantalla (antes no hacía nada).
- **Nextcloud:** ruta alterna por Google Form en `evidencias.html` cuando falla la subida automática, para no dejar al candidato bloqueado mientras se resuelve la configuración del NAS.
- **Bugs menores corregidos:** placeholder de datos del bypass en `auth.js` usaba claves de reactivo inexistentes; `entrega.html` tenía un atajo que dejaba pasar el gate de pago real para la cuenta de bypass (quitado — Entrega es dinero real, nunca debe poder simularse como pagada).
- **jspdf-autotable:** el modo por default `tableWidth:'auto'` reescala CUALQUIER tabla a los ~182mm de ancho de página aunque se den anchos de columna explícitos, produciendo advertencias de consola engañosas. Agregar `tableWidth:'wrap'` cuando se dan anchos de columna explícitos evita el problema — aplicado en todas las tablas nuevas de esta sesión.

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
NEXTCLOUD_URL, NEXTCLOUD_USERNAME, NEXTCLOUD_APP_PASSWORD,
CF_ACCESS_CLIENT_ID, CF_ACCESS_CLIENT_SECRET (Service Token de Cloudflare Access, ver sección Nextcloud)
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
⚠️ Las variables marcadas Sensitive NO se pueden leer con `vercel env pull` (escribe "[SENSITIVE]"); copiarlas a mano.
   Solo `development` y `production` existen como entornos; `--environment=production` para las reales.
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
6. ~~Página de estado del proceso para el candidato (en vez de preguntar por WhatsApp)~~ — resuelto: `panel.html` ahora es también un dashboard de progreso vía `flow-status.js` (ver esa sección arriba).
7. Flujo del evaluador: llenar digitalmente Cédula de Evaluación e IEC, automatizar "Resultado Evaluación" (competente/no competente) — hoy 100% manual por WhatsApp. Bloquea enlazar `entrega.html` automáticamente.
8. ~~Migrar `assemble_expediente.py` para leer del Nextcloud nuevo en vez de Google Forms/Drive.~~ — resuelto 15 sep, ver sección "Ensamblado del expediente final" arriba. La plantilla del IEC, que traía ocultos los datos de Humberto, quedó limpia y verificada el 16 sep (ver esa sección).
9. Logo SVG de mejor calidad (`assets/images/logo/paideia-tech-logo-*.svg`, inconcluso) — seguir con el PNG actual por ahora.
10. PPT de Alineación de mejor calidad, idealmente en Google Slides para embeber en vez de forzar descarga de ~17MB.
11. Videos del proceso pendientes (contexto SEP-CONOCER, capacitación, muestra de atención) — `alineacion.html` ya tiene los espacios (`VIDEO_CAPACITACION_URL`, `VIDEO_MUESTRA_URL`).
12. Portada de `ruta-estudio.html` y pantalla 1 de `ruta-alineacion.html` siguen diciendo "ACADEMIA POSTURALIA" — es texto incrustado en una fotografía (no editable por CSS/HTML), pendiente que Diego regenere la imagen.
13. `kpi-dashboard-live.html` sigue público (sin gate) y ya es redundante con `admin-kpis.html` (misma función, sí gateado) — lo más simple es retirar/redirigir la versión vieja en vez de agregarle un gate.
14. Replicar webhook de Mercado Pago en modo productivo.
16. ~~Contenido al servidor (proyecto 4)~~ — completo y en producción el 16 sep (ver sección "Contenido al servidor").
18. ~~**Biblioteca como presentación maestra independiente**~~ — **resuelto 16 sep** con alcance "solo visor" (decisión de Diego): ver sección "Biblioteca". Reforzamiento y Práctica siguen en el motor sin cambios. Texto original (15 sep): hoy `ruta-estudio.html` (motor generado por el pipeline) cumple tres funciones — Reforzamiento (`boot=remedial`: diapositivas de los reactivos marcados NO + visto bueno `diagnostic.approved`), Práctica (`boot=practice`: objetivos, `practice.completed`) y Biblioteca (`boot=library&crit=`: consulta por criterio, enlazada desde el examen). Con el contenido ya en Supabase es viable un visor propio y ligero (~300 líneas) de la Biblioteca con búsqueda, filtro por criterio y "recomendados para ti" (reactivos NO del autodiagnóstico), y redefinir Reforzamiento/Práctica como "vio las diapositivas recomendadas" — decisión de producto pendiente.
17. Refactorizar `admin-kpis`/`admin-utilidades`/`admin-precios` para usar `admin-data.js` (hoy conservan su copia local de las fórmulas); retirar `kpi-dashboard-live.html` (#13).
15. Calendario de citas en `plan-evaluacion.html` sigue en placeholder (`GOOGLE_CALENDAR_BOOKING_URL` vacío, fallback a WhatsApp) — el candidato pidió horarios fijos recurrentes, no un Calendly en tiempo real.

---

## Notas de seguridad

- `MASTER_LOGIN_PASSWORD` y `SUPABASE_SERVICE_ROLE_KEY` solo se usan server-side (`api/master-login.js`, `api/*-webhook.js`) — nunca en HTML/JS de cliente.
- El bypass de navegación (`CANDIDATE_FLOW_BYPASS_EMAIL`) se verifica siempre server-side vía RPC; el chequeo local (`isFlowBypassAdmin`) solo decide qué UI mostrar antes de que exista sesión, nunca otorga acceso por sí solo.
- `kpi-dashboard-live.html` no tiene gate — no compartir ese link; usar `admin-kpis.html` (gateado) en su lugar (backlog #13).

---

**Mantenedor:** Diego Garza (re-infinito@outlook.com) + Claude Code
