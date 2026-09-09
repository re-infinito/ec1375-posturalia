# 📚 MEMORIA DEL PROYECTO: EC1375 Sesiones de Alineación

**Última actualización:** 2026-09-09  
**Status:** 🔴 Admin panel no renderiza (en debugging)  

---

## 🎯 Objetivo General

Reemplazar Google Calendar Appointment Scheduler con sistema custom de inscripción a sesiones de grupo con:
- ✅ Usuarios ven grilla de sesiones disponibles
- ✅ Pueden inscribirse a sesiones con múltiples participantes
- ✅ Reciben confirmación + recordatorios por email
- ✅ Admin puede crear/gestionar sesiones

---

## 🏗️ Arquitectura

### Stack Tecnológico
```
Frontend:
  - alineacion.html → Usuarios finales (ver sesiones, inscribirse)
  - admin-sesiones.html → Administradores (crear sesiones)
  - sesiones-alineacion-component.js → Componente Vue-like

Backend:
  - Vercel Functions (/api/*.js)
  - Supabase PostgreSQL (RLS policies)
  - Google Calendar API (eventos + Meet links)
  - Resend (emails transaccionales)
  - Supabase Cron (recordatorios cada hora)

Auth:
  - auth.js → OTP por correo + Supabase Auth
```

### URLs Importantes
```
Producción: https://sepconocer.paideiatech.com
Admin Panel: https://sepconocer.paideiatech.com/admin-sesiones.html
Usuario Panel: https://sepconocer.paideiatech.com/alineacion.html

Supabase:
  - URL: https://numsuiuwrvpprhnxovmh.supabase.co
  - Keys: auth.js líneas 13-14 (SUPABASE_URL, SUPABASE_ANON_KEY)

Vercel:
  - Proyecto: re-infinito/ec1375-posturalia
  - Dashboard: https://vercel.com/re-infinito/ec1375-posturalia
```

---

## ✅ CAUSA RAÍZ CONFIRMADA Y RESUELTA (Sonnet 5, misma fecha, segunda vuelta)

El usuario reportó DevTools Console con el error real:

```
Uncaught SyntaxError: Identifier 'supabase' has already been declared
(at admin-sesiones.html:170:13)
```

**Causa raíz real:** `admin-sesiones.html` tenía `const supabase = window.supabaseClient;`
a nivel superior del script. El CDN `@supabase/supabase-js@2` (cargado antes vía
`<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2">`) ya expone un
global `supabase` (además de en `window.supabase`, el UMD lo deja como binding global
plano). Declarar `const supabase = ...` cuando ya existe un global `var`/binding con
ese mismo nombre es un **SyntaxError de tiempo de parseo** (no un error de ejecución) —
esto invalida TODO el bloque `<script>` completo, por lo que ni siquiera el try/catch
agregado en el intento anterior llegaba a ejecutarse. Esto explica el "blank total"
persistente: el navegador nunca llegó a correr una sola línea de nuestro JS.

`admin-precios.html` (que sí funciona) nunca declara este alias — usa `supabaseClient`
directamente en cada llamada (bare identifier que resuelve a `window.supabaseClient`).
Ese es el patrón correcto.

**Fix aplicado (commit en esta sesión):**
- Eliminada la línea `const supabase = window.supabaseClient;`
- Todas las llamadas `await supabase.from(...)` → `await supabaseClient.from(...)`
  (3 ocurrencias: `cargarSesiones`, `crearSesion`, `eliminarSesion`)
- Verificado que ningún otro archivo de frontend (sesiones-alineacion-component.js,
  alineacion.html) tiene este mismo patrón — solo los archivos backend en `/api/*.js`
  declaran `const supabase = createClient(...)`, pero esos corren en Node.js (sin CDN
  de navegador), sin riesgo de colisión.

