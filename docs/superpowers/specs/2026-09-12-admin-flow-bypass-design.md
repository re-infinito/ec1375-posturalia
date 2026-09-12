# Admin flow bypass — design spec

**Fecha:** 12 de septiembre, 2026
**Estado:** Aprobado por Diego, pendiente de implementación

## Contexto

`paideia.tech@outlook.com` es la cuenta administradora real del proyecto (dueña del
dashboard de Supabase, ya usada como admin de `admin-precios.html` vía la tabla
`admins`/`is_admin()`). Diego quiere poder entrar con esta cuenta y navegar
**todo** el flujo de candidato — Autodiagnóstico, Alineación, Plan de
Evaluación, Documentos de Sesión, Encuesta, Evidencias, Entrega — sin tener
que llenar/completar/pagar nada, para poder revisar cómo se ve cada pantalla.

Esta función es exclusiva de `paideia.tech@outlook.com`. **No** debe
extenderse a `de.minconsciente@outlook.com` ni a ningún otro correo de la
tabla `admins` (esa tabla sigue siendo solo para `admin-precios.html`/
`admin-index.html`, un concepto de permisos distinto).

## Estado actual del sistema de gates (mapeado 12 sep 2026)

Cada página del flujo (excepto `autodiagnostico.html`, que es el primer paso)
puede bloquear el acceso por hasta 4 razones distintas, evaluadas en este
orden:

1. **Dato previo local incompleto** — lee `localStorage.autodiagnosticoData`;
   si no existe o no está completo (`Object.keys(answers).length !== 142`),
   muestra pantalla de bloqueo → link a `autodiagnostico.html`.
2. **Sin sesión** — `await Auth.getSession()` es null → bloqueo → link a
   `recuperar.html`.
3. **(Solo `alineacion.html`) NDA no aceptado** — `result.ndaAccepted` falso →
   bloqueo → link a `autodiagnostico.html`.
4. **Documentos de la fase anterior no confirmados en Nextcloud (nuevo,
   12 sep)** — cada página llama `Auth.pullMyRow()`, lee el JSONB de la fase
   anterior, y corre una función local `documentosFaseCompletos(jsonbData,
   requiredKeys)` duplicada en cada archivo:

   | Página | JSONB que revisa | Keys requeridas |
   |---|---|---|
   | `alineacion.html` | `autodiagnostico_data.documentosNextcloud` | `autodiagnostico`, `acuseTriptico`, `acuseNda` |
   | `documentos-sesion.html` | `plan_evaluacion_data.documentosNextcloud` | `planEvaluacion`, `acusePlanEvaluacion` |
   | `encuesta-satisfaccion.html` | `documentos_sesion_data.documentosNextcloud` | `ficha`, `consentimiento`, `plan_sesion`, `plan_seguimiento` |
   | `evidencias.html` | `encuesta_data.documentosNextcloud` | `encuesta` |
   | `entrega.html` | `evidencias_data.documentosNextcloud` | `zoom`, `ine`, `curp`, `fotoDiploma` |

5. **(Solo `alineacion.html`, `documentos-sesion.html`, `entrega.html`) Fase
   no pagada** — `await Auth.isPhaseAuthorized(email, fase)` falso → pantalla
   de pago (Mercado Pago + transferencia).

Además, **antes de que exista cualquier sesión**, `Auth._handleSendOtp()`
(compartido por el paso `auth` de `autodiagnostico.html` y por
`recuperar.html`) corre `Auth.isEmailAuthorized(email)` — si el correo no
tiene la fase "registro" pagada, nunca se manda el código OTP.

## Diseño

### Un solo punto de verdad: `Auth.isFlowBypassAdmin(email)`

Nuevo en `auth.js`, independiente de la tabla `admins`/`is_admin()` existente:

```js
const CANDIDATE_FLOW_BYPASS_EMAIL = 'paideia.tech@outlook.com';

isFlowBypassAdmin(email) {
    return !!email && email.trim().toLowerCase() === CANDIDATE_FLOW_BYPASS_EMAIL;
}
```

Hardcodeado a propósito (no una tabla nueva): es una excepción de una sola
cuenta, sin necesidad de administrar una lista. No otorga ningún privilegio
de escritura real — ver "Nota de seguridad" abajo.

Se memoiza una vez por carga de página en `Auth._isBypassSession` mediante:

```js
async isBypassSession() {
    const session = await Auth.getSession();
    Auth._isBypassSession = !!session && Auth.isFlowBypassAdmin(session.user.email);
    return Auth._isBypassSession;
}
```

