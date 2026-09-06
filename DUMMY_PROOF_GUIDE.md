# Guía: Hacer la App "Dummy Proof" (A Prueba de Tontos)

## Objetivo
Garantizar que cada página de la aplicación muestre claramente qué campos faltan por llenar y por qué no se puede avanzar.

## Principios Fundamentales

### 1. **Validación Visual en Tiempo Real**
- ✓ **Verde**: Campo completado
- ○ **Gris**: Pendiente
- ✗ **Rojo**: Error o requerido pero vacío

### 2. **Feedback Inmediato**
- Mostrar estado de cada campo mientras se completa
- Actualizar el botón de siguiente en tiempo real
- Mostrar lista de campos faltantes si no se puede avanzar

### 3. **Mensajes Claros**
- "⚠️ Faltan los siguientes pasos para continuar:"
- Listar exactamente qué falta
- Explicar qué hacer para completar cada campo

## Implementación Estándar

### Estructura Base para Cada Página

```html
<!-- Campo con indicador de estado -->
<div class="field-group">
    <label style="display: flex; justify-content: space-between; align-items: center;">
        <span>Nombre Completo <span style="color:var(--danger);">*</span></span>
        <span id="status_nombre" style="font-size: 0.75rem; color: rgba(255,255,255,0.4);">
            ○ Pendiente
        </span>
    </label>
    <input type="text" id="f_nombre" placeholder="Ej. María González"
        style="border-color: rgba(255,255,255,0.15); border-width: 2px;">
</div>

<!-- Contenedor para mensajes de validación -->
<div id="validationStatus"></div>

<!-- Botón con validación -->
<button id="btnNext" class="btn btn-primary" disabled>Siguiente →</button>
```

### Funciones JavaScript Necesarias

```javascript
// 1. Obtener estado de validación
function getValidationStatus() {
    return {
        nombre: personalData.nombre?.trim().length > 0,
        email: personalData.email?.trim().length > 0,
        // ... más campos según página
        completo: /* true si todos los requeridos están llenos */
    };
}

// 2. Obtener lista de campos faltantes
function getMissingFields() {
    const status = getValidationStatus();
    const missing = [];
    
    if (!status.nombre) missing.push('Nombre completo');
    if (!status.email) missing.push('Correo electrónico');
    
    return missing;
}

// 3. Actualizar botón y mostrar validación
function updateSubmitButton() {
    const btn = document.getElementById('btnNext');
    const statusBox = document.getElementById('validationStatus');
    
    const status = getValidationStatus();
    btn.disabled = !status.completo;
    
    if (statusBox) {
        if (status.completo) {
            statusBox.innerHTML = '';
        } else {
            const missing = getMissingFields();
            statusBox.innerHTML = `
                <div style="background: rgba(255,51,51,0.08); border: 1px solid var(--danger); 
                            border-radius: 8px; padding: 14px; margin-bottom: 16px;">
                    <p style="color: var(--danger); font-weight: 600; margin-bottom: 10px;">
                        ⚠️ Faltan los siguientes campos:
                    </p>
                    <div style="color: var(--text); font-size: 0.85rem;">
                        ${missing.map(f => `<div>✓ ${f}</div>`).join('')}
                    </div>
                </div>
            `;
        }
    }
}

// 4. Actualizar indicador de campo individual
function updateFieldStatus(fieldId, fieldName) {
    const field = document.getElementById(fieldId);
    const status = document.getElementById(`status_${fieldName}`);
    
    if (!field || !status) return;
    
    const isComplete = field.value?.trim().length > 0;
    status.style.color = isComplete ? 'var(--success)' : 'rgba(255,255,255,0.4)';
    status.textContent = isComplete ? '✓ Completado' : '○ Pendiente';
    
    field.style.borderColor = isComplete ? 'var(--success)' : 'var(--danger)';
    
    updateSubmitButton();
}

// 5. Adjuntar listeners a campos
function attachFieldListeners() {
    ['nombre', 'email', 'curp'].forEach(field => {
        const el = document.getElementById('f_' + field);
        if (el) {
            el.addEventListener('input', () => {
                updateFieldStatus('f_' + field, field);
            });
        }
    });
}
```

## Páginas Prioritarias

### 1. **plan-evaluacion.html** ✅ HECHO
- Estado: Completamente mejorado con validación visual
- Cambios: Indicadores de estado, mensaje de campos faltantes

### 2. **autodiagnostico.html** 🔴 PENDIENTE
- Crítica porque es el primer paso
- Requiere mejorar 5 pasos: auth → personal → nda → elementos → firma
- Prioridad: ALTA

### 3. **examen-conocimientos.html** 🟡 IMPORTANTE
- Usuario debe responder preguntas
- Mostrar progreso: "5 de 20 respondidas"
- Mostrar qué preguntas faltan

### 4. **Otras páginas** 🟢 BAJA PRIORIDAD
- documentos-sesion.html
- encuesta-satisfaccion.html
- evidencias.html
- quiz.html

## Checklist de Implementación

Para cada página, verificar:

- [ ] Todos los campos requeridos tienen indicador visual (✓/○)
- [ ] El botón de siguiente muestra qué falta cuando está deshabilitado
- [ ] El borde del campo cambia de color (rojo/verde) según estado
- [ ] Hay un div para mostrar "Faltan los siguientes campos:"
- [ ] Los listeners se adjuntan correctamente
- [ ] La validación se actualiza en tiempo real
- [ ] El mensaje de error desaparece cuando se completa todo

## Colores Estándar

```css
--danger: #FF3333        /* Rojo para campos pendientes/error */
--success: #00FF88       /* Verde para campos completados */
--text: #D0D0D0         /* Gris para texto secundario */
```

## Ejemplos de Implementación

### Campo Texto Simple
```html
<div class="field-group">
    <label style="display: flex; justify-content: space-between;">
        <span>Email <span style="color:var(--danger);">*</span></span>
        <span id="status_email" style="color: rgba(255,255,255,0.4);">○ Pendiente</span>
    </label>
    <input type="email" id="f_email" style="border-width: 2px;">
</div>
```

### Checkbox con Validación
```html
<div class="checkbox-row" style="background: rgba(255,51,51,0.08); border: 1px solid var(--danger);">
    <input type="checkbox" id="acuerdoCheck">
    <label for="acuerdoCheck" style="color: var(--text);">
        ○ Acepto los términos y condiciones
    </label>
</div>
```

### Mostrar Progreso
```html
<div style="color: var(--text-bright); font-weight: 600;">
    Progreso: <span id="progress">0 de 5</span> campos completados
</div>
```

## Testing

Para cada página, verificar:

1. **Sin llenar nada**: Botón deshabilitado, lista de campos faltantes visible
2. **Llenar parcialmente**: Indicadores actualizarse en tiempo real
3. **Llenar completamente**: Lista desaparece, botón se habilita
4. **Luego vaciar un campo**: Lista reaparece, botón se deshabilita

## Notas Importantes

- **No usar alerta** (alert): Usar validación visual en la página
- **Actualizar en tiempo real**: No esperar a que el usuario envíe
- **Mensajes específicos**: "Nombre completo" no "Completa los campos"
- **Color + Icono + Texto**: Usar múltiples canales de información
- **Guardado automático**: Guardar en localStorage/Supabase con cada cambio

## Recursos

- `validation-utils.js`: Librería reutilizable con funciones comunes
- Variables CSS: `--danger`, `--success`, `--text`, `--text-bright`
- Patrón: Ver `plan-evaluacion.html` para ejemplo completo