**Lección para futuras páginas admin:** Nunca declarar `const/let supabase = ...` en
un script de navegador que también carga el CDN `@supabase/supabase-js` — ese nombre
ya está ocupado por el propio CDN. Usar siempre `supabaseClient` (el nombre que exporta
auth.js) como identificador, igual que en admin-precios.html.

---

## 🆕 ACTUALIZACIÓN (Sesión Sonnet 5 — misma fecha)

**Contexto:** El usuario reportó que, tras el fix de Haiku (window.supabaseClient / window.Auth),
el admin panel **sigue en blanco**. No se pudo verificar en vivo: el proxy de este entorno
remoto bloquea `sepconocer.paideiatech.com` Y `numsuiuwrvpprhnxovmh.supabase.co` (confirmado
de nuevo — mismo bloqueo que en la sesión anterior). Tampoco hay GitHub Actions/check runs
que reflejen el estado del deploy de Vercel (es integración directa Vercel↔GitHub, no Actions).

**Hallazgo clave (comparando con admin-precios.html, que si funciona):**
`admin-sesiones.html` NO tenía try/catch alrededor de `init()`. Si `Auth.getSession()`
lanzaba una excepción (por ejemplo, `window.Auth`/`window.supabaseClient` aún undefined por
caché de navegador sirviendo el auth.js viejo, o el CDN de Supabase sin cargar), la promesa
quedaba rechazada sin manejar → la página se queda 100% en blanco, sin ningún rastro visible.
`admin-precios.html` sí envuelve todo en try/catch y muestra un mensaje de error visible
(línea ~325-331), por eso nunca se ha reportado como "en blanco".

**Fix aplicado (admin-sesiones.html, función init()):**
1. Chequeo explícito: `typeof window.supabase === 'undefined'` → error "CDN no cargó"
2. Chequeo explícito: `typeof window.Auth === 'undefined' || typeof window.supabaseClient === 'undefined'` → error "auth.js no se inicializó"
3. `try/catch` alrededor de todo `init()` con mensaje de error visible en pantalla + botón "Recargar"
4. **NO se activó** el chequeo `Auth.isAdmin()` (estaba como TODO) — se dejó pendiente
   deliberadamente para no introducir un nuevo bloqueo si el email del usuario no está
   registrado como admin en Supabase (no se pudo verificar por las restricciones de red).

**Por qué esto es lo más valioso que se puede hacer sin acceso al navegador en vivo:**
Ahora, la próxima vez que el usuario abra admin-sesiones.html, UNA de estas dos cosas pasará:
- ✅ El panel renderiza correctamente (si el fix anterior de Haiku ya se propagó bien)
- ⚠️ Aparece un mensaje de error EXPLÍCITO en pantalla (ya no blank) que dirá exactamente
  cuál de los 2 checks falló — esto da información accionable real por primera vez.

**Siguiente paso inmediato para quien continúe:**
Pedir al usuario un hard refresh (Ctrl+Shift+R) del admin panel y reportar EXACTAMENTE
qué ve ahora: ¿sigue en blanco? ¿aparece el mensaje de error? ¿qué dice? Si sigue en blanco
tras este fix, el problema NO es JS del lado cliente sino algo previo: Vercel no deployó,
DNS/CDN cache, o el archivo servido en producción no es el que está en `main` (verificar
Vercel dashboard → Deployments → confirmar que el commit `05ff27b` o posterior es el
"Production" activo).

---

## 🔴 PROBLEMA ACTUAL

### Síntoma
Admin panel (admin-sesiones.html) carga pero está en blanco. El usuario ve:
- ✅ URL correcta: sepconocer.paideiatech.com/admin-sesiones.html
- ✅ Top bar visible con título "⊕ Admin - Sesiones de Alineación"
- ❌ Resto de página vacía (no hay formulario, tabs, contenido)

### Historia de Debugging

**Intento 1: Crear sesiones vía API desde CLI**
- ❌ Proxy bloqueó conexiones a sepconocer.paideiatech.com
- Conclusión: No se puede testear desde este entorno remoto

