/* =========================================================
   auth.js — Supabase Auth (OTP por correo) + sync de candidatos_ec1375.

   Excepción deliberada a la convención de "páginas estáticas sin módulos
   compartidos" del proyecto (ver Claude.md): la lógica de sesión/RLS es
   justo el tipo de código de seguridad donde una copia desincronizada
   entre páginas es el modo de falla a evitar. Se carga como
   <script src="auth.js"> normal — sin build step, sin bundler — después
   del CDN de @supabase/supabase-js y antes del script propio de cada
   página.
========================================================= */

const SUPABASE_URL = 'https://numsuiuwrvpprhnxovmh.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im51bXN1aXV3cnZwcHJobnhvdm1oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc2OTg3MDAsImV4cCI6MjEwMzI3NDcwMH0.LA_MJzLcJyVtysxsJAmWwWzKwgynNm-f6ejGEaEpG1Y';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const Auth = {
    _session: null,
    _syncTimer: null,
    _pendingEmail: null,
    _authGateContainer: null,
    _authGateOnVerified: null,
    _pendingAdminEmail: null,
    _adminGateContainer: null,
    _adminGateOnVerified: null,

    async getSession() {
        const { data } = await supabaseClient.auth.getSession();
        Auth._session = data.session;
        return Auth._session;
    },

    hasSession() {
        return !!Auth._session;
    },

    async signOut() {
        await supabaseClient.auth.signOut();
        Auth._session = null;
    },

    /* Debounced, best-effort upsert — nunca bloquea ni lanza al candidato:
       si no hay sesión o falla la red, se ignora en silencio (localStorage
       ya se escribió antes de llamar a esto, siempre). */
    syncToSupabase(column, data, curp, nombre) {
        clearTimeout(Auth._syncTimer);
        Auth._syncTimer = setTimeout(async () => {
            try {
                const session = await Auth.getSession();
                if (!session) return;
                const row = {
                    user_id: session.user.id,
                    curp: (curp || '').trim().toUpperCase(),
                    [column]: data,
                    updated_at: new Date().toISOString()
                };
                if (nombre) row.nombre = nombre;
                const { error } = await supabaseClient
                    .from('candidatos_ec1375')
                    .upsert(row, { onConflict: 'user_id' });
                if (error) console.warn('Supabase sync falló (progreso local sigue intacto):', error);
            } catch (e) {
                console.warn('Supabase sync falló (progreso local sigue intacto):', e);
            }
        }, 800);
    },

    /* Lee la fila del candidato autenticado (RLS ya la limita a la propia). */
    async pullMyRow() {
        const session = await Auth.getSession();
        if (!session) return null;
        try {
            const { data, error } = await supabaseClient
                .from('candidatos_ec1375')
                .select('*')
                .eq('user_id', session.user.id)
                .maybeSingle();
            if (error) { console.warn('No se pudo leer tu progreso:', error); return null; }
            return data;
        } catch (e) {
            console.warn('No se pudo leer tu progreso:', e);
            return null;
        }
    },

    /* Solo pregunta sí/no por UN correo puntual — nunca expone la lista de
       quién pagó. Devuelve false ante cualquier error de red (falla cerrada:
       si no se puede confirmar, no se manda el código). */
    async isEmailAuthorized(email) {
        try {
            const { data, error } = await supabaseClient.rpc('is_email_authorized', { check_email: email });
            if (error) { console.warn('No se pudo verificar autorización:', error); return false; }
            return !!data;
        } catch (e) {
            console.warn('No se pudo verificar autorización:', e);
            return false;
        }
    },

    /* Igual que isEmailAuthorized() pero para una fase específica del
       proceso (Fase 4: 'registro' | 'alineacion' | 'evaluacion' | 'entrega').
       isEmailAuthorized() sigue existiendo como alias de fase 'registro'
       (ver is_email_authorized() en Supabase) — este método es el genérico
       para las páginas gateadas por las otras 3 fases. */
    async isPhaseAuthorized(email, fase) {
        try {
            const { data, error } = await supabaseClient.rpc('is_fase_authorized', { check_email: email, check_fase: fase });
            if (error) { console.warn('No se pudo verificar autorización de fase:', error); return false; }
            return !!data;
        } catch (e) {
            console.warn('No se pudo verificar autorización de fase:', e);
            return false;
        }
    },

    /* Solo pregunta sí/no por UN correo puntual, vía is_admin() (security
       definer) — nunca expone la lista completa de administradores. Falla
       cerrado: cualquier error de red devuelve false. */
    async isAdmin(email) {
        try {
            const { data, error } = await supabaseClient.rpc('is_admin', { check_email: email });
            if (error) { console.warn('No se pudo verificar acceso de administrador:', error); return false; }
            return !!data;
        } catch (e) {
            console.warn('No se pudo verificar acceso de administrador:', e);
            return false;
        }
    },

    /* Repuebla los 5 localStorage keys que ya usa cada página a partir de
       una fila de candidatos_ec1375 — usado por recuperar.html y por el
       paso 'auth' de autodiagnostico.html cuando alguien inicia sesión en
       un dispositivo sin progreso local (para no pisar avance ya guardado
       en la nube con un estado local vacío). No borra nada que no venga
       en la fila — solo escribe las columnas que sí existen. */
    restoreLocalStorageFromRow(row) {
        if (!row) return [];
        const restored = [];
        if (row.autodiagnostico_data) { localStorage.setItem('autodiagnosticoData', JSON.stringify(row.autodiagnostico_data)); restored.push('autodiagnosticoData'); }
        if (row.plan_evaluacion_data) { localStorage.setItem('planEvaluacionData', JSON.stringify(row.plan_evaluacion_data)); restored.push('planEvaluacionData'); }
        if (row.documentos_sesion_data) { localStorage.setItem('documentosSesionData', JSON.stringify(row.documentos_sesion_data)); restored.push('documentosSesionData'); }
        if (row.encuesta_data) { localStorage.setItem('encuestaSatisfaccionData', JSON.stringify(row.encuesta_data)); restored.push('encuestaSatisfaccionData'); }
        if (row.evidencias_data) { localStorage.setItem('evidenciasData', JSON.stringify(row.evidencias_data)); restored.push('evidenciasData'); }
        return restored;
    },

    /* =========================================================
       UI compartida: correo → código de 6 dígitos → verificar.
       Reutiliza .field-group / .btn-primary / .btn-secondary / .btn-full
       ya definidos en cada página — no inventa estilos nuevos.
    ========================================================= */
    renderAuthGate(container, opts) {
        Auth._authGateContainer = container;
        Auth._authGateOnVerified = (opts && opts.onVerified) || null;
        Auth._renderAuthGateStep('email');
    },

    _renderAuthGateStep(step, message) {
        const container = Auth._authGateContainer;
        if (!container) return;
        const errorHtml = message ? `<p style="color:var(--danger);font-size:0.85rem;margin-bottom:12px;">${message}</p>` : '';

        if (step === 'email') {
            container.innerHTML = `
                <div class="field-group">
                    <label>Correo electrónico</label>
                    <input type="email" id="authEmailInput" placeholder="tu@email.com">
                </div>
                ${errorHtml}
                <button class="btn btn-primary btn-full" onclick="Auth._handleSendOtp()">Enviar código</button>
            `;
        } else if (step === 'code') {
            container.innerHTML = `
                <p style="font-size:0.85rem;margin-bottom:14px;">Te enviamos un código a <strong>${Auth._pendingEmail}</strong>. Revisa tu correo (y spam).</p>
                <div class="field-group">
                    <label>Código de verificación</label>
                    <input type="text" id="authCodeInput" maxlength="12" inputmode="numeric" placeholder="Código" style="letter-spacing:4px;font-size:1.2rem;text-align:center;">
                </div>
                ${errorHtml}
                <button class="btn btn-primary btn-full" onclick="Auth._handleVerifyOtp()">Verificar</button>
                <button class="btn btn-secondary btn-full" onclick="Auth._renderAuthGateStep('email')">Usar otro correo</button>
            `;
        } else if (step === 'sending') {
            container.innerHTML = `<p style="text-align:center;font-size:0.9rem;">Enviando código...</p>`;
        } else if (step === 'verifying') {
            container.innerHTML = `<p style="text-align:center;font-size:0.9rem;">Verificando...</p>`;
        } else if (step === 'not_authorized') {
            const waMessage = encodeURIComponent(`Hola, ya pagué mi apartado EC1375 pero mi correo (${Auth._pendingEmail}) no está autorizado en el sitio. ¿Me ayudan a activarlo?`);
            container.innerHTML = `
                <p style="font-size:0.9rem;margin-bottom:14px;">El correo <strong>${Auth._pendingEmail}</strong> no está autorizado todavía.</p>
                <p style="font-size:0.85rem;color:var(--text);margin-bottom:16px;">Si ya pagaste tu apartado, escríbenos por WhatsApp y lo activamos.</p>
                <a class="btn btn-primary btn-full" href="https://wa.me/528136071342?text=${waMessage}" target="_blank" style="display:block;text-decoration:none;text-align:center;">📱 Escribir por WhatsApp</a>
                <button class="btn btn-secondary btn-full" onclick="Auth._renderAuthGateStep('email')">Usar otro correo</button>
            `;
        }
    },

    async _handleSendOtp() {
        const input = document.getElementById('authEmailInput');
        const email = (input.value || '').trim().toLowerCase();
        if (!email || !email.includes('@')) {
            Auth._renderAuthGateStep('email', 'Escribe un correo válido.');
            return;
        }
        Auth._pendingEmail = email;
        Auth._renderAuthGateStep('sending');
        const authorized = await Auth.isEmailAuthorized(email);
        if (!authorized) {
            Auth._renderAuthGateStep('not_authorized');
            return;
        }
        try {
            const { error } = await supabaseClient.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
            if (error) { Auth._renderAuthGateStep('email', 'No se pudo enviar el código. Intenta de nuevo.'); return; }
            Auth._renderAuthGateStep('code');
        } catch (e) {
            Auth._renderAuthGateStep('email', 'No se pudo enviar el código. Intenta de nuevo.');
        }
    },

    async _handleVerifyOtp() {
        const input = document.getElementById('authCodeInput');
        const token = (input.value || '').trim();
        if (!token) { Auth._renderAuthGateStep('code', 'Escribe el código.'); return; }
        Auth._renderAuthGateStep('verifying');
        try {
            const { data, error } = await supabaseClient.auth.verifyOtp({ email: Auth._pendingEmail, token, type: 'email' });
            if (error || !data.session) { Auth._renderAuthGateStep('code', 'Código incorrecto o expirado. Intenta de nuevo.'); return; }
            Auth._session = data.session;
            if (typeof Auth._authGateOnVerified === 'function') Auth._authGateOnVerified(data.session);
        } catch (e) {
            Auth._renderAuthGateStep('code', 'Código incorrecto o expirado. Intenta de nuevo.');
        }
    },

    /* =========================================================
       UI compartida para páginas de administración (admin-precios.html,
       admin-index.html, ...): mismo flujo correo → código → verificar,
       pero gateado por is_admin() en vez de isEmailAuthorized() — el
       acceso de administrador no depende de haber pagado ninguna fase.
       Deliberadamente separada de renderAuthGate/_handleSendOtp (no las
       reutiliza) para no mezclar los dos criterios de autorización.
    ========================================================= */
    renderAdminGate(container, opts) {
        Auth._adminGateContainer = container;
        Auth._adminGateOnVerified = (opts && opts.onVerified) || null;
        Auth._renderAdminGateStep('email');
    },

    _renderAdminGateStep(step, message) {
        const container = Auth._adminGateContainer;
        if (!container) return;
        const errorHtml = message ? `<p style="color:var(--danger);font-size:0.85rem;margin-bottom:12px;">${message}</p>` : '';

        if (step === 'email') {
            container.innerHTML = `
                <div class="field-group">
                    <label>Correo de administrador</label>
                    <input type="email" id="adminEmailInput" placeholder="tu@correo.com">
                </div>
                ${errorHtml}
                <button class="btn btn-primary btn-full" onclick="Auth._handleSendAdminOtp()">Enviar código</button>
            `;
        } else if (step === 'code') {
            container.innerHTML = `
                <p style="font-size:0.85rem;margin-bottom:14px;">Te enviamos un código a <strong>${Auth._pendingAdminEmail}</strong>.</p>
                <div class="field-group">
                    <label>Código de verificación</label>
                    <input type="text" id="adminCodeInput" maxlength="12" inputmode="numeric" placeholder="Código" style="letter-spacing:4px;font-size:1.2rem;text-align:center;">
                </div>
                ${errorHtml}
                <button class="btn btn-primary btn-full" onclick="Auth._handleVerifyAdminOtp()">Verificar</button>
                <button class="btn btn-secondary btn-full" onclick="Auth._renderAdminGateStep('email')">Usar otro correo</button>
            `;
        } else if (step === 'sending') {
            container.innerHTML = `<p style="text-align:center;font-size:0.9rem;">Enviando código...</p>`;
        } else if (step === 'verifying') {
            container.innerHTML = `<p style="text-align:center;font-size:0.9rem;">Verificando...</p>`;
        } else if (step === 'not_admin') {
            container.innerHTML = `
                <p style="font-size:0.9rem;">El correo <strong>${Auth._pendingAdminEmail}</strong> no tiene acceso de administrador.</p>
                <button class="btn btn-secondary btn-full" style="margin-top:14px;" onclick="Auth._renderAdminGateStep('email')">Usar otro correo</button>
            `;
        }
    },

    async _handleSendAdminOtp() {
        const input = document.getElementById('adminEmailInput');
        const email = (input.value || '').trim().toLowerCase();
        if (!email || !email.includes('@')) {
            Auth._renderAdminGateStep('email', 'Escribe un correo válido.');
            return;
        }
        Auth._pendingAdminEmail = email;
        Auth._renderAdminGateStep('sending');
        const esAdmin = await Auth.isAdmin(email);
        if (!esAdmin) {
            Auth._renderAdminGateStep('not_admin');
            return;
        }
        try {
            const { error } = await supabaseClient.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
            if (error) { Auth._renderAdminGateStep('email', 'No se pudo enviar el código. Intenta de nuevo.'); return; }
            Auth._renderAdminGateStep('code');
        } catch (e) {
            Auth._renderAdminGateStep('email', 'No se pudo enviar el código. Intenta de nuevo.');
        }
    },

    async _handleVerifyAdminOtp() {
        const input = document.getElementById('adminCodeInput');
        const token = (input.value || '').trim();
        if (!token) { Auth._renderAdminGateStep('code', 'Escribe el código.'); return; }
        Auth._renderAdminGateStep('verifying');
        try {
            const { data, error } = await supabaseClient.auth.verifyOtp({ email: Auth._pendingAdminEmail, token, type: 'email' });
            if (error || !data.session) { Auth._renderAdminGateStep('code', 'Código incorrecto o expirado. Intenta de nuevo.'); return; }
            Auth._session = data.session;
            if (typeof Auth._adminGateOnVerified === 'function') Auth._adminGateOnVerified(data.session);
        } catch (e) {
            Auth._renderAdminGateStep('code', 'Código incorrecto o expirado. Intenta de nuevo.');
        }
    }
};
