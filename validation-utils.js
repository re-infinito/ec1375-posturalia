/**
 * Sistema de validación reutilizable para toda la aplicación
 * Hacer la app "a prueba de tontos" (dummy proof)
 */

class ValidationUI {
    static createStatusIndicator(isComplete) {
        return `<span style="font-size: 0.75rem; color: ${isComplete ? 'var(--success)' : 'rgba(255,255,255,0.4)'};">
            ${isComplete ? '✓ Completado' : '○ Pendiente'}
        </span>`;
    }

    static createFieldLabel(label, isRequired = false, isComplete = false) {
        return `<label style="display: flex; justify-content: space-between; align-items: center; font-size: 0.9rem;">
            <span>${label}${isRequired ? ' <span style="color:var(--danger);">*</span>' : ''}</span>
            ${this.createStatusIndicator(isComplete)}
        </label>`;
    }

    static createMissingFieldsBox(missingFields) {
        if (!missingFields || missingFields.length === 0) return '';

        return `<div style="background: rgba(255,51,51,0.08); border: 1px solid var(--danger); border-radius: 8px; padding: 14px; margin-bottom: 16px;">
            <p style="color: var(--danger); font-weight: 600; margin-bottom: 10px; font-size: 0.9rem;">⚠️ Faltan los siguientes pasos para continuar:</p>
            <div style="color: var(--text); font-size: 0.85rem; line-height: 1.6;">
                ${missingFields.map(field => `<div style="margin-bottom: 6px;">✓ ${field}</div>`).join('')}
            </div>
        </div>`;
    }

    static createCheckboxWithStatus(id, label, isChecked, isRequired = true) {
        return `<div class="checkbox-row" style="background: ${isChecked ? 'rgba(0,255,136,0.08)' : 'rgba(255,51,51,0.08)'}; border: 1px solid ${isChecked ? 'var(--success)' : 'var(--danger)'};">
            <input type="checkbox" id="${id}" ${isChecked ? 'checked' : ''}>
            <label for="${id}" style="color: ${isChecked ? 'var(--success)' : 'var(--text)'};">
                ${isChecked ? '✓ ' : '○ '}${label}
            </label>
        </div>`;
    }

    static createInputWithStatus(id, value, placeholder, isComplete, isRequired = false) {
        return `<input type="text" id="${id}" value="${escapeHtml(value)}" placeholder="${placeholder}"
            style="border-color: ${isComplete ? 'var(--success)' : 'var(--danger)'}; border-width: 2px;">`;
    }

    static updateFieldStatus(fieldId, isComplete, statusContainerId) {
        const field = document.getElementById(fieldId);
        if (!field) return;

        // Actualizar borde
        field.style.borderColor = isComplete ? 'var(--success)' : 'var(--danger)';
        field.style.borderWidth = '2px';

        // Actualizar indicador si existe
        const container = statusContainerId ? document.getElementById(statusContainerId) : field.closest('.field-group');
        if (container) {
            const indicator = container.querySelector('[data-status-indicator]');
            if (indicator) {
                indicator.style.color = isComplete ? 'var(--success)' : 'rgba(255,255,255,0.4)';
                indicator.textContent = isComplete ? '✓ Completado' : '○ Pendiente';
            }
        }
    }
}

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