**Intento 2: Crear sesiones directamente en Supabase**
- ❌ Proxy también bloqueó conexiones a numsuiuwrvpprhnxovmh.supabase.co
- Conclusión: Red ambiente remoto muy restringida

**Intento 3: Analizar código admin-sesiones.html**
- ✅ ENCONTRADO: admin-sesiones.html línea 172:
  ```javascript
  const supabase = window.supabaseClient;  // ← undefined!
  ```
- ✅ ENCONTRADO: admin-sesiones.html línea 175:
  ```javascript
  const session = await Auth.getSession();  // ← Auth es undefined!
  ```

**Intento 4: Revisar auth.js**
- ✅ ENCONTRADO CULPABLE: auth.js línea 16
  ```javascript
  const supabaseClient = window.supabase.createClient(...);
  // ❌ NO EXPORTA a window.supabaseClient
  // ❌ NO EXPORTA window.Auth
  ```

### Fix Aplicado

**Cambio 1: auth.js línea 17**
```javascript
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
window.supabaseClient = supabaseClient;  // ✅ AGREGADO
```

**Cambio 2: auth.js línea 328**
```javascript
};

window.Auth = Auth;  // ✅ AGREGADO
```

**Commit:** `Fix: Export supabaseClient and Auth to window global scope`

---

## ✅ Verificaciones Realizadas

- [x] auth.js línea 17: `window.supabaseClient = supabaseClient;` ✅ Present
- [x] auth.js línea 328: `window.Auth = Auth;` ✅ Present
- [x] Cambios commiteados a main ✅
- [x] Cambios pusheados a main ✅
- [x] Cambios pusheados a feature branch ✅

---

## 🤔 ¿Por qué sigue en blanco?

El fix debería funcionar, pero usuario reporta que sigue sin aparecer. Posibles causas:

1. **Cache del navegador** - Vercel cachea assets
   - Solución: Ctrl+Shift+R (hard refresh) o limpiar cache

2. **Vercel no actualizó** - La función no re-deployó
   - Solución: Ir a https://vercel.com/re-infinito/ec1375-posturalia/logs
   - Ver si el último commit fue deployed

3. **Script error en console** - Algo más está fallando
   - Solución: Abrir DevTools (F12) → Console tab
   - Buscar errores rojos

4. **Script de auth.js no carga** - Supabase CDN falla
   - Solución: Verificar en DevTools → Network tab
   - Ver si "auth.js" tiene status 200

5. **Admin gate required** - admin-sesiones.html está gateado para admin
   - Ver admin-sesiones.html líneas 175-184
   - Posible que Auth.getSession() esté forzando admin verification

---

## 📋 Checklist de Debugging para Sonnet

- [ ] Verificar que Vercel deployó el último commit (auth.js fix)
- [ ] Abrir admin panel en navegador
- [ ] Ctrl+Shift+R (hard refresh)
- [ ] Abrir DevTools (F12)
- [ ] Console tab: ¿Hay errores rojos?
- [ ] Network tab: ¿auth.js se cargó? (status 200)
- [ ] Console: `console.log(window.supabaseClient)` → ¿Es object?
- [ ] Console: `console.log(window.Auth)` → ¿Es object?
- [ ] Si undefined: El fix no se aplicó o Vercel no deployó
- [ ] Si object: El problema está en otro lado (parsing, renderizado, etc.)

---

## 📁 Archivos Clave

### Estructura
```
/home/user/ec1375-posturalia/
├── auth.js                          ← ⭐ FIX APLICADO AQUÍ
├── admin-sesiones.html              ← Depende de window.Auth y window.supabaseClient
├── alineacion.html                  ← Página usuario (funciona)
├── sesiones-alineacion-component.js ← Componente sesiones
├── api/
│   ├── sesiones-alineacion.js       ← GET sesiones disponibles
│   ├── inscribir-alineacion.js      ← POST inscribirse
│   ├── crear-evento-google.js       ← POST crear en Google Calendar
│   ├── enviar-recordatorios.js      ← POST recordatorios (Cron)
│   ├── mis-inscripciones-alineacion.js
│   └── utils/send-email.js
└── .env                             ← Credenciales (no trackear)
```

