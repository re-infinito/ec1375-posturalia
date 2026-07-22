# 📄 Claude.md - EC1375 Posturalia

## 🎯 PROYECTO: EC1375 - Certificación Oficial para Terapeutas Alternativas

**Última actualización:** 21 de julio, 2026  
**Estado:** Landing page en producción (v2.0 emocional)  
**URL en vivo:** https://ec1375-posturalia.vercel.app

---

## 📋 DESCRIPCIÓN DEL PROYECTO

**Objetivo:** Crear una landing page de alta conversión que regulariza terapeutas alternativas en México (masajistas, acupunturistas, terapeutas holísticos, etc.) a través de la certificación oficial **EC1375 (SEP-CONOCER)**.

**Audiencia principal:**
- Terapeutas alternativas sin credenciales oficiales
- Edad: 25-55 años
- Operan en México (principalmente)
- Viven con **miedo legal** (COFEPRIS, multas, cierres)
- Ya tienen clientes pero sin respaldo profesional oficial

**Problema psicológico que resuelve:**
- **Miedo primario:** Multas COFEPRIS ($80k), cierre de consultorio, responsabilidad penal
- **Miedo secundario:** Pérdida de credibilidad ante pacientes modernos
- **Fricción:** Precio ($14,750) vs. ganancia actual

---

## 🧠 ESTRATEGIA EMOCIONAL (v2.0)

### Dos Pilares Emocionales Centrales

```
PILAR 1: "Tu vocación es ayudar personas, NO vivir con el estrés 
         de no contar con respaldo legal"

PILAR 2: "Deja de ejercer con MIEDO. Empieza a ejercer con la 
         TRANQUILIDAD de estar en regla"
```

### Arco Emocional de Conversión

```
VOCACIÓN (identificación)
    ↓
MIEDO (validación del problema real)
    ↓
TRANSFORMACIÓN (esperanza via otros como ellos)
    ↓
TRANQUILIDAD (beneficio emocional final)
    ↓
ACCIÓN (botón: "SÍ, QUIERO DORMIR TRANQUILO")
```

### Secciones y Copy Emocional

| Sección | Objetivo | Copy Clave |
|---------|----------|-----------|
| **Hero** | Resonancia vocacional | "Tu vocación es ayudar personas. NO VIVIR CON MIEDO" |
| **Antes/Después** | Validación del contraste | Miedo (rojo) ↔ Tranquilidad (azul) |
| **Miedos** | Amplificar problema | "El miedo constante a COFEPRIS", "El miedo de perder credibilidad", "El miedo al daño sin saber" |
| **Tranquilidad** | Ofrecer solución emocional | "Protección Legal Oficial", "Credibilidad Real", "Libertad sin Culpa" |
| **Testimonios** | Social proof emocional | Narrativas Antes/Ahora/Emoción |
| **CTA Final** | Poder y acción | "SÍ, QUIERO DORMIR TRANQUILO" |

---

## 🛠️ STACK TÉCNICO

**Frontend:**
- HTML5 + CSS3 (con custom properties)
- JavaScript vanilla (sin frameworks)
- Responsive mobile-first

