/**
 * COMPONENTE: Grilla de Sesiones de Alineación
 * Muestra todas las sesiones disponibles en formato visual
 * Permite inscribirse con un clic
 */

class SesionesAlineacionComponent {
    constructor(containerId, onInscripcionExitosa) {
        this.container = document.getElementById(containerId);
        this.onInscripcionExitosa = onInscripcionExitosa || (() => {});
        this.sesiones = [];
        this.usuarioEmail = null;
        this.usuarioNombre = null;
    }

    /**
     * Inicializar: Cargar datos del usuario y sesiones
     */
    async init(userEmail, userName) {
        this.usuarioEmail = userEmail;
        this.usuarioNombre = userName;

        this.render('cargando');
        try {
            await this.cargarSesiones();
            this.render('sesiones');
        } catch (error) {
            console.error('Error en init:', error);
            this.render('error', error.message);
        }
    }

    /**
     * Cargar sesiones desde el backend
     */
    async cargarSesiones() {
        const resp = await fetch('/api/sesiones-alineacion');
        if (!resp.ok) throw new Error('No se pudieron cargar las sesiones');

        const data = await resp.json();
        this.sesiones = data.sesiones || [];
    }

    /**
     * Manejar inscripción
     */
    async inscribirse(sesionId) {
        const btn = document.getElementById(`btn-inscribir-${sesionId}`);
        const sesion = this.sesiones.find(s => s.id === sesionId);

        if (!sesion) return;
        if (sesion.llena) {
            alert('Lo siento, esta sesión está llena.');
            return;
        }

        btn.disabled = true;
        btn.textContent = '⏳ Procesando...';

        try {
            const resp = await fetch('/api/inscribir-alineacion', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sesion_id: sesionId,
                    usuario_email: this.usuarioEmail,
                    usuario_nombre: this.usuarioNombre
                })
            });

            const data = await resp.json();

            if (!resp.ok) {
                alert(`Error: ${data.error || 'Error desconocido'}`);
                btn.disabled = false;
                btn.textContent = '📝 Inscribirse';
                return;
            }

            // Éxito
            alert(`¡Inscripción confirmada! 🎉\n\nRevisa tu email para el link de Google Meet.`);

            // Actualizar UI
            sesion.inscritos += 1;
            sesion.cupos_disponibles -= 1;
            sesion.llena = sesion.cupos_disponibles <= 0;

            this.render('sesiones');
            this.onInscripcionExitosa(data);
        } catch (error) {
            alert('Error procesando inscripción: ' + error.message);
            btn.disabled = false;
            btn.textContent = '📝 Inscribirse';
        }
    }

    /**
     * Renderizar estado
     */
    render(estado, mensaje = '') {
        if (estado === 'cargando') {
            this.container.innerHTML = `
                <div style="text-align: center; padding: 40px 20px;">
                    <div style="font-size: 2rem; margin-bottom: 16px;">⏳</div>
                    <p>Cargando sesiones disponibles...</p>
                </div>
            `;
        } else if (estado === 'error') {
            this.container.innerHTML = `
                <div style="text-align: center; padding: 40px 20px; background: rgba(255,51,51,0.1); border: 1px solid #FF3333; border-radius: 8px;">
                    <div style="font-size: 2rem; margin-bottom: 16px;">⚠️</div>
                    <p>${mensaje}</p>
                </div>
            `;
        } else if (estado === 'sesiones') {
            this.renderSesiones();
        }
    }

    /**
     * Renderizar grilla de sesiones
     */
    renderSesiones() {
        if (this.sesiones.length === 0) {
            this.container.innerHTML = `
                <div style="text-align: center; padding: 40px 20px;">
                    <p>No hay sesiones disponibles en este momento.</p>
                    <p style="font-size: 0.9em; color: #888; margin-top: 12px;">
                        Escríbenos por WhatsApp para conocer próximas fechas.
                    </p>
                </div>
            `;
            return;
        }

        const html = `
            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 16px;">
                ${this.sesiones.map(sesion => this.renderTarjetaSesion(sesion)).join('')}
            </div>
        `;

        this.container.innerHTML = html;

        // Agregar event listeners
        this.sesiones.forEach(sesion => {
            const btn = document.getElementById(`btn-inscribir-${sesion.id}`);
            if (btn) {
                btn.addEventListener('click', () => this.inscribirse(sesion.id));
            }
        });
    }

    /**
     * Renderizar una tarjeta individual de sesión
     */
    renderTarjetaSesion(sesion) {
        const fecha = new Date(sesion.fecha + 'T00:00:00');
        const diasSemana = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SAB'];
        const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

        const diaNumero = fecha.getDate();
        const diaSemana = diasSemana[fecha.getDay()];
        const mes = meses[fecha.getMonth()];

        const cupoColor = sesion.llena ? '#FF3333' : sesion.cupos_disponibles <= 5 ? '#FFD700' : '#00FF88';
        const cupoTexto = sesion.llena ? '❌ LLENA' : `✓ ${sesion.cupos_disponibles} cupos`;

        const buttonHtml = sesion.llena
            ? `<button disabled style="
                width: 100%;
                padding: 12px;
                background: rgba(255,255,255,0.1);
                color: rgba(255,255,255,0.3);
                border: none;
                border-radius: 8px;
                cursor: not-allowed;
                font-weight: 600;
            ">Sesión Llena</button>`
            : `<button id="btn-inscribir-${sesion.id}" style="
                width: 100%;
                padding: 12px;
                background: #0088FF;
                color: white;
                border: none;
                border-radius: 8px;
                cursor: pointer;
                font-weight: 600;
                transition: all 0.3s ease;
            " onmouseover="this.style.background='#00CCFF'" onmouseout="this.style.background='#0088FF'">
                📝 Inscribirse
            </button>`;

        return `
            <div style="
                background: rgba(15, 20, 40, 1);
                border: 1px solid rgba(0, 136, 255, 0.3);
                border-radius: 12px;
                padding: 20px;
                display: flex;
                flex-direction: column;
            ">
                <!-- Fecha -->
                <div style="
                    background: linear-gradient(135deg, rgba(0,136,255,0.2), rgba(0,204,255,0.1));
                    border-radius: 8px;
                    padding: 12px;
                    text-align: center;
                    margin-bottom: 16px;
                    border-left: 4px solid #0088FF;
                ">
                    <div style="font-size: 2rem; font-weight: 700; color: #00CCFF;">
                        ${diaNumero}
                    </div>
                    <div style="font-size: 0.75rem; color: #888; text-transform: uppercase;">
                        ${diaSemana} ${mes}
                    </div>
                </div>

                <!-- Hora -->
                <div style="margin-bottom: 12px;">
                    <div style="font-size: 0.85rem; color: #888; margin-bottom: 4px;">🕐 Hora</div>
                    <div style="font-weight: 600; color: white;">
                        ${sesion.hora_inicio} - ${sesion.hora_fin}
                    </div>
                </div>

                <!-- Instructor -->
                ${sesion.instructor_nombre ? `
                    <div style="margin-bottom: 12px;">
                        <div style="font-size: 0.85rem; color: #888; margin-bottom: 4px;">👨‍🏫 Instructor</div>
                        <div style="font-weight: 500; color: #00CCFF;">${sesion.instructor_nombre}</div>
                    </div>
                ` : ''}

                <!-- Cupos -->
                <div style="margin-bottom: 16px; padding-bottom: 16px; border-bottom: 1px solid rgba(255,255,255,0.1);">
                    <div style="font-size: 0.85rem; color: #888; margin-bottom: 6px;">📊 Disponibilidad</div>
                    <div style="
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                    ">
                        <div style="
                            width: 100%;
                            height: 6px;
                            background: rgba(255,255,255,0.1);
                            border-radius: 3px;
                            overflow: hidden;
                            margin-right: 12px;
                        ">
                            <div style="
                                height: 100%;
                                background: ${cupoColor};
                                width: ${(sesion.inscritos / sesion.capacidad_maxima * 100)}%;
                                transition: width 0.3s ease;
                            "></div>
                        </div>
                        <div style="
                            font-size: 0.75rem;
                            font-weight: 600;
                            color: ${cupoColor};
                            white-space: nowrap;
                        ">
                            ${cupoTexto}
                        </div>
                    </div>
                    <div style="font-size: 0.75rem; color: #888; margin-top: 6px;">
                        ${sesion.inscritos} / ${sesion.capacidad_maxima} inscritos
                    </div>
                </div>

                <!-- Botón -->
                ${buttonHtml}

                <!-- Descripción -->
                ${sesion.descripcion ? `
                    <div style="
                        font-size: 0.8rem;
                        color: #888;
                        margin-top: 12px;
                        padding-top: 12px;
                        border-top: 1px solid rgba(255,255,255,0.1);
                    ">
                        ${sesion.descripcion}
                    </div>
                ` : ''}
            </div>
        `;
    }
}

// Exportar para uso en HTML
window.SesionesAlineacionComponent = SesionesAlineacionComponent;