Cada página lo llama una vez, justo después de su `Auth.getSession()`
existente, y reutiliza `Auth._isBypassSession` en el resto de sus checks (sin
volver a llamarlo).

### Los 4 gates, con el bypass

1. **OTP-send** (`auth.js`, `_handleSendOtp`): 
   ```js
   const authorized = Auth.isFlowBypassAdmin(email) || await Auth.isEmailAuthorized(email);
   ```
2. **Dato previo local incompleto**: `Auth.ensureAdminPlaceholderData()` (nuevo,
   ver abajo) se llama al inicio del `render()`/bootstrap de cada página,
   antes de leer `autodiagnosticoData` — si no hay nada guardado y la sesión
   es de bypass, siembra el placeholder. El check existente no cambia.
3. **NDA no aceptado**: cubierto por el mismo placeholder (`ndaAccepted:
   true` incluido).
4. **Documentos Nextcloud no confirmados**: en cada uno de los 5 call-sites,
   ```js
   const registroCompleto = Auth._isBypassSession || documentosFaseCompletos(...);
   ```
5. **Fase no pagada**: en cada uno de los 3 call-sites,
   ```js
   const autorizado = Auth._isBypassSession || await Auth.isPhaseAuthorized(email, fase);
   ```

### Placeholder de Autodiagnóstico

Nuevo en `auth.js`:

```js
ADMIN_PLACEHOLDER_AUTODIAGNOSTICO() {
    const answers = {};
    for (let i = 0; i < 142; i++) answers[`admin_placeholder_${i}`] = 'SI';
    return {
        personalData: {
            nombre: 'Candidato de Prueba (Admin)', curp: 'XAXX010101HNEXXXA4',
            domicilio: 'N/A', escolaridad: 'N/A', telefonoCasa: '', telefonoCelular: '',
            email: CANDIDATE_FLOW_BYPASS_EMAIL, fecha: new Date().toISOString().slice(0, 10)
        },
        certificados: [], sinCertificadosPrevios: true, answers,
        signatureDataUrl: null, signatureTypedName: 'Candidato de Prueba (Admin)', signatureMode: 'typed',
        triptychAccepted: true,
        ndaAccepted: true, ndaSignedAt: new Date().toISOString(),
        ndaSignatureDataUrl: null, ndaSignatureTypedName: 'Candidato de Prueba (Admin)', ndaSignatureMode: 'typed',
        documentosNextcloud: {}
    };
},

ensureAdminPlaceholderData() {
    if (!localStorage.getItem('autodiagnosticoData')) {
        localStorage.setItem('autodiagnosticoData', JSON.stringify(Auth.ADMIN_PLACEHOLDER_AUTODIAGNOSTICO()));
    }
}
```

`answered === 142` vía 142 keys sintéticas (no replica el catálogo real de
142 reactivos — ninguna página del flujo posterior a Autodiagnóstico itera
`answers` por id específico, solo cuenta `Object.keys(...).length`, así que
no hace falta). El nombre "Candidato de Prueba (Admin)" es deliberadamente
obvio para que cualquier rastro (ej. si alguna vez se sube algo real a
Nextcloud) sea reconocible como dato de prueba.

`plan-evaluacion.html` y `evidencias.html`/otras páginas que también guardan
su propio estado (`planEvaluacionData`, etc.) **no** necesitan un placeholder
propio — no son leídas como prerequisito por ninguna página aguas abajo (solo
`autodiagnosticoData` y los JSONB de Supabase, ya cubiertos arriba).

### Barra de navegación de admin

Nuevo en `auth.js`:

```js
renderAdminBar() {
    if (document.getElementById('adminBypassBar')) return; // no duplicar
    const bar = document.createElement('div');
    bar.id = 'adminBypassBar';
    bar.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;background:#050a1a;border-bottom:2px solid #FFD700;padding:8px 12px;display:flex;gap:10px;flex-wrap:wrap;align-items:center;font-size:0.8rem;';
    bar.innerHTML = `
        <strong style="color:#FFD700;">🔧 Admin</strong>
        <a href="autodiagnostico.html" style="color:#0088FF;">Autodiagnóstico</a>
        <a href="alineacion.html" style="color:#0088FF;">Alineación</a>
        <a href="plan-evaluacion.html" style="color:#0088FF;">Plan Evaluación</a>
        <a href="documentos-sesion.html" style="color:#0088FF;">Doc. Sesión</a>
        <a href="encuesta-satisfaccion.html" style="color:#0088FF;">Encuesta</a>
        <a href="evidencias.html" style="color:#0088FF;">Evidencias</a>
        <a href="entrega.html" style="color:#0088FF;">Entrega</a>
        <a href="recuperar.html" style="color:#0088FF;">Login</a>
    `;
    document.body.prepend(bar);
    document.body.style.paddingTop = '40px';
}
```