**Diseño:**
- Dark mode profesional
- Colores: Azul Cyan (#0088FF) + Dorado (#D4AF37) + Rojo (#FF3333)
- Tipografía: System fonts (sans-serif)
- Animaciones: CSS keyframes (fadeInUp, hover effects)

**Integración de Pagos:**
- Mercado Pago SDK v2
- Payment link: https://mpago.la/1QeeSHo
- Alternativa: Transferencia bancaria (Banorte CLABE)

**Deployment:**
- Git repository: https://github.com/re-infinito/ec1375-posturalia
- Hosting: Vercel (auto-deploy on push)
- Dominio: ec1375-posturalia.vercel.app

**Configuración:**
- `.env.local` (no commiteado): Credenciales Mercado Pago
- `vercel.json`: Config de build y output
- `.gitignore`: Excluye .env.local y ASSETS_GUIDE.md

---

## 📁 ESTRUCTURA DE ARCHIVOS

```
/Users/diegogarzamx/Desktop/EC1375/
├── index.html                 # Landing page completa (v2.0 emocional)
├── Claude.md                  # Este archivo - documentación del proyecto
├── .env.local                 # Credenciales (NO COMMITEAR)
├── .gitignore                 # Git ignore rules
├── vercel.json                # Config de Vercel
├── ASSETS_GUIDE.md            # Guía para agregar fotos/videos
├── MERCADO_PAGO_SETUP.md      # Documentación de integración MP
└── assets/                    # (Carpeta para fotos/videos - crear cuando se tengan)
    ├── images/
    │   ├── logo/
    │   ├── hero/
    │   ├── testimonials/
    │   └── icons/
    └── videos/
```

---

## 🎯 FUNNEL DE CONVERSIÓN COMPLETO (v3.0 - Nuevo)

**Última actualización:** 22 de julio, 2026  
**Versión:** 3.0 (Quiz → Landing → Pago → Confirmación)

### 🔄 Flujo Completo del Funnel

```
ETAPA 1: CALENTAMIENTO EMOCIONAL
┌─────────────────────────────────────┐
│ quiz.html - 5 Preguntas Emocionales │
├─────────────────────────────────────┤
│ 1. ¿Eres terapeuta sin validación?  │
│ 2. ¿Sabes el costo multa COFEPRIS?  │
│ 3. ¿Pacientes preguntaron credenciales? │
│ 4. ¿Te gustaría regularizarte?      │
│ 5. ¿Dispuesto si hay solución?      │
│ + Bonus: Especialidad (masaje, etc) │
└─────────────────────────────────────┘
          ↓ localStorage guarda respuestas
          ↓ Button: "VER MI SOLUCIÓN"
          
ETAPA 2: CONVERSIÓN
┌─────────────────────────────────────┐
│ index.html?source=quiz&specialty=X  │
├─────────────────────────────────────┤
│ Landing emocional v2.0              │
│ (Lead ya está calentado)             │
│ Detecta ?source=quiz (oculta nav)   │
│ Scroll automático a #transformacion │
└─────────────────────────────────────┘
          ↓ Button: "SÍ, QUIERO DORMIR TRANQUILO"
          
ETAPA 3: PAGO
┌─────────────────────────────────────┐
│ https://mpago.la/1QeeSHo            │
├─────────────────────────────────────┤
│ Mercado Pago - $2,000 MXN           │
│ Back-URLs configuradas:             │
│ - Success: /success                 │
│ - Failure: /failure                 │
│ - Pending: /pending                 │
└─────────────────────────────────────┘
          ↓ Pago completado
          
ETAPA 4: CONFIRMACIÓN + COMUNIDAD
┌─────────────────────────────────────┐
│ success.html - Celebración           │
├─────────────────────────────────────┤
│ ✅ Confetti animation               │
│ 📋 Confirmación de pago             │
│ 📱 BOTÓN: "UNIRME A WHATSAPP"       │
│    - Mensaje personalizado c/ especialidad │
│ 📅 Timeline próximos pasos          │
│ 🔒 Trust & Security info            │
└─────────────────────────────────────┘
          ↓ Click WhatsApp
          ↓ Se une a grupo + recibe bienvenida
          
PÁGINAS ALTERNATIVAS:
- failure.html - Pago rechazado (retry option)
- pending.html - Pago en espera (verificar estado)
```

### 📄 Archivos del Funnel (Nuevos)

| Archivo | Propósito | localStorage |
|---------|-----------|--------------|
| `quiz.html` | 5 preguntas emocionales | `quizResponses: {q1-q5, specialty}` |
| `success.html` | Post-pago celebration | Lee `quizResponses` para personalizar |
| `failure.html` | Pago fallido | Retry button → MP link |
| `pending.html` | Pago procesando | Auto-reload cada 30s |

### 🔗 Flujo técnico de redirecciones

```javascript
// Quiz → Landing
quiz.html → VER MI SOLUCIÓN button
  localStorage.setItem('quizResponses', {...})
  window.location.href = 'index.html?source=quiz&specialty=masaje#transformacion'

// Landing → Pago (ambos métodos)
index.html → SÍ, QUIERO DORMIR TRANQUILO button
  handleMercadoPagoPay() 
  window.location.href = 'https://mpago.la/1QeeSHo'

// Pago → Confirmación (configurado en Mercado Pago dashboard)
Mercado Pago back_urls:
  success: https://ec1375-posturalia.vercel.app/success
  failure: https://ec1375-posturalia.vercel.app/failure
  pending: https://ec1375-posturalia.vercel.app/pending

// Confirmación → WhatsApp
success.html → UNIRME A GRUPO button
  const specialty = localStorage.getItem('quizResponses')
  message = `Hola, acabo de apartar. Soy terapeuta de ${specialty}`
  window.open(`https://wa.me/528136071342?text=${message}`)
```

### 📊 Conversión esperada (Baseline)

```
Quiz entrada:         100%
Quiz → Landing:        80% (Si no abandonan quiz)
Landing → Pago:      15-25% (Tasa conversión típica)
Pago → WhatsApp:       60% (Click en botón CTA)
WhatsApp → Venta:    40-50% (Primer contacto en grupo)

FUNNEL TOTAL:        4.3% conversión (Baseline)
OPTIMIZADO:          7-10% (Con mejoras de UX)
```

### 🎯 Próximas optimizaciones

- [ ] Agregar URL parameter detection en index.html (source=quiz)
- [ ] Implementar auto-scroll a #transformacion si source=quiz
- [ ] Ocultar nav si source=quiz (landing más limpia)
- [ ] Configurar back_urls en Mercado Pago dashboard
- [ ] Crear funnel.js para lógica compartida (si es necesario)
- [ ] Agregar video de Fernando Villarreal (30-60s) en success.html
- [ ] Pixel de conversión (Facebook/Google) en success.html
- [ ] Email automático post-pago (opcional)

---

## 🔐 CREDENCIALES Y CONFIGURACIÓN

### Mercado Pago
```
Public Key: APP_USR-2465263038921252-072114-fce315dcc9b9550df49c635de92e696f-724130873
Client ID: 2465263038921252
Payment Link: https://mpago.la/1QeeSHo
Precio: $2,000 MXN (apartado)
```

**Ubicación en código:**
- `index.html` línea 1210: `const publicKey = '...'`
- `index.html` línea 1249: `window.location.href = 'https://mpago.la/1QeeSHo'`

### Transferencia Bancaria
```
Banco: Banorte
Titular: Jose Fernando Villarreal Flores
Cuenta: 4189143315836695
CLABE: 072580006971824032
```

### Contacto y WhatsApp
```
Teléfono: +52 81 3607 1342
Email: posturalia.d817@gmail.com
WhatsApp: https://wa.me/528136071342
```

---

## 🚀 DEPLOYMENT Y CI/CD

### Flujo de Deployment

```
1. Editar archivos locales
2. git add / git commit
3. git push origin main
4. ↓ (Automático)
5. Vercel detecta push
6. Vercel construye y despliega
7. Landing live en 30-60 segundos
```

### Comandos Git Útiles

```bash
# Ver cambios sin commitar
git status

# Agregar archivos específicos
git add index.html

# Commit con mensaje descriptivo
git commit -m "Descripción del cambio"

# Push a main (trigger deploy automático)
git push origin main

# Ver últimos commits
git log --oneline -5
```

### Verificar Deployment

- Vercel dashboard: https://vercel.com/re-infinito/ec1375-posturalia
- Landing live: https://ec1375-posturalia.vercel.app
- Tiempo típico: 30-60 segundos después de push

---

## 📊 ESTRUCTURA DE LA LANDING PAGE (v2.0)

### Secciones Actuales

1. **Header** (sticky)
   - Logo Posturalia
   - Nav links: ¿Por Qué?, Proceso, Preguntas, Apartar Ahora

2. **Hero Section** (emoción + urgencia)
   - Pill badge: "ÚLTIMO DÍA • CUPO LIMITADO • SEPTIEMBRE"
   - Headline: "Tu vocación es ayudar personas. NO VIVIR CON MIEDO"
   - Subheadline: Deja de ejercer con MIEDO → TRANQUILIDAD
   - Copy narrativo: Resonancia vocacional
   - Countdown regresivo (⏰ Quedan Xh Ym Zs)
   - CTA: "SÍ, QUIERO DORMIR TRANQUILO"
   - Secondary CTA: "Ver Mi Transformación"
   - Social proof: "156+ Terapeutas ya inscritos"

3. **Antes/Después Emocional** (NUEVA - v2.0)
   - Bloque izquierdo (Rojo): "TRABAJAS CON MIEDO"
     - 5 puntos de miedo con ✗ rojo
   - Arrow divider (Dorado)
   - Bloque derecho (Azul): "TRABAJAS CON TRANQUILIDAD"
     - 5 puntos de tranquilidad con ✓ verde

4. **Miedos** (reescrito v2.0)
   - Título: "ESTOS MIEDOS SON REALES & TÍ LOS VIVES"
   - 3 tarjetas emocionales: Miedo a COFEPRIS, Pérdida de credibilidad, Daño sin saber
   - 3 tarjetas de solución: Protección legal, Credibilidad real, Libertad sin culpa

5. **Timeline / Cómo Funciona**
   - Paso 1: Apartado ($2k, hoy)
   - Paso 2: Alineación ($4.25k, 2-3 semanas)
   - Paso 3: Evaluación ($6k, 1-2 semanas)
   - Paso 4: Entrega ($2.5k, 60-90 días)
   - Total: $14,750 MXN

6. **Testimonios** (expandidos v2.0)
   - María C. (Masajista Holística - Monterrey)
   - Alberto H. (Terapeuta Manual - CDMX)
   - Laura G. (Acupunturista - Guadalajara)
   - Cada uno: Antes/Ahora/Emoción

7. **Opciones de Pago**
   - Transferencia bancaria (Banorte)
   - Mercado Pago (link directo)

8. **FAQ** (acordeones expandibles)
   - 6 preguntas frecuentes resueltas

9. **Final CTA** (v2.0 emocional)
   - Título: "¿HASTA CUÁNDO VAS A ESPERAR?"
   - Copy: Comparación social (otros ya se certifican)
   - Countdown regresivo
   - CTA: "SÍ, QUIERO DORMIR TRANQUILO"
   - Contacto: Teléfono, WhatsApp, Email

10. **Sticky CTA** (flotante)
    - Aparece al scrollear
    - CTA: "Apartar Ahora"

---

## 🎨 DISEÑO Y ANIMACIONES

### Colores
```css
--dark: #050a1a              /* Fondo principal */
--dark-light: #0f1428        /* Cards/secciones */
--primary: #0088FF           /* Azul Cyan - confianza */
--primary-light: #00CCFF     /* Azul claro - hover */
--accent: #FFD700            /* Dorado - énfasis */
--text: #D0D0D0              /* Texto secundario */
--text-bright: #FFFFFF       /* Texto principal */
--danger: #FF3333            /* Rojo - miedos */
--success: #00FF88           /* Verde - tranquilidad */
```

### Animaciones
- `fadeInUp`: Cards, timeline steps, testimonios (cascada con delay)
- `hover`: Buttons con shine effect (::before pseudo-element)
- `pulse`: Countdown box (urgencia)
- Smooth scroll behavior (scroll-behavior: smooth)

### Responsive
- Mobile-first approach
- Breakpoint: 768px
- Grids se colapsan a 1 columna
- Buttons full-width en mobile
- Font sizes ajustables (clamp)

---

## 📱 FUNCIONALIDADES JAVASCRIPT

### updateCountdown()
- Calcula diferencia entre ahora y 2026-07-21 23:59:59
- Actualiza cada segundo
- Muestra: "⏰ Quedan Xh Ym Zs"
- Cierra oferta cuando countdown llega a 0

### handleMercadoPagoPay()
- Redirige a: https://mpago.la/1QeeSHo
- Trigger: Todos los botones "SÍ, QUIERO DORMIR TRANQUILO"

### Sticky CTA Visibility
- Aparece cuando scroll < 100px antes de final-cta
- Se oculta cuando llega a final-cta

### FAQ Toggle
- Expande/colapsa respuestas
- Rotación del toggle icon

### copyToClipboard(text)
- Copia CLABE al portapapeles
- Muestra confirmación

---

## 📸 ASSETS Y MEDIA (Pendientes)

### Fotos Necesarias
- [ ] Logo Posturalia (ya existe: Logo Posturalia.jpeg)
- [ ] Foto/video hero: Terapeuta en consultorio profesional
- [ ] Foto/video transformación: Antes vs. Después
- [ ] Avatares testimonios: María, Alberto, Laura (reales si es posible)
- [ ] Iconos para secciones de miedos

### Video Script (Pendiente - Fernando Villarreal)
**Duración:** 30-60 segundos  
**Propósito:** Introduce el problema y la solución de manera emocional

---

## 🔄 HISTORIAL DE CAMBIOS PRINCIPALES

### v2.0 - Rediseño Emocional (21 JUL 2026)
- ✅ Hero: Nueva pregunta emocional
- ✅ Nueva sección Antes/Después visual
- ✅ Miedos: Narrativa emocional profunda
- ✅ Testimonios: Estructura Antes/Ahora/Emoción
- ✅ CTA: Cambio a "SÍ, QUIERO DORMIR TRANQUILO"
- ✅ Estilos CSS para antes/después

### v1.5 - Integración Mercado Pago (21 JUL 2026)
- ✅ SDK Mercado Pago integrado
- ✅ Payment link configurado
- ✅ Credenciales en .env.local
- ✅ Botones redirigen a pago

### v1.4 - Logo y Tipografía (21 JUL 2026)
- ✅ Logo Posturalia agregado al header
- ✅ Tamaño logo aumentado (50px)
- ✅ Mayúsculas en títulos

### v1.3 - Animaciones y Contraste (21 JUL 2026)
- ✅ Botones con shine effect
- ✅ Cards con fade-in cascada
- ✅ Colores con mayor contraste
- ✅ Countdown box pulsante

### v1.0 - Landing inicial (20 JUL 2026)
- ✅ Estructura básica 8 secciones
- ✅ Dark mode tema
- ✅ Responsive design
- ✅ FAQ funcionando

---

## 📊 MÉTRICAS Y OBJETIVOS DE CONVERSIÓN

### Objetivo Principal
- **Lead → Apartado:** $2,000 MXN (pagado vía Mercado Pago)
- **Apartado → Inversión Total:** $14,750 MXN (4 pagos)

### Flujo de Conversión
```
Landing page visit (100%)
    ↓
Scroll a antes/después (?) %
    ↓
Ver miedos relacionados (?) %
    ↓
Click CTA "Dormir tranquilo" (?) %
    ↓
Completa pago Mercado Pago (?) %
    ↓
Recibe confirmación + WhatsApp de equipo (Conversión ✓)
```

### KPIs a Monitorear
- Tasa de click en "SÍ, QUIERO DORMIR TRANQUILO"
- Tasa de completar pago en Mercado Pago
- Tiempo promedio en página
- Scroll depth (% que ven cada sección)
- Dispositivo (desktop vs. mobile)

---

## 🔗 REFERENCIAS Y RECURSOS

### Documentación Interna
- `ASSETS_GUIDE.md` - Cómo agregar fotos/videos
- `MERCADO_PAGO_SETUP.md` - Setup detallado de pagos
- Plan emocional: `/Users/diegogarzamx/.claude/plans/mejoras-emocionales-landing.md`

### Externa
- [Mercado Pago Developers](https://www.mercadopago.com.mx/developers/)
- [SEP-CONOCER](https://www.conocer.gob.mx/)
- [RENEC Registro](https://www.gob.mx/renec)
- [Vercel Docs](https://vercel.com/docs)

### Git Repository
- GitHub: https://github.com/re-infinito/ec1375-posturalia
- Branch principal: `main`
- Usuario Git: Posturalia

---

## 💡 PRÓXIMAS MEJORAS SUGERIDAS

### Corto Plazo (1-2 semanas)
1. Agregar fotos/videos de testimonios reales
2. Video script de Fernando Villarreal (30-60s)
3. A/B testing en headlines
4. Analítica en Vercel

### Mediano Plazo (1 mes)
1. Página de éxito post-pago
2. Email automation (confirmación)
3. Pixel de conversión (Facebook, Google)
4. Landing en English (opcional)

### Largo Plazo (3+ meses)
1. Página de testimonios ampliada
2. Blog de tips para terapeutas
3. Calculadora de ROI (6 meses vs. inversión)
4. Community/grupo privado post-certificación

---

## 👤 CONTACTOS PRINCIPALES

**Founder/CEO:**
- Nombre: Diego Garza
- Email: re-infinito@outlook.com
- Teléfono: (disponible vía WhatsApp)

**Facilitador:**
- Nombre: Fernando Villarreal (Jose Fernando Villarreal Flores)
- Rol: Explica e invita a la certificación
- Video pendiente: 30-60s

**Equipo de Soporte:**
- WhatsApp: +52 81 3607 1342
- Email: posturalia.d817@gmail.com

---

## 🎯 INSTRUCCIONES PARA FUTURAS SESIONES

### Si necesitas editar la landing:

1. **Cambios de copy:**
   ```bash
   # Editar /Users/diegogarzamx/Desktop/EC1375/index.html
   # Hacer cambios
   git add index.html
   git commit -m "Descripción del cambio"
   git push origin main
   ```

2. **Agregar fotos/videos:**
   - Ver `ASSETS_GUIDE.md` para carpetas correctas
   - Compress antes de agregar
   - Actualizar rutas en HTML
   - Git add + commit + push

3. **Cambios de diseño:**
   - Editar CSS en `<style>` tag (líneas 11-821)
   - Test en mobile (375x812)
   - Commit + push

4. **Integrar nuevos pagos:**
   - Ver `MERCADO_PAGO_SETUP.md`
   - Actualizar .env.local (no commitar)
   - Cambiar payment link en función `handleMercadoPagoPay()`

5. **Monitorear conversiones:**
   - Vercel Analytics: https://vercel.com/re-infinito/ec1375-posturalia
   - Mercado Pago dashboard: Ver pagos completados

---

## 📝 NOTAS IMPORTANTES

- **NO commitar .env.local** - Solo crear localmente con credenciales reales
- **Mercado Pago link actualizado:** https://mpago.la/1QeeSHo (verificar periódicamente)
- **Countdown:** Actualmente fijo a 2026-07-21 23:59:59 (cambiar si es necesario)
- **Logo:** Espera que sea Logo Posturalia.jpeg en raíz del proyecto
- **Dominio:** Usar Vercel URL o configurar custom domain si se requiere

---

**Última actualización:** 21 de julio, 2026  
**Versión:** v2.0 (Rediseño Emocional)  
**Mantenedor:** Claude Code + Diego Garza
