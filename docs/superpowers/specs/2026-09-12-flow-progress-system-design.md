# Sistema de progreso del flujo — design spec

**Fecha:** 12 de septiembre, 2026
**Estado:** Aprobado por Diego, pendiente de implementación

## Contexto

Diego reportó un bug puntual (Reforzamiento mandaba a "rellenar" el
Autodiagnóstico aunque ya estuviera 100% contestado — ya corregido,
ver commit `2fda12c`) y, al mismo tiempo, planteó un problema más
grande: el candidato nunca debe cuestionarse "¿y ahora qué sigue?" —
la herramienta debe ser **a prueba de tontos** en todo momento.

Un mapeo completo del flujo actual (12 sep 2026) confirmó que el
problema es real y va más allá del bug puntual:

- **`evidencias.html` es un callejón sin salida real.** Después de
  subir evidencias, la pantalla de éxito solo ofrece "Descargar PDF" y
  "Avisar por WhatsApp" — ningún link hacia `entrega.html`, que es el
  paso final pagado (certificado). Esto no es un bug de código: por
  diseño, llegar a Entrega depende de que el equipo evaluador revise
  el video de la práctica y decida manualmente que el candidato es
  "competente" (Etapa 7, sin automatizar) — así que no puede ser
  simplemente un link. Pero hoy el candidato no ve NADA que le explique
  eso; solo desaparece la pista.
- **El orden real del flujo tiene 10 pasos**, no los 7 que se documentaron
  originalmente: Autodiagnóstico → Reforzamiento → Alineación → Plan de
  Evaluación → Documentos de Sesión → Práctica → Examen de Conocimientos
  → Encuesta de Satisfacción → Evidencias → Entrega. (Biblioteca, Ruta de
  Alineación y Guion Maestro son recursos de referencia en paralelo, no
  pasos de la secuencia.)
- **Cada página calcula "qué sigue" y "qué falta" a su manera**, con la
  lógica de gates (`documentosFaseCompletos`, `isPhaseAuthorized`, datos
  locales) copiada y ligeramente distinta en cada archivo — el mismo
  patrón que ya causó el bug de Reforzamiento y el bug de "200%" del
  Autodiagnóstico (ver historial de esta sesión). Sin una sola fuente de
  verdad, cada página nueva reintroduce el riesgo.