Llamada por cada una de las 8 páginas del flujo justo después de confirmar
`Auth._isBypassSession === true`. Estilo simple e inline (consistente con que
estas páginas no comparten CSS), no necesita ser responsive elaborado — es
una herramienta interna.

### No persistir nada

`Auth.syncToSupabase`, al inicio del callback debounced:

```js
if (await Auth.isBypassSession()) return;
```

Como capa adicional (no solo la de arriba): `paideia.tech@outlook.com`
**no** se agrega a `candidatos_fase_pagos`, así que aunque el guard de arriba
fallara, la política RLS de `candidatos_ec1375` seguiría rechazando el
`insert`/`update` (exige `is_fase_authorized(email, 'registro')`, que sigue
siendo falso para esta cuenta a nivel de base de datos).

`Auth.uploadCertificado()` y las subidas a Nextcloud (`subirDocumento` /
`api/subir-portafolio.js`) **no** se bloquean — son infraestructura aparte de
`candidatos_ec1375`/`candidatos_fase_pagos` (Supabase Storage y Nextcloud
respectivamente) y no hay necesidad de complicar esas rutas: si el admin
llegara a disparar una subida real de prueba, cae bajo el nombre obviamente
ficticio `Candidato_de_Prueba_Admin_XAXX010101HNEXXXA4`, sin riesgo de
mezclarse con expedientes reales. Como el sync a Supabase está bloqueado,
el estado "✅ Subido" de esa subida no sobrevive un refresh — aceptable, no
es el caso de uso que se está diseñando.

## Archivos tocados

- **`auth.js`** — toda la lógica nueva: `CANDIDATE_FLOW_BYPASS_EMAIL`,
  `isFlowBypassAdmin()`, `isBypassSession()`, `ADMIN_PLACEHOLDER_AUTODIAGNOSTICO()`,
  `ensureAdminPlaceholderData()`, `renderAdminBar()`, guard en `syncToSupabase()`.
- **`_handleSendOtp()`** vive en `auth.js` también — 1 línea.
- **`autodiagnostico.html`, `recuperar.html`** — llaman
  `ensureAdminPlaceholderData()` + `renderAdminBar()` tras confirmar sesión de
  bypass. (2 archivos)
- **`plan-evaluacion.html`** — mismo llamado: `ensureAdminPlaceholderData()` +
  `renderAdminBar()` (sin gate de Nextcloud ni de pago propio en esta
  página). (1 archivo)
- **`alineacion.html`, `documentos-sesion.html`, `entrega.html`** — placeholder
  + barra + bypass del gate de Nextcloud + bypass del gate de pago. (3 archivos)
- **`encuesta-satisfaccion.html`, `evidencias.html`** — placeholder + barra +
  bypass del gate de Nextcloud (sin gate de pago en estas 2). (2 archivos)

Total: 1 archivo con toda la lógica nueva + 8 archivos con ~2-4 líneas cada
uno reutilizándola. Cero cambios de SQL, cero tablas nuevas.

## Nota de seguridad

El correo bypass está hardcodeado en JS del lado del cliente (visible en
"ver código fuente"), pero esto no otorga ningún privilegio real:

- Para *usarlo*, alguien necesita recibir un código OTP real en la bandeja de
  `paideia.tech@outlook.com` — no hay forma de "impersonar" el correo sin
  acceso a esa cuenta de verdad.
- Aunque alguien leyera el código fuente y viera el correo, no gana nada: no
  es un secreto, es solo una condición de comparación de string.
- Ninguna escritura real a `candidatos_ec1375` es posible bajo esta cuenta —
  reforzado por RLS, no solo por el guard de JS (ver arriba).
- Es exactamente el mismo nivel de exposición que ya existe hoy con
  `is_admin()`/`admins` para `admin-precios.html` (ese correo también está
  visible en el código fuente cliente vía las llamadas RPC).

## Fuera de alcance

- No se toca la tabla `admins` ni `is_admin()` — `de.minconsciente@outlook.com`
  no obtiene esta función.
- No se automatiza ni simula la subida real de documentos a Nextcloud/Storage.
- No se agrega ningún mecanismo para revocar o expirar el bypass — si algún
  día se quiere quitar, es borrar la constante `CANDIDATE_FLOW_BYPASS_EMAIL`
  (o cambiar su valor) en `auth.js`.
