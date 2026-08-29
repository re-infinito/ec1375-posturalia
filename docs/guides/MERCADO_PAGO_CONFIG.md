# 🔧 Configuración de Mercado Pago - Back URLs y Redirecciones

**Última actualización:** 22 de julio, 2026  
**Versión:** 3.0 (Funnel Completo)  
**Status:** ⚠️ PENDIENTE - Configuración Manual Requerida

---

## 📋 Resumen Ejecutivo

Para que el funnel completo funcione correctamente, **Mercado Pago debe redirigir automáticamente** a los usuarios a las páginas apropiadas después de procesar el pago:

- ✅ **Pago exitoso** → `success.html` (celebración + WhatsApp + alineación)
- ❌ **Pago rechazado** → `failure.html` (retry options)
- ⏳ **Pago pendiente** → `pending.html` (verificación de estado)

Sin esta configuración, los usuarios permanecen en Mercado Pago y **NO ven la confirmación** ni se unen a WhatsApp automáticamente.

---

## 🔗 URLs de Retorno (Back URLs)

### URLs de Producción (VERCEL)

Estas son las URLs donde Mercado Pago redirigirá después del pago:

```
SUCCESS:  https://ec1375-posturalia.vercel.app/success.html
FAILURE:  https://ec1375-posturalia.vercel.app/failure.html
PENDING:  https://ec1375-posturalia.vercel.app/pending.html
```

### URLs Locales (Para Testing)

Si quieres testear en local:

```
SUCCESS:  http://localhost:3000/success.html
FAILURE:  http://localhost:3000/failure.html
PENDING:  http://localhost:3000/pending.html
```

---

## 📱 Paso a Paso: Configurar Back URLs en Mercado Pago

### **OPCIÓN 1: Vía Dashboard Mercado Pago (Recomendado)**

#### 1. Acceder al Dashboard
- Ir a: https://www.mercadopago.com.mx/
- Loguearse con cuenta: posturalia.d817@gmail.com
- Click en **"Tu Negocio"** → **"Mis integraciones"** → **"Links de pago"**

#### 2. Encontrar el Link de Pago
- Buscar: `1QeeSHo` (o el slug del link actual)
- Hacer click en **"Editar"**

#### 3. Configurar Back URLs
En la sección **"Configuración avanzada"** o **"Redirección"**:

- **URL de retorno para pagos exitosos:**
  ```
  https://ec1375-posturalia.vercel.app/success.html
  ```

- **URL de retorno para pagos rechazados:**
  ```
  https://ec1375-posturalia.vercel.app/failure.html
  ```

- **URL de retorno para pagos pendientes:**
  ```
  https://ec1375-posturalia.vercel.app/pending.html
  ```

#### 4. Opciones Adicionales
- ✅ **Auto-retorno:** Activar (opcional - retorna automáticamente en 5 segundos)
- ✅ **URL de retorno a tienda:** `https://ec1375-posturalia.vercel.app/index.html`

#### 5. Guardar Cambios
- Click en **"Guardar"**
- Esperar confirmación ✓

---

### **OPCIÓN 2: Vía API de Mercado Pago (Avanzado)**

Si prefieres hacerlo vía API con curl o postman:

#### Obtener ID del Link de Pago

```bash
curl -X GET "https://api.mercadopago.com/v1/payment_links" \
  -H "Authorization: Bearer APP_USR-2465263038921252-072114-fce315dcc9b9550df49c635de92e696f-724130873"
```

#### Actualizar Back URLs

```bash
curl -X PUT "https://api.mercadopago.com/v1/payment_links/{payment_link_id}" \
  -H "Authorization: Bearer APP_USR-2465263038921252-072114-fce315dcc9b9550df49c635de92e696f-724130873" \
  -H "Content-Type: application/json" \
  -d '{
    "back_urls": {
      "success": "https://ec1375-posturalia.vercel.app/success.html",
      "failure": "https://ec1375-posturalia.vercel.app/failure.html",
      "pending": "https://ec1375-posturalia.vercel.app/pending.html"
    },
    "auto_return": "approved"
  }'
```

---

## ✅ Verificación Post-Configuración

### Test en Staging

#### 1. Pago Exitoso (Tarjeta de Test)
- Ir a: https://mpago.la/1QeeSHo
- Click en "Comprar"
- Seleccionar método: Tarjeta de crédito
- Datos de test:
  ```
  Tarjeta:    4111 1111 1111 1111
  Vencimiento: 11/25
  CVV:        123
  Titular:    Test User
  ```
- Completar pago
- **Verificar:** ¿Se redirige a success.html con confetti y mensaje de confirmación?

#### 2. Pago Rechazado
- Datos de test (rechazada):
  ```
  Tarjeta:    4000 0000 0000 0002
  Vencimiento: 11/25
  CVV:        123
  ```
- Completar pago
- **Verificar:** ¿Se redirige a failure.html con opción de reintentar?

#### 3. Pago Pendiente
- Algunos métodos (transferencia, dinero en cuenta) generan estado "pending"
- **Verificar:** ¿Se redirige a pending.html con status tracker?

