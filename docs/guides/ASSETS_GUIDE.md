# 📁 GUÍA: Dónde Agregar Fotos y Videos

## 📂 ESTRUCTURA DE CARPETAS

```
EC1375/
├── index.html
├── assets/
│   ├── images/
│   │   ├── logo/
│   │   │   └── logo-posturalia.png (ya existe)
│   │   ├── hero/
│   │   │   ├── terapeuta-consultorio.jpg
│   │   │   ├── consultorio-before.jpg
│   │   │   └── consultorio-after.jpg
│   │   ├── testimonials/
│   │   │   ├── maria-masajista.jpg
│   │   │   ├── alberto-terapeuta.jpg
│   │   │   └── laura-acupunturista.jpg
│   │   └── icons/
│   │       ├── miedo-1.svg
│   │       ├── miedo-2.svg
│   │       └── miedo-3.svg
│   └── videos/
│       ├── hero-video.mp4
│       ├── transformacion.mp4
│       └── testimonial-maria.mp4
```

---

## 🖼️ DÓNDE SE USAN EN LA LANDING

### 1. HERO SECTION
**Ubicación:** Arriba, fondo de hero

**Tipos de archivo:**
```
- IMAGEN: Terapeuta en consultorio profesional (1920x1080px)
- VIDEO: Terapeuta explicando el problema (30-60s, MP4)
```

**Carpeta:** `assets/images/hero/` o `assets/videos/`

**Cómo se vería en código:**
```html
<!-- OPCIÓN A: Imagen -->
<img src="assets/images/hero/terapeuta-consultorio.jpg" alt="Terapeuta">

<!-- OPCIÓN B: Video de fondo -->
<video autoplay muted loop>
    <source src="assets/videos/hero-video.mp4" type="video/mp4">
</video>
```

---

### 2. SECCIÓN "3 MIEDOS"
**Ubicación:** Junto a cada miedo

**Tipos de archivo:**
```
- Imágenes de iconos (SVG o PNG)
- O fotos representativas del miedo
```

**Carpeta:** `assets/images/icons/` o `assets/images/hero/`

**Ejemplo:**
```html
<div class="card">
    <img src="assets/images/icons/miedo-1.svg" alt="Miedo COFEPRIS">
    <h3>El miedo a COFEPRIS</h3>
</div>
```

---

### 3. SECCIÓN TESTIMONIOS
**Ubicación:** Avatar/foto de cada terapeuta

**Tipos de archivo:**
```
- FOTO: Perfil de cada terapeuta (300x300px, cuadrado)
- VIDEO: Testimonio en video (opcional, 30-60s)
```

**Carpeta:** `assets/images/testimonials/`

**Cómo se vería:**
```html
<!-- Foto del testimonio -->
<img src="assets/images/testimonials/maria-masajista.jpg" 
     alt="María - Masajista Holística"
     style="border-radius: 50%; width: 60px;">

<!-- O video embebido -->
<video width="300" height="300">
    <source src="assets/videos/testimonial-maria.mp4" type="video/mp4">
</video>
```

---

### 4. SECCIÓN TRANSFORMACIÓN
**Ubicación:** Antes y después visual

**Tipos de archivo:**
```
- Foto 1: Consultorio "antes" (sin certificado)
- Foto 2: Consultorio "después" (con certificado)
```

**Carpeta:** `assets/images/hero/`

**Ejemplo HTML:**
```html
<div class="before-after">
    <img src="assets/images/hero/consultorio-before.jpg" alt="Antes">
    <img src="assets/images/hero/consultorio-after.jpg" alt="Después">
</div>
```

---

## 📸 ESPECIFICACIONES TÉCNICAS

### Imágenes
```
HÉROE (Hero Section):
- Tamaño: 1920x1080px (mínimo)
- Peso: < 500KB
- Formato: JPG (fotografía) o PNG (gráfico)

TESTIMONIOS (Avatares):
- Tamaño: 300x300px (cuadrado)
- Peso: < 100KB
- Formato: JPG o PNG

ICONOS:
- Tamaño: 200x200px
- Peso: < 50KB
- Formato: SVG (escalable) o PNG
```

### Videos
```
HERO VIDEO:
- Duración: 30-60 segundos
- Resolución: 1920x1080p
- Peso: < 50MB
- Formato: MP4 (H.264)
- Bitrate: 5-8 Mbps

TESTIMONIOS:
- Duración: 20-30 segundos
- Resolución: 1280x720p
- Peso: < 30MB
- Formato: MP4
```

---

## 🚀 PASOS PARA AGREGAR

### PASO 1: Organiza tus archivos
```bash
# Crea una carpeta temporal en tu computadora
/Users/diegogarzamx/Desktop/EC1375-Assets/
├── hero-video.mp4
├── maria-foto.jpg
├── alberto-foto.jpg
├── laura-foto.jpg
├── terapeuta-consultorio.jpg
└── etc.
```

### PASO 2: Sube a la carpeta correcta
```bash
# Mueve archivos a:
/Users/diegogarzamx/Desktop/EC1375/assets/

# Ejemplo:
cp /Users/diegogarzamx/Desktop/EC1375-Assets/maria-foto.jpg \
   /Users/diegogarzamx/Desktop/EC1375/assets/images/testimonials/

cp /Users/diegogarzamx/Desktop/EC1375-Assets/hero-video.mp4 \
   /Users/diegogarzamx/Desktop/EC1375/assets/videos/
```

### PASO 3: Yo actualizo el código
Tú compartes conmigo:
- Nombre de cada archivo
- Qué foto/video es de quién
- Dónde debe aparecer

Yo integro en el HTML.

### PASO 4: Commit y deploy
```bash
git add assets/
git commit -m "Agregar fotos y videos de testimonios"
git push
# Vercel despliega automáticamente
```

---

## 📋 CHECKLIST DE ARCHIVOS A PREPARAR

### Fotos necesarias
- [ ] Foto María (terapeuta masajista)
- [ ] Foto Alberto (terapeuta manual)
- [ ] Foto Laura (acupunturista)
- [ ] Foto/imagen: Terapeuta en consultorio
- [ ] Foto/imagen: Consultorio "antes"
- [ ] Foto/imagen: Consultorio "después"

### Videos (Opcional pero recomendado)
- [ ] Video hero: Terapeuta explicando problema (30-60s)
- [ ] Video testimonio Maria (20-30s)
- [ ] Video testimonio Alberto (20-30s)
- [ ] Video testimonio Laura (20-30s)

---

## 💡 CONSEJOS

1. **Usa fotos reales de terapeutas** (no stock photos)
2. **Videos cortos** (máximo 60 segundos)
3. **Calidad HD mínima** (no pixelado)
4. **Comprime antes de subir** (usa TinyPNG o similar)
5. **Nombres descriptivos** (maria-masajista.jpg, no photo1.jpg)

---

## 📞 PRÓXIMO PASO

Cuando tengas los archivos listos:

1. **Comparte conmigo:**
   - Dónde están los archivos (Dropbox, Drive, etc.)
   - O zip con todos

2. **Dimelo:**
   - Nombre de cada archivo
   - Quién es cada foto
   - Qué video es de qué

3. **Yo:**
   - Descargo y organizo
   - Integro en landing
   - Desplegamos

---

**¿Tienes los archivos listos? 📸**
