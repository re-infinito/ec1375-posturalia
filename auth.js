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
window.supabaseClient = supabaseClient;

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
       ya se escribió antes de llamar a esto, siempre). Guarda el último
       payload en _pendingSync para que flushSync() pueda forzar el envío
       inmediato (ver abajo). */
    syncToSupabase(column, data, curp, nombre) {
        clearTimeout(Auth._syncTimer);
        Auth._pendingSync = { column, data, curp, nombre };
        Auth._syncTimer = setTimeout(() => { Auth._flushPendingSync(); }, 800);
    },

    async _flushPendingSync() {
        clearTimeout(Auth._syncTimer);
        const pending = Auth._pendingSync;
        if (!pending) return;
        Auth._pendingSync = null;
        try {
            const session = await Auth.getSession();
            if (!session) return;
            const row = {
                user_id: session.user.id,
                curp: (pending.curp || '').trim().toUpperCase(),
                [pending.column]: pending.data,
                updated_at: new Date().toISOString()
            };
            if (pending.nombre) row.nombre = pending.nombre;
            const { error } = await supabaseClient
                .from('candidatos_ec1375')
                .upsert(row, { onConflict: 'user_id' });
            if (error) console.warn('Supabase sync falló (progreso local sigue intacto):', error);
        } catch (e) {
            console.warn('Supabase sync falló (progreso local sigue intacto):', e);
        }
    },

    /* Fuerza el envío inmediato de cualquier sync pendiente, sin esperar
       los 800ms del debounce. Usar antes de dejar que el candidato navegue
       a la siguiente página cuando lo que se acaba de guardar (ej. el
       estado de subida a Nextcloud) debe estar en Supabase ANTES de que
       esa siguiente página lo lea — si no, el debounce puede perderse
       porque la pestaña se descarga antes de que el timeout dispare. */
    async flushSync() {
        await Auth._flushPendingSync();
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

    /* Sube un certificado de formación previa al bucket privado
       'certificados-previos' (Storage). El caller arma `path` como
       `{user_id}/{timestamp}-{nombre-sanitizado}` para que la política RLS
       de storage.objects (auth.uid() = primer segmento de la ruta) aplique.
       Nunca lanza — el caller decide qué mostrar según `error`. */
    async uploadCertificado(file, path) {
        try {
            const { data, error } = await supabaseClient.storage.from('certificados-previos').upload(path, file);
            if (error) return { path: null, error };
            return { path: data.path, error: null };
        } catch (e) {
            return { path: null, error: e };
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
       UI compartida: correo → contraseña (iniciar sesión o crearla la
       primera vez) → verificar. Reutiliza .field-group / .btn-primary /
       .btn-secondary / .btn-full ya definidos en cada página — no
       inventa estilos nuevos.

       Reemplaza el código OTP por contraseña (5 de agosto → 12 de
       septiembre, 2026): un candidato que ya usó el sitio con OTP tiene
       cuenta en Supabase pero NUNCA le puso contraseña — para él, "Sí,
       ya tengo contraseña" fallará igual que si no existiera la cuenta,
       así que el mismo botón "¿Olvidaste tu contraseña?" (resetPasswordForEmail)
       también sirve para ponérsela por primera vez. No hace falta
       distinguir "cuenta vieja sin contraseña" de "olvidé mi contraseña"
       en el copy — el flujo de restablecer resuelve ambos casos igual.
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
                <button class="btn btn-primary btn-full" onclick="Auth._handleContinueEmail()">Continuar</button>
            `;
        } else if (step === 'choose') {
            container.innerHTML = `
                <p style="font-size:0.9rem;margin-bottom:16px;">Correo autorizado: <strong>${Auth._pendingEmail}</strong></p>
                ${errorHtml}
                <button class="btn btn-primary btn-full" onclick="Auth._renderAuthGateStep('signin')">Ya tengo contraseña</button>
                <button class="btn btn-secondary btn-full" onclick="Auth._renderAuthGateStep('signup')">Es mi primera vez aquí</button>
                <button class="btn btn-secondary btn-full" onclick="Auth._renderAuthGateStep('email')">Usar otro correo</button>
            `;
        } else if (step === 'signin') {
            container.innerHTML = `
                <p style="font-size:0.85rem;margin-bottom:14px;">Inicia sesión con <strong>${Auth._pendingEmail}</strong></p>
                <div class="field-group">
                    <label>Contraseña</label>
                    <input type="password" id="authPasswordInput" placeholder="Tu contraseña">
                </div>
                ${errorHtml}
                <button class="btn btn-primary btn-full" onclick="Auth._handleSignIn()">Iniciar sesión</button>
                <button class="btn btn-secondary btn-full" onclick="Auth._handleRequestReset()">¿Olvidaste tu contraseña?</button>
                <button class="btn btn-secondary btn-full" onclick="Auth._renderAuthGateStep('choose')">← Regresar</button>
            `;
        } else if (step === 'signup') {
            container.innerHTML = `
                <p style="font-size:0.85rem;margin-bottom:14px;">Crea tu contraseña para <strong>${Auth._pendingEmail}</strong></p>
                <div class="field-group">
                    <label>Contraseña (mínimo 6 caracteres)</label>
                    <input type="password" id="authPasswordInput" placeholder="Crea tu contraseña">
                </div>
                <div class="field-group">
                    <label>Confirma tu contraseña</label>
                    <input type="password" id="authPasswordConfirmInput" placeholder="Repite tu contraseña">
                </div>
                ${errorHtml}
                <button class="btn btn-primary btn-full" onclick="Auth._handleSignUp()">Crear contraseña y continuar</button>
                <button class="btn btn-secondary btn-full" onclick="Auth._renderAuthGateStep('choose')">← Regresar</button>
            `;
        } else if (step === 'reset_sent') {
            container.innerHTML = `
                <p style="font-size:0.9rem;margin-bottom:14px;">Si <strong>${Auth._pendingEmail}</strong> tiene cuenta, te enviamos un correo para poner tu contraseña. Revisa tu bandeja (y spam).</p>
                <button class="btn btn-secondary btn-full" onclick="Auth._renderAuthGateStep('email')">Usar otro correo</button>
            `;
        } else if (step === 'sending') {
            container.innerHTML = `<p style="text-align:center;font-size:0.9rem;">Verificando...</p>`;
        } else if (step === 'verifying') {
            container.innerHTML = `<p style="text-align:center;font-size:0.9rem;">Entrando...</p>`;
        } else if (step === 'not_authorized') {
            const waMessage = encodeURIComponent(`Hola, ya pagué mi apartado EC1375 pero mi correo (${Auth._pendingEmail}) no está autorizado en el sitio. ¿Me ayudan a activarlo?`);
            container.innerHTML = `
                <p style="font-size:0.9rem;margin-bottom:14px;">El correo <strong>${Auth._pendingEmail}</strong> no está autorizado todavía.</p>
                <p style="font-size:0.85rem;color:var(--text);margin-bottom:16px;">Si ya pagaste tu apartado, escríbenos por WhatsApp y lo activamos.</p>
                <a class="btn btn-primary btn-full" href="https://wa.me/528115026729?text=${waMessage}" target="_blank" style="display:block;text-decoration:none;text-align:center;">📱 Escribir por WhatsApp</a>
                <button class="btn btn-secondary btn-full" onclick="Auth._renderAuthGateStep('email')">Usar otro correo</button>
            `;
        }
    },

    async _handleContinueEmail() {
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
        Auth._renderAuthGateStep('choose');
    },

    async _handleSignIn() {
        const input = document.getElementById('authPasswordInput');
        const password = input.value || '';
        if (!password) { Auth._renderAuthGateStep('signin', 'Escribe tu contraseña.'); return; }
        Auth._renderAuthGateStep('verifying');
        try {
            const { data, error } = await supabaseClient.auth.signInWithPassword({ email: Auth._pendingEmail, password });
            if (error || !data.session) {
                Auth._renderAuthGateStep('signin', 'Contraseña incorrecta, o todavía no la has creado — usa "¿Olvidaste tu contraseña?" para ponerla.');
                return;
            }
            Auth._session = data.session;
            if (typeof Auth._authGateOnVerified === 'function') Auth._authGateOnVerified(data.session);
        } catch (e) {
            Auth._renderAuthGateStep('signin', 'No se pudo iniciar sesión. Intenta de nuevo.');
        }
    },

    async _handleSignUp() {
        const pInput = document.getElementById('authPasswordInput');
        const cInput = document.getElementById('authPasswordConfirmInput');
        const password = pInput.value || '';
        const confirm = cInput.value || '';
        if (password.length < 6) { Auth._renderAuthGateStep('signup', 'La contraseña debe tener al menos 6 caracteres.'); return; }
        if (password !== confirm) { Auth._renderAuthGateStep('signup', 'Las contraseñas no coinciden.'); return; }
        Auth._renderAuthGateStep('verifying');
        try {
            const { data, error } = await supabaseClient.auth.signUp({ email: Auth._pendingEmail, password });
            if (error) {
                Auth._renderAuthGateStep('signup', 'Este correo ya tiene cuenta — usa "Ya tengo contraseña", o "¿Olvidaste tu contraseña?" si no la recuerdas.');
                return;
            }
            if (!data.session) {
                /* No debería pasar con "Confirm email" desactivado en el dashboard
                   de Supabase (paso manual pendiente — ver Claude.md), pero si
                   llega a pasar no se deja al candidato varado. */
                Auth._renderAuthGateStep('signup', 'Cuenta creada. Revisa tu correo para confirmarla y vuelve a intentar iniciar sesión.');
                return;
            }
            Auth._session = data.session;
            if (typeof Auth._authGateOnVerified === 'function') Auth._authGateOnVerified(data.session);
        } catch (e) {
            Auth._renderAuthGateStep('signup', 'No se pudo crear tu contraseña. Intenta de nuevo.');
        }
    },

    async _handleRequestReset() {
        Auth._renderAuthGateStep('sending');
        try {
            await supabaseClient.auth.resetPasswordForEmail(Auth._pendingEmail, {
                redirectTo: location.origin + '/restablecer-password.html'
            });
        } catch (e) { /* no se le revela al candidato si la cuenta existe o no */ }
        Auth._renderAuthGateStep('reset_sent');
    },

    /* =========================================================
       UI compartida para páginas de administración (admin-precios.html,
       admin-index.html, ...): correo + contraseña universal del equipo
       → verificar contra is_admin() — el acceso de administrador no
       depende de haber pagado ninguna fase. Deliberadamente separada de
       renderAuthGate/_handleSignIn (no las reutiliza) para no mezclar
       los dos criterios de autorización.

       "Universal" = una sola cuenta de Supabase (un correo, una
       contraseña) que todo el equipo comparte para entrar — is_admin()
       se sigue consultando después del login como defensa en profundidad
       y para no romper si en el futuro se dan de alta cuentas de admin
       adicionales, cada una con su propia contraseña.
    ========================================================= */
    renderAdminGate(container, opts) {
        Auth._adminGateContainer = container;
        Auth._adminGateOnVerified = (opts && opts.onVerified) || null;
        Auth._renderAdminGateStep('login');
    },

    _renderAdminGateStep(step, message) {
        const container = Auth._adminGateContainer;
        if (!container) return;
        const errorHtml = message ? `<p style="color:var(--danger);font-size:0.85rem;margin-bottom:12px;">${message}</p>` : '';

        if (step === 'login') {
            container.innerHTML = `
                <div class="field-group">
                    <label>Correo de administrador</label>
                    <input type="email" id="adminEmailInput" placeholder="tu@correo.com">
                </div>
                <div class="field-group">
                    <label>Contraseña</label>
                    <input type="password" id="adminPasswordInput" placeholder="Contraseña de administrador">
                </div>
                ${errorHtml}
                <button class="btn btn-primary btn-full" onclick="Auth._handleAdminSignIn()">Entrar</button>
                <button class="btn btn-secondary btn-full" onclick="Auth._handleAdminRequestReset()">¿Olvidaste tu contraseña, o es tu primera vez?</button>
            `;
        } else if (step === 'verifying') {
            container.innerHTML = `<p style="text-align:center;font-size:0.9rem;">Verificando...</p>`;
        } else if (step === 'reset_sent') {
            container.innerHTML = `
                <p style="font-size:0.9rem;">Si ese correo tiene cuenta de administrador, te enviamos una liga para poner tu contraseña. Revisa tu bandeja (y spam).</p>
                <button class="btn btn-secondary btn-full" style="margin-top:14px;" onclick="Auth._renderAdminGateStep('login')">← Regresar</button>
            `;
        } else if (step === 'not_admin') {
            container.innerHTML = `
                <p style="font-size:0.9rem;">El correo <strong>${Auth._pendingAdminEmail}</strong> no tiene acceso de administrador.</p>
                <button class="btn btn-secondary btn-full" style="margin-top:14px;" onclick="Auth._renderAdminGateStep('login')">Intentar de nuevo</button>
            `;
        }
    },

    /* Mismo mecanismo que Auth._handleRequestReset() (candidatos) — sirve
       igual para poner la contraseña la primera vez que para recuperarla,
       y nunca revela si el correo existe o es admin. isAdmin() se sigue
       verificando después, en _handleAdminSignIn(); esta pantalla no es
       un atajo para saltárselo. */
    async _handleAdminRequestReset() {
        const emailInput = document.getElementById('adminEmailInput');
        const email = (emailInput && emailInput.value || '').trim().toLowerCase();
        if (!email || !email.includes('@')) { Auth._renderAdminGateStep('login', 'Escribe tu correo primero.'); return; }
        Auth._renderAdminGateStep('verifying');
        try {
            await supabaseClient.auth.resetPasswordForEmail(email, {
                redirectTo: location.origin + '/restablecer-password.html'
            });
        } catch (e) { /* no se revela si la cuenta existe */ }
        Auth._renderAdminGateStep('reset_sent');
    },

    async _handleAdminSignIn() {
        const emailInput = document.getElementById('adminEmailInput');
        const passInput = document.getElementById('adminPasswordInput');
        const email = (emailInput.value || '').trim().toLowerCase();
        const password = passInput.value || '';
        if (!email || !email.includes('@')) { Auth._renderAdminGateStep('login', 'Escribe un correo válido.'); return; }
        if (!password) { Auth._renderAdminGateStep('login', 'Escribe la contraseña.'); return; }
        Auth._pendingAdminEmail = email;
        Auth._renderAdminGateStep('verifying');
        try {
            const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
            if (error || !data.session) { Auth._renderAdminGateStep('login', 'Correo o contraseña incorrectos.'); return; }
            const esAdmin = await Auth.isAdmin(email);
            if (!esAdmin) {
                await supabaseClient.auth.signOut();
                Auth._renderAdminGateStep('not_admin');
                return;
            }
            Auth._session = data.session;
            if (typeof Auth._adminGateOnVerified === 'function') Auth._adminGateOnVerified(data.session);
        } catch (e) {
            Auth._renderAdminGateStep('login', 'No se pudo iniciar sesión. Intenta de nuevo.');
        }
    }
};

window.Auth = Auth;