---

## 📊 Flujo Completo después de Configuración

```
USUARIO EN LANDING (index.html)
    ↓
    Click "SÍ, QUIERO DORMIR TRANQUILO"
    ↓ window.location.href = 'https://mpago.la/1QeeSHo'
    
MERCADO PAGO
    ↓
    [Usuario ingresa datos de pago]
    ↓
    [Procesa transacción]
    ↓
    IF pago = éxito
        → Redirige a success.html
    ELSE IF pago = rechazado
        → Redirige a failure.html
    ELSE IF pago = pendiente
        → Redirige a pending.html

SUCCESS.HTML
    ✅ Confetti animation
    ✅ Confirmación $2,000 MXN
    ✅ Botón "UNIRME A WHATSAPP"
    ✅ Botón "AGENDAR SESIÓN ALINEACIÓN"
    ✅ Timeline próximos pasos
    ↓
    [Usuario hace click en WhatsApp]
    ↓ https://wa.me/528136071342?text=...
    
WHATSAPP
    ✅ Usuario se une a grupo
    ✅ Recibe bienvenida automática
    ✅ Equipo lo contacta en 24-48h
    ✅ Agendación de sesión alineación ($4,250)
```

---

## 🔐 Credenciales (Para Referencia)

| Dato | Valor |
|------|-------|
| **Email Mercado Pago** | posturalia.d817@gmail.com |
| **Access Token** | APP_USR-2465263038921252-072114-fce315dcc9b9550df49c635de92e696f-724130873 |
| **Client ID** | 2465263038921252 |
| **Payment Link** | https://mpago.la/1QeeSHo |
| **Monto** | $2,000 MXN (apartado) |
| **Concepto** | EC1375 - Certificación Oficial |

---

## ⚠️ Puntos Críticos

### ✅ HACER

1. ✓ Configurar los 3 back URLs en MP dashboard
2. ✓ Testear con tarjetas de test (success + failure + pending)
3. ✓ Verificar que redirecciones funcionan en HTTPS (Vercel)
4. ✓ Validar que localhost:3000 redirige correctamente en desarrollo
5. ✓ Guardar configuración y documentar fecha

### ❌ NO HACER

1. ✗ No usar localhost URLs en producción
2. ✗ No cambiar el payment link sin avisar
3. ✗ No expirar el access token sin generar uno nuevo
4. ✗ No olvidar el `/success.html` en la URL (sin extension puede causar 404)

---

## 🆘 Troubleshooting

### "No se redirige a success.html después de pagar"

**Causa:** Back URLs no configuradas en MP dashboard

**Solución:**
1. Verificar que estés logueado con la cuenta correcta
2. Ir a "Mis Integraciones" → "Links de Pago"
3. Clickear "Editar" en el link correcto
4. Copiar y pegar las 3 URLs exactas
5. Guardar y esperar 5 minutos a que se propague

---

### "Dice 'Archivo no encontrado' (404) en success.html"

**Causa:** Vercel no tiene el archivo deployado

**Solución:**
1. Verificar que success.html está en el repositorio git
2. Hacer `git push origin main`
3. Verificar en Vercel dashboard que el archivo está en build
4. Esperar 30-60 segundos a que Vercel redeploy
5. Testear URL directa: https://ec1375-posturalia.vercel.app/success.html

---

### "localStorage no tiene los datos del quiz"

**Causa:** localStorage se limpia entre dominios o sesiones

**Solución:**
1. Verificar que quiz.html guardó correctamente: `localStorage.setItem('quizResponses', ...)`
2. En success.html, verificar: `localStorage.getItem('quizResponses')`
3. Si está vacío, mostrar specialty por defecto (ya codificado: 'terapia')
4. Considerar agregar webhook de Mercado Pago para persistir datos en servidor

---

## 📞 Soporte Mercado Pago

- **Centro de Ayuda:** https://www.mercadopago.com.mx/ayuda
- **Email:** support@mercadopago.com
- **Teléfono:** +52 55 5174-8000
- **Chat en vivo:** Disponible en dashboard

---

## ✨ Próximas Mejoras

1. **Webhook de Mercado Pago** - Guardar datos en servidor (no solo localStorage)
2. **Email Confirmación** - Enviar comprobante a email del usuario
3. **SMS Notification** - Notificar por SMS cuando se complete el pago
4. **Dashboard Admin** - Ver pagos completados en tiempo real
5. **Automáticas WhatsApp** - Mensaje automático desde API (sin manual)

---

**Checklist Final:**
- [ ] Credenciales MP guardadas de forma segura
- [ ] Back URLs configuradas en MP dashboard
- [ ] Testeado pago exitoso → success.html ✓
- [ ] Testeado pago rechazado → failure.html ✓
- [ ] Testeado pago pendiente → pending.html ✓
- [ ] Verificado enlace WhatsApp personalizado
- [ ] Verificado almacenamiento localStorage
- [ ] Documentado en este archivo

**Última Verificación:** _________________  
**Responsable:** _________________  
**Fecha:** _________________
