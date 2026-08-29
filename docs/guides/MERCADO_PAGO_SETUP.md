# 🔗 Integración de Mercado Pago

## Estado Actual

✅ SDK de Mercado Pago integrado  
✅ Botón de Mercado Pago agregado  
✅ Credenciales guardadas en `.env.local`  

## Credenciales Actuales

```
Public Key: APP_USR-2465263038921252-072114-fce315dcc9b9550df49c635de92e696f-724130873
Client ID: 2465263038921252
```

---

## 🚀 PRÓXIMOS PASOS PARA PRODUCCIÓN

### Opción 1: Usar Mercado Pago Link (Recomendado - Más Simple)

1. En Mercado Pago dashboard, ve a **Crear cobro**
2. Selecciona **Link de Pago**
3. Llena los datos:
   - Cantidad: $2000
   - Descripción: "Apartado Certificación EC1375"
4. Copia el enlace generado
5. Reemplaza en `handleMercadoPagoPay()`:

```javascript
function handleMercadoPagoPay() {
    window.location.href = 'https://link.mercadopago.com.mx/TU_LINK_AQUI';
}
```

---

### Opción 2: Usar Preference API (Más Profesional)

Requiere un backend (Node.js, Python, etc.)

**Pasos:**

1. **Crear backend endpoint** (ej: `/api/create-preference`)

```javascript
// Ejemplo con Node.js/Express
app.post('/api/create-preference', async (req, res) => {
    const mercadopago = require('mercadopago');
    
    mercadopago.configure({
        access_token: 'APP_USR-2465263038921252-072114-fce315dcc9b9550df49c635de92e696f-724130873'
    });

    let preference = {
        items: [
            {
                title: 'Apartado Certificación EC1375',
                quantity: 1,
                price: 2000,
            }
        ],
        back_urls: {
            success: 'https://ec1375-posturalia.vercel.app/success',
            failure: 'https://ec1375-posturalia.vercel.app/failure',
            pending: 'https://ec1375-posturalia.vercel.app/pending',
        },
        auto_return: 'approved',
    };

    mercadopago.preferences.create(preference)
        .then(function(response){
            res.json({ id: response.body.id });
        })
        .catch(function(error){
            console.log(error);
        });
});
```

2. **En el frontend**, obtén la preference ID y úsala

```javascript
async function handleMercadoPagoPay() {
    const response = await fetch('/api/create-preference', { method: 'POST' });
    const data = await response.json();
    
    mp.checkout({
        preference: {
            id: data.id
        },
        autoOpen: true,
    });
}
```

---

## 📌 CONFIGURACIÓN SEGURA

**Para Vercel, agrega variables de entorno:**

1. En Vercel dashboard → Settings → Environment Variables
2. Agrega:

```
MERCADO_PAGO_PUBLIC_KEY=APP_USR-2465263038921252-...
MERCADO_PAGO_ACCESS_TOKEN=APP_USR-2465263038921252-...
```

3. En `.env.local` (no commitear):

```
VITE_MERCADO_PAGO_PUBLIC_KEY=APP_USR-2465263038921252-...
```

---

## 🧪 TESTING

**En Mercado Pago hay modo sandbox:**

1. Ve a Credenciales en Mercado Pago
2. Copia credenciales de **SANDBOX** (no producción)
3. Usa esas para testing

**Tarjetas de prueba:**

```
Visa: 4111 1111 1111 1111
Vencimiento: 11/25
CVV: 123
```

---

## ✅ CHECKLIST

- [ ] Credenciales de Mercado Pago obtenidas ✅
- [ ] SDK integrado en HTML ✅
- [ ] Botón de pago agregado ✅
- [ ] Variables de entorno configuradas ✅
- [ ] Testing en sandbox completado
- [ ] Backend para Preference API creado (si lo necesitas)
- [ ] Variables de entorno en Vercel configuradas
- [ ] URL de éxito/fallo configurada

---

## 🔗 RECURSOS

- [Mercado Pago SDK](https://www.mercadopago.com.mx/developers/es/guides/sdks/official/js)
- [Preference API](https://www.mercadopago.com.mx/developers/es/reference/preferences/_checkout_preferences_post)
- [Wallet Brick](https://www.mercadopago.com.mx/developers/es/guides/checkout-bricks/wallet-brick)

---

**¿Cuál opción prefieres? 1️⃣ Link de Pago (simple) o 2️⃣ Preference API (profesional)?**