### Tablas Supabase
```
sesiones_alineacion:
  - id (UUID)
  - fecha (date)
  - hora_inicio, hora_fin (time)
  - capacidad_maxima (int)
  - instructor_nombre (text)
  - descripcion (text)
  - google_event_id (text)
  - google_meet_link (text)
  - recordatorio_24h_enviado (boolean)
  - recordatorio_1h_enviado (boolean)

inscripciones_alineacion:
  - id (UUID)
  - sesion_id (UUID foreign key)
  - usuario_email (text)
  - usuario_nombre (text)
  - usuario_curp (text)
  - estado_inscripcion (text)
  - created_at (timestamp)

emails_enviados_alineacion:
  - id (UUID)
  - usuario_email (text)
  - tipo_email (text) - 'confirmacion', 'recordatorio_24h', 'recordatorio_1h'
  - estado_envio (text) - 'enviado', 'fallido'
  - error_mensaje (text)
  - fecha_envio (timestamp)
```

---

## 🔐 Credenciales & Acceso

### Supabase
```
URL: https://numsuiuwrvpprhnxovmh.supabase.co
Anon Key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Service Role: [En .env, no exponer]
```

### Google Calendar
```
Service Account: ec1375-alineacion-bot@ec1375-paideaia.iam.gserviceaccount.com
Calendar ID: [En .env]
Compartido con: Calendar de Diego (comprobado ✅)
```

### Resend
```
API Key: [En Vercel env vars]
Sender Email: noreply@ec1375.paideia.tech
Status: ✅ Conectado (testeado en Phase 4)
```

---

## 🚀 Estado de Features

| Feature | Status | Notas |
|---------|--------|-------|
| Crear sesiones (admin) | ❌ Bloqueado | Admin panel no renderiza |
| Ver sesiones (usuario) | ✅ Funciona | alineacion.html renderiza bien |
| Inscribirse a sesión | ✅ Ready | Espera sesiones en BD |
| Google Calendar sync | ✅ Funciona | API testeada |
| Email confirmación | ✅ Funciona | Resend integrado |
| Recordatorios cron | ✅ Configurado | Supabase pg_cron activo |
| Admin panel UI | ❌ Bloqueado | Blank page issue |

---

## 📝 Próximos Pasos

1. **Sonnet:**
   - [ ] Verificar que fix (auth.js) se deployd en Vercel
   - [ ] Hard refresh admin panel
   - [ ] Debug con DevTools si sigue en blanco
   - [ ] Reportar console errors

2. **Si admin panel funciona:**
   - [ ] Usuario crea 3 sesiones de prueba
   - [ ] Verificar que aparecen en Google Calendar
   - [ ] Verificar que aparecen en alineacion.html
   - [ ] Probar inscripción completa

3. **Si persiste el problema:**
   - [ ] Revisar Vercel logs
   - [ ] Verificar que .env tiene credenciales correctas
   - [ ] Revisar RLS policies de Supabase
   - [ ] Testear cada endpoint por separado

---

## 📞 Contacto & Referencias

**GitHub:** https://github.com/re-infinito/ec1375-posturalia  
**Vercel Dashboard:** https://vercel.com/re-infinito/ec1375-posturalia  
**Supabase Dashboard:** https://app.supabase.com/projects  

---

## 📚 Documentación Generada

- `DEPLOY_SUMMARY.md` - Resumen deployment (20/21 tests)
- `ADMIN_PANEL_GUIDE.md` - Cómo usar panel admin
- `BUG_REPORT_ADMIN_PANEL.md` - Análisis del bug de hoy
- `test-endpoints.sh` - Script testing endpoints
- `setup-supabase-cron.md` - Configuración Cron