- Se encontraron además 5 huecos menores (detallados en "Fuera del
  núcleo, incluidos en este spec" más abajo).

## Objetivo

Un candidato en cualquier página del flujo, en cualquier momento, puede
ver: (1) en qué paso está de los 10 totales, (2) cuáles ya completó,
(3) cuál sigue y cómo llegar ahí con un clic, y (4) si algo no depende
de él (como Entrega), que quede claro que está esperando y qué está
esperando — nunca una pantalla que simplemente termina sin indicar nada.

## Diseño

### 1. `flow-status.js` — nueva fuente única de verdad

Nuevo archivo compartido, mismo patrón y misma justificación que
`auth.js` (única otra excepción a "páginas estáticas sin módulos
compartidos" en este proyecto): la lista de pasos y el cálculo de "qué
está completo" es exactamente el tipo de lógica donde una copia
desincronizada entre páginas es el modo de falla a evitar — ya
demostrado dos veces esta sesión. Se carga con
`<script src="flow-status.js">`, después de `auth.js` (lo usa
internamente) y antes del script propio de cada página.

**La lista canónica de 10 pasos**, en orden, cada uno con: id, label,
página, y **la condición de "completo" — reutilizando el gate que la
página SIGUIENTE ya usa para dejar pasar**, nunca una condición nueva:

| # | Paso | Página | "Completo" cuando... |
|---|------|--------|----------------------|
| 1 | Autodiagnóstico | `autodiagnostico.html` | `autodiagnosticoData.completo` (142/142) + `ndaAccepted` — mismo check que ya usan todas las páginas descendientes |
| 2 | Reforzamiento | `reforzamiento.html` | `ruta_estudio_data.diagnostic.approved` (el "visto bueno" que ya usa el motor internamente) |
| 3 | Alineación | `alineacion.html` | `isPhaseAuthorized(email, 'alineacion')` — no hay una actividad propia que "cerrar" en esta página, el pago es la única señal real disponible hoy |
| 4 | Plan de Evaluación | `plan-evaluacion.html` | `plan_evaluacion_data.documentosNextcloud` tiene `planEvaluacion` y `acusePlanEvaluacion` — mismo check que ya usa `documentos-sesion.html` |
| 5 | Documentos de Sesión | `documentos-sesion.html` | `documentos_sesion_data.documentosNextcloud` tiene `ficha`, `consentimiento`, `plan_sesion`, `plan_seguimiento` — mismo check que ya usa `encuesta-satisfaccion.html` |
| 6 | Práctica | `practica.html` | `ruta_estudio_data.practice.completed` — **confirmar nombre exacto del campo contra el motor durante implementación**, no verificado en esta sesión |
| 7 | Examen de Conocimientos | `examen-conocimientos.html` | el candidato ya tiene un intento registrado (aprobado o no — el examen no bloquea) — **confirmar nombre exacto de la columna/campo durante implementación** |
| 8 | Encuesta de Satisfacción | `encuesta-satisfaccion.html` | `encuesta_data.documentosNextcloud.encuesta` — mismo check que ya usa `evidencias.html` |
| 9 | Evidencias | `evidencias.html` | `evidencias_data.documentosNextcloud` tiene `zoom`, `ine`, `curp`, `fotoDiploma` — mismo check que ya usa `entrega.html` |
| 10 | Entrega | `entrega.html` | `isPhaseAuthorized(email, 'entrega')` — este es el único paso donde "completo" depende de una decisión humana externa (el evaluador), no de una acción del candidato |

**Una sola función**, `FlowStatus.getSteps()`, hace UNA llamada a
`Auth.pullMyRow()` (ya usada en todo el sitio) y devuelve el arreglo de
10 pasos, cada uno anotado `{ done, current, locked, reason }`:
- `done`: cumple la condición de la tabla.
- `current`: el primer paso de la lista que NO está `done`.
- `locked`: no se puede entrar todavía (el paso anterior no está
  `done`) — salvo el caso especial de Entrega (ver abajo).
- `reason` (solo si `locked`): texto corto de por qué, y si depende del
  candidato o de alguien más — para el paso 10 (Entrega) específicamente,
  si no está autorizado el `reason` es
  `'esperando_evaluador'` en vez de `'paso_anterior_pendiente'`, aunque
  el paso 9 (Evidencias) ya esté completo — así el dashboard (sección 4)
  sabe mostrar el mensaje de espera correcto en vez de "falta algo tuyo."

Biblioteca, Ruta de Alineación y Guion Maestro **no** entran en esta
lista — son material de referencia dentro de la fase de Alineación /
Documentos de Sesión, no pasos que se marcan como completos.

### 2. Barra de progreso persistente

Una barra compacta (chips horizontales, con scroll horizontal en
móvil — no una lista vertical que empuje el contenido) en las 10
páginas de pasos, **incluyendo dentro de los wizards largos**
(Autodiagnóstico, Documentos de Sesión) — confirmado explícitamente por
Diego, a pesar de que esas páginas ya tienen su propia barra de
progreso interna (esta nueva barra muestra el progreso del PROCESO
COMPLETO, la interna sigue mostrando el progreso DENTRO de esa página;
no se reemplazan entre sí). Cada chip: ✓ verde si `done`, resaltado si
`current`, 🔒 gris si `locked`. Los chips con `locked:false` son
clicables (navegan directo); los `locked:true` no lo son, y al pasar el
cursor (o tap) muestran el `reason`.

Implementada como `FlowStatus.renderProgressBar()` en `flow-status.js`
(mismo patrón que `Auth.renderAdminBar()`), llamada una vez por página
después de obtener los pasos.

### 3. CTA "Siguiente paso"

Cada página, en su pantalla de "ya terminé esto", agrega un botón
grande y con el mismo estilo en las 10 páginas, generado por
`FlowStatus.renderNextStepCTA(steps)` — nunca un href escrito a mano
por página. Calcula el siguiente paso `current` después de marcar el
actual como completo y arma el botón con su label/href reales. Para
Evidencias específicamente (paso 9): si al terminarla el paso 10 sigue
`locked` con `reason:'esperando_evaluador'` (el caso normal — el
evaluador todavía no se pronuncia), el CTA en vez de un botón muestra
el mensaje de espera + un link a `recuperar.html` ("Sigue tu proceso
aquí"); si por lo que sea Entrega ya está autorizada en ese momento
(ej. el equipo la autorizó por adelantado), se comporta como cualquier
otro paso y muestra el botón normal hacia `entrega.html` — la decisión
la toma el estado real de `FlowStatus`, nunca un caso especial
hardcodeado para Evidencias. En cualquier caso, nunca una pantalla que
termina sin ninguna acción.

### 4. `recuperar.html` se convierte en el dashboard completo

Hoy `recuperar.html` es login + una lista de links a lo que tenga
guardado. Se reemplaza esa lista por `FlowStatus.getSteps()` completo:
los 10 pasos con su estado, cada uno con su link si está desbloqueado,
o su `reason` si no. Es el "centro de control" al que el candidato
puede volver siempre — mismo dashboard que ve un candidato con avance
real o el admin bypass (que ya tiene su placeholder "completo").

### 5. Fuera del núcleo, incluidos en este spec

1. **`plan-evaluacion.html`**: agrega el gate de pago de Alineación que
   le faltaba (`isPhaseAuthorized(email,'alineacion')`), mismo patrón
   que ya usan `alineacion.html`/`documentos-sesion.html`/`entrega.html`.
2. **`examen-conocimientos.html`**: mantiene su diseño actual (no
   bloquea, es autoevaluación — la evaluación real es el video revisado
   por el evaluador humano), pero la pantalla de resultado usa copy
   distinto y honesto para aprobado vs. no aprobado, en vez del mismo
   texto en ambos casos.
3. **Barra de admin (`auth.js`, `renderAdminBar()`)**: se actualiza para
   incluir las 5 páginas que le faltan (Reforzamiento, Biblioteca,
   Práctica, Examen de Conocimientos, Guion Maestro) — son páginas
   reales del sitio y la barra debe seguir siendo un mapa completo para
   pruebas, aunque Biblioteca/Guion Maestro no sean "pasos" en
   `flow-status.js`.
4. **`ruta-alineacion.html`**: la última diapositiva reemplaza el ícono
   pequeño de "Volver" por un botón real "✅ Alineación completa —
   Continuar" que regresa a `alineacion.html`.
5. **`ruta-estudio.html` sin parámetro `?boot=`**: en vez de caer en el
   dashboard interno viejo del motor (huérfano, inconsistente con el
   flujo lineal actual), redirige a `recuperar.html`.

## Fuera de alcance (documentado, no de esta fase)

- No se automatiza la Etapa 7 (decisión del evaluador) — `flow-status.js`
  solo LEE `isPhaseAuthorized('entrega')`, que sigue autorizándose a mano
  por Diego/el equipo exactamente igual que hoy.
- No se toca el motor de `ruta-estudio.html` (`<script type="text/plain">`)
  — todo lo de Reforzamiento/Práctica se lee desde `ruta_estudio_data` vía
  Supabase, nunca desde el estado interno del motor en vivo.
- No se agrega remediación/reintento al Examen de Conocimientos — sigue
  siendo de un solo intento, sin bloquear.
- No se persigue el caso de un candidato con progreso guardado ANTES de
  esta migración (ej. `ruta_estudio_data.practice.completed` inexistente
  en filas viejas) más allá de tratar "campo ausente" como `false`
  (no completo) — es el comportamiento seguro por default, no hace falta
  backfill.

## Verificación

Sin framework de pruebas en este proyecto (igual que el resto del
sitio) — `node --check` de sintaxis en cada archivo tocado, un harness
de Node aislado para `FlowStatus.getSteps()` (mockeando `Auth.pullMyRow`)
cubriendo cada combinación done/current/locked de la tabla de 10 pasos
incluyendo el caso especial de Entrega, y verificación en vivo por
Diego (requiere sesión de candidato real o admin bypass) confirmando
que la barra/CTA/dashboard aparecen correctamente en las 10 páginas.
