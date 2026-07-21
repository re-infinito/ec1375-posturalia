# EC1375 - Certificación Profesional para Terapeutas

Landing page de conversión para la certificación EC1375 (SEP-CONOCER).

## Descripción

Plataforma de regularización profesional para terapeutas alternativas, chiropracticos y profesionales de salud complementaria en México.

**Objetivo:** Convertir leads en certificaciones EC1375 (de $2,000 apartado a $14,750 inversión total en 6 meses).

## Características

- ✅ Diseño dark mode elegante con colores Posturalia (Azul Cyan + Dorado)
- ✅ Estructura minimalista inspirada en agentelat.com
- ✅ Responsive mobile-first (100% adaptativo)
- ✅ Countdown regresivo en tiempo real
- ✅ Integración WhatsApp (CTAs funcionales)
- ✅ Opciones de pago (transferencia bancaria + link de pago)
- ✅ FAQ interactivo
- ✅ Animaciones sutiles y profesionales
- ✅ Optimizado para conversión (Core Web Vitals)

## Estructura

```
/EC1375
├── index.html          # Landing page principal
├── vercel.json         # Configuración Vercel
├── .gitignore          # Archivos a ignorar en Git
└── README.md           # Este archivo
```

## Despliegue

### Local
```bash
# Abre el archivo directamente en tu navegador
open index.html
```

### Vercel
```bash
# 1. Inicializar Git (ya hecho)
git init

# 2. Configurar usuario Git
git config user.email "tu@email.com"
git config user.name "Tu Nombre"

# 3. Agregar y hacer commit
git add .
git commit -m "Landing page EC1375 v2.0"

# 4. Conectar con GitHub
git remote add origin https://github.com/TU_USUARIO/ec1375.git
git branch -M main
git push -u origin main

# 5. En Vercel dashboard:
# - Conecta tu repositorio
# - Click en "Deploy"
# - ¡Listo!
```

## Configuración

### Datos Bancarios
Los datos bancarios están en la sección de pagos (línea ~900):
- Banco: Banorte
- Titular: Jose Fernando Villarreal Flores
- Cuenta: 4189143315836695
- CLABE: 072580006971824032

### WhatsApp
El teléfono está configurado en: `+52 81 3607 1342`

### Email
Email de contacto: `posturalia.d817@gmail.com`

## Análitica

Una vez desplegado en Vercel, agrega Google Analytics:
1. Ve a Google Analytics 4
2. Crea una propiedad para tu URL
3. Copia el ID de medición
4. Insértalo en el `<head>` del index.html

```html
<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-XXXXXXXXXX');
</script>
```

## Métricas Objetivo

- **CTR en "Apartar":** > 8%
- **Conversión a WhatsApp:** > 60%
- **Tiempo promedio:** > 90 segundos
- **Bounce rate:** < 40%
- **LCP (velocidad):** < 2.5s

## Desarrollo

Para realizar cambios:

1. Edita `index.html`
2. Prueba localmente (abre en navegador)
3. Haz commit: `git commit -am "Descripción del cambio"`
4. Push a GitHub: `git push`
5. Vercel desplegará automáticamente

## Autor

**Posturalia D 8:17**
- Sitio: https://posturalia.com
- WhatsApp: +52 81 3607 1342
- Email: posturalia.d817@gmail.com

---

**Versión:** 2.0
**Última actualización:** 21 de julio, 2026
