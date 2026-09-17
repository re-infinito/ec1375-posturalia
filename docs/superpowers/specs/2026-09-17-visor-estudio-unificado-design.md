# Visor de estudio unificado (`estudio.html`) — diseño

**Fecha:** 17 sep 2026 · **Decisión de Diego:** "Un solo visor de estudio" (fase 1: Alineación + Reforzamiento + Biblioteca; fase 2: Práctica + Examen) y, en una segunda etapa, la misma guía en los formularios por pasos.

## Problema
Cinco experiencias de estudio vivían en cuatro páginas con navegación distinta: `biblioteca.html` (visor propio con guía), `ruta-alineacion.html` (visor del pipeline), `ruta-estudio.html` (motor V4.4 de 287 KB para Reforzamiento y Práctica, con botones sin texto en móvil, "Volver a mi alineación" que no marca nada y sin pantalla de completado) y `examen-conocimientos.html` (página aparte que manda a otra pestaña para repasar). Además, la precarga que habilita la Práctica corría antes de cargar el contenido de Supabase.

## Decisión
Una sola página, `estudio.html?modo=biblioteca|alineacion|reforzamiento|practica|examen`, con la misma navegación guiada en todos los modos: tarjeta superior (qué estás haciendo, paso X de N, instrucciones plegables), barra inferior fija (Anterior · posición · Siguiente), pantalla de "completado" con la siguiente acción, y repasos de diapositivas **dentro** del mismo visor (nunca otra pestaña).

## Contratos que NO cambian
- `candidatos_ec1375.ruta_estudio_data` (y `localStorage['ec1375-state']` en la cuenta bypass): mismo objeto V4.4 (`vacio()`/`normaliza()`/`recalcula()` portados 1:1). `flow-status.js` sigue leyendo `diagnostic.approved` y `practice.completed`.
- `candidatos_ec1375.examen_conocimientos_data` / `localStorage['examenConocimientosData']`: `{order, currentIndex, answers, firstAttemptCorrect, submitted, score, correctas, fecha}`; `examen` done = `submitted`.
- Reglas pedagógicas del motor: visto bueno = diagnóstico completo + criterios obligatorios (NO en reactivo `critico`) reforzados; un criterio se marca reforzado solo al terminar sus pantallas; Práctica = 20 objetivos, acierto → `mastered_in_practice`, primer fallo → `awaiting_verification` + repaso + 1 pregunta de verificación, fallo en verificación → `needs_support`; preguntas `mc` y `col`.
- Compuertas de pago: Reforzamiento/Biblioteca base = `registro`; Alineación y Biblioteca = `alineacion`; Práctica y Examen = `evaluacion`; admins y bypass exentos donde ya lo estaban.

## Piezas
- `estudio-logica.js` — lógica pura (Node): estado V4.4, brechas, visto bueno, rutas por criterio/objetivo, práctica, examen. Pruebas + comparación contra el motor original extraído.
- `visor-diapositivas.js` / `.css` — catálogo, filtros, videos, quizzes, tema (ya existían).
- `estudio.css` — guía, barra inferior, tarjetas de hub/pregunta/resultado, modales.
- `estudio.html` — carga por modo, montaje del rail (`currentPageId` por modo), render.
- `examen-pdf.js` — comprobante PDF del examen (logos oficiales), cargado solo al descargar.
- Redirecciones: `biblioteca.html`, `ruta-alineacion.html`, `ruta-estudio.html` (`boot=`), `reforzamiento.html`, `practica.html`, `examen-conocimientos.html` → `estudio.html?modo=…` conservando `crit`, `reintentar` y `#sid`.

## Simplificaciones conscientes
Del motor no se portan las vistas internas que el flujo real ya no usa: centro "Mi preparación", Evaluación 1/2 interna, stepper de 5 pasos, matriz y herramientas. Los campos de estado correspondientes se conservan intactos al guardar.
