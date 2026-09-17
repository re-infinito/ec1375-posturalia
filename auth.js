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

// Correo con navegación libre de todo el flujo de candidato — SOLO este.
// Ver "Nota de seguridad" en docs/superpowers/specs/2026-09-12-admin-flow-bypass-design.md.
const CANDIDATE_FLOW_BYPASS_EMAIL = 'paideia.tech@outlook.com';

/* Orden oficial de los 142 reactivos (antes copiado también en ruta-estudio.html) — el placeholder de
   Autodiagnóstico DEBE usar estas claves reales (no unas inventadas) para
   que Reforzamiento las reconozca. estudio.html traduce el resultado
   real del Autodiagnóstico a answeredYes/answeredNo buscando cada una de
   estas 142 claves en autodiagnosticoData.answers — con claves inventadas
   (admin_placeholder_N) ninguna coincide, así que ve 0/142 contestadas y
   manda al candidato bypass a "contestar todo" en vez de directo al
   resultado (0 brechas que reforzar, solo falta dar visto bueno). */
const REACTIVO_KEYS_REALES = ["e1_c0_g0_i0","e1_c0_g0_i1","e1_c0_g0_i2","e1_c0_g0_i3","e1_c0_g0_i4","e1_c0_g0_i5","e1_c1_g0_i0","e1_c1_g0_i1","e1_c1_g0_i2","e1_c1_g0_i3","e1_c1_g0_i4","e1_c1_g0_i5","e1_c1_g0_i6","e1_c1_g0_i7","e1_c1_g0_i8","e1_c1_g1_i0","e1_c1_g1_i1","e1_c1_g1_i2","e1_c1_g1_i3","e1_c2_g0_i0","e1_c2_g0_i1","e1_c2_g0_i2","e1_c3_g0_i0","e1_c3_g0_i1","e2_c0_g0_i0","e2_c0_g0_i1","e2_c0_g0_i2","e2_c0_g0_i3","e2_c0_g0_i4","e2_c0_g0_i5","e2_c0_g0_i6","e2_c0_g1_i0","e2_c0_g1_i1","e2_c0_g1_i2","e2_c0_g1_i3","e2_c0_g1_i4","e2_c0_g1_i5","e2_c0_g1_i6","e2_c0_g1_i7","e2_c0_g1_i8","e2_c0_g2_i0","e2_c0_g2_i1","e2_c0_g2_i2","e2_c0_g2_i3","e2_c0_g2_i4","e2_c0_g2_i5","e2_c0_g2_i6","e2_c0_g2_i7","e2_c0_g3_i0","e2_c0_g3_i1","e2_c0_g3_i2","e2_c0_g3_i3","e2_c0_g3_i4","e2_c0_g3_i5","e2_c0_g4_i0","e2_c0_g4_i1","e2_c0_g5_i0","e2_c0_g5_i1","e2_c0_g5_i2","e2_c0_g6_i0","e2_c0_g6_i1","e2_c0_g6_i2","e2_c0_g6_i3","e2_c0_g6_i4","e2_c1_g0_i0","e2_c1_g0_i1","e2_c1_g0_i2","e2_c1_g0_i3","e2_c1_g0_i4","e2_c1_g0_i5","e2_c1_g0_i6","e2_c1_g0_i7","e2_c1_g0_i8","e2_c1_g0_i9","e2_c1_g0_i10","e2_c1_g0_i11","e2_c2_g0_i0","e2_c2_g0_i1","e2_c2_g0_i2","e2_c2_g0_i3","e2_c2_g0_i4","e2_c3_g0_i0","e2_c3_g0_i1","e2_c3_g0_i2","e3_c0_g0_i0","e3_c0_g0_i1","e3_c0_g0_i2","e3_c0_g1_i0","e3_c0_g1_i1","e3_c0_g1_i2","e3_c0_g1_i3","e3_c0_g1_i4","e3_c0_g1_i5","e3_c0_g2_i0","e3_c0_g2_i1","e3_c0_g2_i2","e3_c0_g3_i0","e3_c0_g3_i1","e3_c0_g3_i2","e3_c0_g3_i3","e3_c0_g3_i4","e3_c0_g3_i5","e3_c0_g3_i6","e3_c1_g0_i0","e3_c1_g0_i1","e3_c1_g0_i2","e3_c1_g0_i3","e3_c1_g0_i4","e3_c1_g0_i5","e3_c1_g0_i6","e3_c1_g0_i7","e3_c1_g0_i8","e3_c1_g0_i9","e3_c1_g0_i10","e3_c1_g0_i11","e3_c1_g0_i12","e4_c0_g0_i0","e4_c0_g0_i1","e4_c0_g0_i2","e4_c0_g0_i3","e4_c0_g1_i0","e4_c0_g1_i1","e4_c0_g1_i2","e4_c0_g1_i3","e4_c0_g1_i4","e4_c0_g1_i5","e4_c0_g1_i6","e4_c0_g1_i7","e4_c0_g2_i0","e4_c0_g2_i1","e4_c0_g2_i2","e4_c0_g2_i3","e4_c1_g0_i0","e4_c1_g0_i1","e4_c1_g0_i2","e4_c1_g0_i3","e4_c1_g0_i4","e4_c1_g1_i0","e4_c1_g1_i1","e4_c1_g1_i2","e4_c1_g1_i3","e4_c1_g1_i4"];

/* "Mantener mi sesión iniciada" (15 sep 2026): Supabase guarda la sesión
   donde diga este adaptador. Por default localStorage (persiste al cerrar
   el navegador). Si el candidato desmarca la casilla al entrar, se guarda
   en sessionStorage (se borra al cerrar la pestaña/navegador). La elección
   vive en localStorage['paideia-remember'] ('0' = no recordar) y se lee en
   cada acceso, así que cambiarla justo antes de iniciar sesión manda la
   sesión nueva al lugar correcto. */
const REMEMBER_KEY = 'paideia-remember';
function _authStore() {
    try { return localStorage.getItem(REMEMBER_KEY) === '0' ? sessionStorage : localStorage; } catch (e) { return sessionStorage; }
}
const authStorageAdapter = {
    getItem: function (k) { try { return _authStore().getItem(k); } catch (e) { return null; } },
    setItem: function (k, v) { try { _authStore().setItem(k, v); } catch (e) { /* ignore */ } },
    removeItem: function (k) {
        try { localStorage.removeItem(k); } catch (e) { /* ignore */ }
        try { sessionStorage.removeItem(k); } catch (e) { /* ignore */ }
    }
};
/* Llave donde supabase-js guarda la sesión (su default: sb-<ref>-auth-token). */
const SUPABASE_STORAGE_KEY = 'sb-' + SUPABASE_URL.replace(/^https?:\/\//, '').split('.')[0] + '-auth-token';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { storage: authStorageAdapter, storageKey: SUPABASE_STORAGE_KEY } });
window.supabaseClient = supabaseClient;

const Auth = {
    /* Orden oficial de los 142 reactivos (n = índice + 1). Lo usa estudio.html
       (Biblioteca "Para ti" y la semilla del estado de Reforzamiento/Práctica). */
    REACTIVO_KEYS: REACTIVO_KEYS_REALES,

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
        Auth._apartarDatosDemo();   // el siguiente en entrar puede ser otra cuenta (ver "Datos demo" abajo)
    },

    /* Debounced, best-effort upsert — nunca bloquea ni lanza al candidato:
       si no hay sesión o falla la red, se ignora en silencio (localStorage
       ya se escribió antes de llamar a esto, siempre). Guarda el último
       payload en _pendingSync para que flushSync() pueda forzar el envío
       inmediato (ver abajo). */
    syncToSupabase(column, data, curp, nombre) {
        if (Auth._isBypassSession === true) Auth._conservarMarcaDemo(column);
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
            if (await Auth.isBypassSession()) return;
            if (Auth._pareceDatoDemo(pending)) {
                console.warn('Sync omitido: son datos de la cuenta demo, no de esta cuenta.');
                return;
            }
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

    /* Igual que uploadCertificado() pero al bucket privado 'fotos-candidato'
       — la foto oficial que exige la Ficha de Registro (RENAP/CONOCER).
       Mismo esquema de ruta y política RLS (primer segmento = user_id). */
    async uploadFotoCandidato(file, path) {
        try {
            const { data, error } = await supabaseClient.storage.from('fotos-candidato').upload(path, file, { upsert: true });
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

    /* Login-maestro (api/master-login.js): entra como CUALQUIER candidato
       ya autorizado (≥1 fase pagada) con una sola contraseña compartida
       con el equipo — pensado para ayudar a un candidato en llamada sin
       esperar un correo de restablecimiento. La contraseña maestra en sí
       vive SOLO como variable de entorno en Vercel — nunca en este
       archivo ni en ningún otro código que llegue al navegador — el
       endpoint es quien la compara. Se usa únicamente como respaldo
       silencioso dentro de _handleSignIn() (candidatos): si el password
       normal falla, se intenta esto antes de mostrar error. Nunca se
       ofrece en el gate de admin — ese acceso sigue siendo solo por
       cuenta real + is_admin(). */
    async masterLogin(email, password) {
        try {
            const resp = await fetch('/api/master-login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            const data = await resp.json();
            if (!resp.ok) return { session: null, error: data.error || 'No autorizado' };
            const { data: verifyData, error: verifyError } = await supabaseClient.auth.verifyOtp({
                email: data.email, token: data.hashed_token, type: 'magiclink'
            });
            if (verifyError || !verifyData.session) return { session: null, error: 'No se pudo iniciar sesión' };
            Auth._session = verifyData.session;
            return { session: verifyData.session, error: null };
        } catch (e) {
            return { session: null, error: 'Error de red' };
        }
    },

    /* Repuebla los 5 localStorage keys que ya usa cada página a partir de
       una fila de candidatos_ec1375 — usado por panel.html y por el
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
        /* Sesión guardada ("mantener mi sesión iniciada"): entrar directo sin
           pedir correo ni contraseña. Hasta el 15 sep este gate siempre
           arrancaba en el paso de correo aunque Supabase ya tuviera la
           sesión persistida — por eso había que teclear la contraseña en
           cada visita a panel.html. Para cambiar de cuenta: "Cerrar sesión". */
        Auth._renderAuthGateStep('verifying');
        Auth.getSession().then(function (session) {
            if (session && session.user && typeof Auth._authGateOnVerified === 'function') {
                Auth._authGateOnVerified(session);
            } else {
                Auth._renderAuthGateStep('email');
            }
        }).catch(function () { Auth._renderAuthGateStep('email'); });
    },

    /* Lee la casilla "Mantener mi sesión iniciada" (si existe en el paso
       actual) y fija la preferencia ANTES de iniciar sesión. */
    _applyRememberChoice() {
        const cb = document.getElementById('authRememberInput');
        const remember = !cb || cb.checked;
        try {
            if (remember) localStorage.removeItem(REMEMBER_KEY); else localStorage.setItem(REMEMBER_KEY, '0');
        } catch (e) { /* ignore */ }
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
                <label style="display:flex;align-items:center;gap:8px;font-size:0.85rem;margin:-4px 0 14px;cursor:pointer;">
                    <input type="checkbox" id="authRememberInput" checked style="width:auto;margin:0;"> Mantener mi sesión iniciada en este dispositivo
                </label>
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
                <label style="display:flex;align-items:center;gap:8px;font-size:0.85rem;margin:-4px 0 14px;cursor:pointer;">
                    <input type="checkbox" id="authRememberInput" checked style="width:auto;margin:0;"> Mantener mi sesión iniciada en este dispositivo
                </label>
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
        const authorized = Auth.isFlowBypassAdmin(email) || await Auth.isEmailAuthorized(email);
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
        Auth._applyRememberChoice();
        Auth._renderAuthGateStep('verifying');
        try {
            const { data, error } = await supabaseClient.auth.signInWithPassword({ email: Auth._pendingEmail, password });
            if (!error && data.session) {
                Auth._session = data.session;
                if (typeof Auth._authGateOnVerified === 'function') Auth._authGateOnVerified(data.session);
                return;
            }
            /* Respaldo silencioso: si lo escrito no es la contraseña real de
               este candidato, se intenta como contraseña maestra antes de
               declarar error — ver Auth.masterLogin(). Nunca se distingue
               en el copy cuál de los dos caminos fue: mismo mensaje de
               error para ambos, para no delatar que existe un segundo
               camino. */
            const master = await Auth.masterLogin(Auth._pendingEmail, password);
            if (master.session) {
                if (typeof Auth._authGateOnVerified === 'function') Auth._authGateOnVerified(master.session);
                return;
            }
            Auth._renderAuthGateStep('signin', 'Contraseña incorrecta, o todavía no la has creado — usa "¿Olvidaste tu contraseña?" para ponerla.');
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
            Auth._applyRememberChoice();
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
       admin-index.html, ...): correo → is_admin() → elegir "ya tengo
       contraseña" / "es mi primera vez", igual que renderAuthGate pero
       gateado por is_admin() en vez de isEmailAuthorized() — el acceso
       de administrador no depende de haber pagado ninguna fase.
       Deliberadamente separada de renderAuthGate (no la reutiliza) para
       no mezclar los dos criterios de autorización.

       is_admin() se verifica ANTES de ofrecer el paso de contraseña (no
       después de un intento de login fallido) — así "Es mi primera vez"
       tiene a dónde ir de verdad (signUp) en vez de solo un reset que no
       manda nada si la cuenta de Supabase todavía no existe. Se vuelve a
       verificar tras signInWithPassword/signUp como defensa en
       profundidad, con signOut inmediato si deja de ser cierto.

       "Universal" = una sola cuenta de Supabase (un correo, una
       contraseña) que todo el equipo comparte para entrar — nada en el
       código impide dar de alta cuentas de admin adicionales después,
       cada una con su propia contraseña, is_admin() ya las reconocería.
    ========================================================= */
    renderAdminGate(container, opts) {
        Auth._adminGateContainer = container;
        Auth._adminGateOnVerified = (opts && opts.onVerified) || null;
        /* Sesión guardada de un correo admin: entrar directo (15 sep, misma
           corrección que renderAuthGate). Una sesión de un correo NO admin
           cae al paso de correo como siempre. */
        Auth._renderAdminGateStep('verifying');
        Auth.getSession().then(function (session) {
            var email = session && session.user && session.user.email;
            if (!email) { Auth._renderAdminGateStep('email'); return null; }
            return Auth.isAdmin(email).then(function (es) {
                if (es && typeof Auth._adminGateOnVerified === 'function') Auth._adminGateOnVerified(session);
                else Auth._renderAdminGateStep('email');
            });
        }).catch(function () { Auth._renderAdminGateStep('email'); });
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
                <button class="btn btn-primary btn-full" onclick="Auth._handleAdminContinueEmail()">Continuar</button>
            `;
        } else if (step === 'choose') {
            container.innerHTML = `
                <p style="font-size:0.9rem;margin-bottom:16px;">Correo de administrador: <strong>${Auth._pendingAdminEmail}</strong></p>
                ${errorHtml}
                <button class="btn btn-primary btn-full" onclick="Auth._renderAdminGateStep('signin')">Ya tengo contraseña</button>
                <button class="btn btn-secondary btn-full" onclick="Auth._renderAdminGateStep('signup')">Es mi primera vez aquí</button>
                <button class="btn btn-secondary btn-full" onclick="Auth._renderAdminGateStep('email')">Usar otro correo</button>
            `;
        } else if (step === 'signin') {
            container.innerHTML = `
                <p style="font-size:0.85rem;margin-bottom:14px;">Inicia sesión con <strong>${Auth._pendingAdminEmail}</strong></p>
                <div class="field-group">
                    <label>Contraseña</label>
                    <input type="password" id="adminPasswordInput" placeholder="Tu contraseña">
                </div>
                <label style="display:flex;align-items:center;gap:8px;font-size:0.85rem;margin:-4px 0 14px;cursor:pointer;">
                    <input type="checkbox" id="authRememberInput" checked style="width:auto;margin:0;"> Mantener mi sesión iniciada en este dispositivo
                </label>
                ${errorHtml}
                <button class="btn btn-primary btn-full" onclick="Auth._handleAdminSignIn()">Iniciar sesión</button>
                <button class="btn btn-secondary btn-full" onclick="Auth._handleAdminRequestReset()">¿Olvidaste tu contraseña?</button>
                <button class="btn btn-secondary btn-full" onclick="Auth._renderAdminGateStep('choose')">← Regresar</button>
            `;
        } else if (step === 'signup') {
            container.innerHTML = `
                <p style="font-size:0.85rem;margin-bottom:14px;">Crea tu contraseña para <strong>${Auth._pendingAdminEmail}</strong></p>
                <div class="field-group">
                    <label>Contraseña (mínimo 6 caracteres)</label>
                    <input type="password" id="adminPasswordInput" placeholder="Crea tu contraseña">
                </div>
                <div class="field-group">
                    <label>Confirma tu contraseña</label>
                    <input type="password" id="adminPasswordConfirmInput" placeholder="Repite tu contraseña">
                </div>
                <label style="display:flex;align-items:center;gap:8px;font-size:0.85rem;margin:-4px 0 14px;cursor:pointer;">
                    <input type="checkbox" id="authRememberInput" checked style="width:auto;margin:0;"> Mantener mi sesión iniciada en este dispositivo
                </label>
                ${errorHtml}
                <button class="btn btn-primary btn-full" onclick="Auth._handleAdminSignUp()">Crear contraseña y entrar</button>
                <button class="btn btn-secondary btn-full" onclick="Auth._renderAdminGateStep('choose')">← Regresar</button>
            `;
        } else if (step === 'reset_sent') {
            container.innerHTML = `
                <p style="font-size:0.9rem;">Te enviamos una liga a <strong>${Auth._pendingAdminEmail}</strong> para poner tu contraseña. Revisa tu bandeja (y spam).</p>
                <button class="btn btn-secondary btn-full" style="margin-top:14px;" onclick="Auth._renderAdminGateStep('email')">← Regresar</button>
            `;
        } else if (step === 'verifying') {
            container.innerHTML = `<p style="text-align:center;font-size:0.9rem;">Verificando...</p>`;
        } else if (step === 'not_admin') {
            container.innerHTML = `
                <p style="font-size:0.9rem;">El correo <strong>${Auth._pendingAdminEmail}</strong> no tiene acceso de administrador.</p>
                <button class="btn btn-secondary btn-full" style="margin-top:14px;" onclick="Auth._renderAdminGateStep('email')">Intentar de nuevo</button>
            `;
        }
    },

    async _handleAdminContinueEmail() {
        const input = document.getElementById('adminEmailInput');
        const email = (input.value || '').trim().toLowerCase();
        if (!email || !email.includes('@')) { Auth._renderAdminGateStep('email', 'Escribe un correo válido.'); return; }
        Auth._pendingAdminEmail = email;
        Auth._renderAdminGateStep('verifying');
        const esAdmin = await Auth.isAdmin(email);
        if (!esAdmin) { Auth._renderAdminGateStep('not_admin'); return; }
        Auth._renderAdminGateStep('choose');
    },

    async _handleAdminSignIn() {
        const passInput = document.getElementById('adminPasswordInput');
        const password = passInput.value || '';
        if (!password) { Auth._renderAdminGateStep('signin', 'Escribe tu contraseña.'); return; }
        Auth._applyRememberChoice();
        Auth._renderAdminGateStep('verifying');
        try {
            const { data, error } = await supabaseClient.auth.signInWithPassword({ email: Auth._pendingAdminEmail, password });
            if (error || !data.session) {
                Auth._renderAdminGateStep('signin', 'Contraseña incorrecta, o todavía no la has creado — usa "¿Olvidaste tu contraseña?" para ponerla.');
                return;
            }
            const esAdmin = await Auth.isAdmin(Auth._pendingAdminEmail);
            if (!esAdmin) { await supabaseClient.auth.signOut(); Auth._renderAdminGateStep('not_admin'); return; }
            Auth._session = data.session;
            if (typeof Auth._adminGateOnVerified === 'function') Auth._adminGateOnVerified(data.session);
        } catch (e) {
            Auth._renderAdminGateStep('signin', 'No se pudo iniciar sesión. Intenta de nuevo.');
        }
    },

    async _handleAdminSignUp() {
        const pInput = document.getElementById('adminPasswordInput');
        const cInput = document.getElementById('adminPasswordConfirmInput');
        const password = pInput.value || '';
        const confirm = cInput.value || '';
        if (password.length < 6) { Auth._renderAdminGateStep('signup', 'La contraseña debe tener al menos 6 caracteres.'); return; }
        if (password !== confirm) { Auth._renderAdminGateStep('signup', 'Las contraseñas no coinciden.'); return; }
        Auth._applyRememberChoice();
        Auth._renderAdminGateStep('verifying');
        try {
            const { data, error } = await supabaseClient.auth.signUp({ email: Auth._pendingAdminEmail, password });
            if (error) {
                Auth._renderAdminGateStep('signup', 'Este correo ya tiene cuenta — usa "Ya tengo contraseña", o "¿Olvidaste tu contraseña?" si no la recuerdas.');
                return;
            }
            if (!data.session) {
                Auth._renderAdminGateStep('signup', 'Cuenta creada. Revisa tu correo para confirmarla y vuelve a intentar iniciar sesión.');
                return;
            }
            const esAdmin = await Auth.isAdmin(Auth._pendingAdminEmail);
            if (!esAdmin) { await supabaseClient.auth.signOut(); Auth._renderAdminGateStep('not_admin'); return; }
            Auth._session = data.session;
            if (typeof Auth._adminGateOnVerified === 'function') Auth._adminGateOnVerified(data.session);
        } catch (e) {
            Auth._renderAdminGateStep('signup', 'No se pudo crear tu contraseña. Intenta de nuevo.');
        }
    },

    /* Mismo mecanismo que Auth._handleRequestReset() (candidatos). Solo se
       ofrece dentro de 'signin' (ya se confirmó is_admin() en el paso de
       correo), así que aquí sí se puede prometer que el correo llega —
       ya no hace falta el "si tiene cuenta" del texto viejo, que no
       distinguía "no eres admin" de "eres admin pero aún no existe tu
       cuenta de Supabase" (ese segundo caso se resuelve con "Es mi
       primera vez", no con este botón). */
    async _handleAdminRequestReset() {
        Auth._renderAdminGateStep('verifying');
        try {
            await supabaseClient.auth.resetPasswordForEmail(Auth._pendingAdminEmail, {
                redirectTo: location.origin + '/restablecer-password.html'
            });
        } catch (e) { /* aunque falle, no se le deja al admin sin salida visible */ }
        Auth._renderAdminGateStep('reset_sent');
    },

    /* =========================================================
       Bypass de navegación libre — SOLO paideia.tech@outlook.com.
       Independiente de admins/is_admin() (esa tabla sigue siendo solo
       para admin-precios.html/admin-index.html). No otorga ningún
       privilegio de escritura real — ver "Nota de seguridad" en
       docs/superpowers/specs/2026-09-12-admin-flow-bypass-design.md.
    ========================================================= */
    /* Chequeo local, PRE-sesión (todavía no hay JWT que verificar server-side)
       — usado solo en _handleContinueEmail() para decidir si mostrar el paso
       de contraseña sin exigir pago de "registro". No usar esto para decidir
       si YA HAY una sesión con bypass — para eso ver isBypassSession() abajo,
       que sí verifica server-side. */
    isFlowBypassAdmin(email) {
        return !!email && email.trim().toLowerCase() === CANDIDATE_FLOW_BYPASS_EMAIL;
    },

    /* Verifica SERVER-SIDE (RPC is_current_user_flow_bypass_admin(), que lee
       auth.jwt()->>'email' — el claim ya verificado por PostgREST) si la
       sesión activa es la cuenta con bypass. Deliberadamente NO compara
       session.user.email del lado del cliente: ese valor se puede falsificar
       escribiendo directamente en localStorage un objeto de sesión sin firma
       válida, lo que le daría el bypass a cualquiera con una sesión real
       (aunque fuera una cuenta recién creada sin pagar nada) con solo poner
       Auth._isBypassSession = true en la consola del navegador. Falla
       cerrado (como is_email_authorized/is_fase_authorized/is_admin): si la
       función SQL todavía no existe o hay error de red, no hay bypass para
       nadie. Memoiza en Auth._isBypassSession — cada página lo llama una vez
       y reutiliza el valor en el resto de sus checks sin volver a llamarlo. */
    async isBypassSession() {
        const session = await Auth.getSession();
        let verificado = false;
        if (!session) {
            Auth._isBypassSession = false;
        } else {
            try {
                const { data, error } = await supabaseClient.rpc('is_current_user_flow_bypass_admin');
                Auth._isBypassSession = !error && !!data;
                verificado = !error;
            } catch (e) {
                Auth._isBypassSession = false;
            }
        }
        /* Datos demo según lo que respondió el servidor (ver _apartarDatosDemo). */
        if (Auth._isBypassSession) Auth._restaurarDatosDemo();
        else if (verificado) Auth._descartarDatosDemo();
        else Auth._apartarDatosDemo();
        return Auth._isBypassSession;
    },

    /* =========================================================
       DATOS DEMO (solo cuenta bypass) — 15 sep 2026
       Diego graba videos para los candidatos con esta cuenta: todo el flujo
       debe estar precargado con datos FICTICIOS y sin ningún candado, para
       explicar rápido qué llena cada quien. Cada objeto lleva `_demo: true`
       para distinguirlo de datos reales de otro candidato que pudieran
       quedar en el mismo navegador (esos SÍ se sobreescriben; los datos demo
       ya sembrados NO, para que lo que el admin edite durante el video
       persista entre páginas). "🔄 Reiniciar demo" (sidebar) vuelve a sembrar
       todo desde cero.
    ========================================================= */
    DEMO_NOMBRE: 'Ana Sofía Demo Ramírez',
    DEMO_CURP: 'DERA900515MNLMMN08',
    DEMO_LOCAL_KEYS: ['autodiagnosticoData', 'planEvaluacionData', 'documentosSesionData',
                      'encuestaSatisfaccionData', 'evidenciasData', 'examenConocimientosData', 'ec1375-state', 'guionChecklistState',
                      'ec1375-biblioteca-vistas', 'ec1375-biblioteca-ultima', 'ec1375-biblioteca-guia',
                      'ec1375-alineacion-vistas', 'paideia-demo-apartado'],
    DEMO_APARTADO: 'paideia-demo-apartado',

    /* Foto de credencial ficticia (silueta) generada en canvas → JPEG real,
       para que el paso "personal" del Autodiagnóstico la acepte y jsPDF la
       pueda incrustar en la Ficha de Registro RENAP. */
    _demoFotoDataUrl() {
        try {
            const c = document.createElement('canvas'); c.width = 300; c.height = 390;
            const ctx = c.getContext('2d');
            ctx.fillStyle = '#e8edf6'; ctx.fillRect(0, 0, 300, 390);
            ctx.fillStyle = '#0a2a6b';
            ctx.beginPath(); ctx.arc(150, 140, 62, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.moveTo(40, 390); ctx.quadraticCurveTo(150, 190, 260, 390); ctx.closePath(); ctx.fill();
            ctx.fillStyle = '#ffffff'; ctx.font = 'bold 22px sans-serif'; ctx.textAlign = 'center';
            ctx.fillText('FOTO DEMO', 150, 350);
            return c.toDataURL('image/jpeg', 0.85);
        } catch (e) { return null; }
    },

    _demoFecha(diasDesdeHoy) {
        const d = new Date(); d.setDate(d.getDate() + (diasDesdeHoy || 0));
        return d.toISOString().slice(0, 10);
    },

    ADMIN_PLACEHOLDER_AUTODIAGNOSTICO() {
        const answers = {};
        REACTIVO_KEYS_REALES.forEach((key) => { answers[key] = 'SI'; });
        const nowIso = new Date().toISOString();
        const nombre = Auth.DEMO_NOMBRE;
        return {
            _demo: true,
            personalData: {
                nombre, curp: Auth.DEMO_CURP,
                domicilio: 'Av. Ejemplo 123, Col. Centro, Monterrey, N.L., C.P. 64000',
                escolaridad: 'Licenciatura en Fisioterapia',
                telefonoCasa: '81 1234 5678', telefonoCelular: '81 8765 4321',
                email: CANDIDATE_FLOW_BYPASS_EMAIL, fecha: nowIso.slice(0, 10), renapAutorizado: true
            },
            certificados: [{ nombre: 'Masaje terapéutico', path: 'demo/certificado-masaje-demo.pdf', fileName: 'certificado-masaje-demo.pdf', size: 184320, uploadedAt: nowIso, uploading: false, error: null }],
            sinCertificadosPrevios: false,
            fotoCandidato: { path: null, fileName: 'foto-demo.jpg', previewDataUrl: Auth._demoFotoDataUrl(), uploading: false, error: null },
            answers,
            signatureDataUrl: null, signatureTypedName: nombre, signatureMode: 'type',
            triptychAccepted: true,
            ndaAccepted: true, ndaSignedAt: nowIso,
            ndaSignatureDataUrl: null, ndaSignatureTypedName: nombre, ndaSignatureMode: 'type',
            documentosNextcloud: {},
            documentosDescargados: { autodiagnostico: true, fichaRegistro: true, acuseTriptico: true, acuseNda: true }
        };
    },

    /* Placeholders de las páginas posteriores. Misma forma exacta que cada
       página guarda en localStorage (ver saveProgress/savePlanProgress/
       saveExamState de cada una) — si una página cambia su esquema, hay que
       actualizar aquí. */
    ADMIN_PLACEHOLDER_DOWNSTREAM() {
        const nombre = Auth.DEMO_NOMBRE;
        const paciente = 'Carlos Ejemplo Torres';
        const hoy = Auth._demoFecha(0);
        const firmaTyped = (typed) => ({ mode: 'type', dataUrl: null, typed, uploadDataUrl: null });
        return {
            planEvaluacionData: {
                _demo: true,
                planData: {
                    lugarDesarrollo: 'Instalaciones del Centro Evaluador',
                    fechaEvaluacion: Auth._demoFecha(14),
                    horarioDesarrollo: '10:00 – 12:00 h',
                    lugarResultados: 'Instalaciones del Centro Evaluador / Videollamada',
                    horarioResultados: '12:30 h',
                    acuerdoAceptado: true
                },
                signatureDataUrl: null, signatureTypedName: nombre, signatureMode: 'type',
                documentosNextcloud: {}, documentosDescargados: { planEvaluacion: true, acusePlanEvaluacion: true }
            },
            documentosSesionData: {
                _demo: true,
                sessionData: {
                    usuarioNombre: paciente, usuarioEdad: '42', usuarioFechaNacimiento: '1984-03-12',
                    usuarioDomicilio: 'Calle Ficticia 45, Col. Jardines, Monterrey, N.L.',
                    usuarioTelefono: '81 5555 0101', usuarioCorreo: 'carlos.ejemplo@correo.com',
                    contactoEmergencia: 'Laura Ejemplo (esposa) · 81 5555 0202',
                    fisiologicos: 'Dolor lumbar ocasional; sin cirugías previas',
                    socioemocionales: 'Estrés laboral moderado',
                    heredofamiliares: 'Hipertensión (padre)',
                    enfermedadesCronicas: 'Ninguna',
                    alergias: 'Ninguna conocida',
                    habitosAlimentacionSueno: '3 comidas al día; duerme 6-7 horas',
                    deportivos: 'Camina 3 veces por semana',
                    consumoSustancias: 'No fuma; alcohol social',
                    medicoTratante: 'Dra. Patricia Modelo (medicina general)',
                    informacionToxicologica: 'Sin tratamientos farmacológicos actuales',
                    resultadosLaboratorio: 'Química sanguínea reciente dentro de parámetros normales',
                    presionArterial: '118/76', pulso: '72', temperatura: '36.5', oxigenacion: '97', peso: '78', estatura: '1.74',
                    observacionPostural: 'Ligera anteriorización de cabeza y hombros protraídos',
                    frecuenciaRespiratoria: '16',
                    sintomasNecesidades: 'Tensión en zona cervical y lumbar; busca relajación y alivio',
                    tecnicaAplicar: 'Masaje terapéutico', otraTecnica: '',
                    zonasCuerpo: 'Espalda alta, cuello y hombros',
                    vestimentaRecomendada: 'Ropa cómoda; se cubre con sábana durante la sesión',
                    reaccionesFisicas: 'Posible sensibilidad leve en la zona tratada por 24 h',
                    expedienteNo: 'DEMO-0001', fechaConsentimiento: hoy,
                    limitantesServicio: 'No se aplica sobre lesiones abiertas, fiebre o procesos inflamatorios agudos',
                    condicionesPreparacion: 'Llegar 10 min antes; evitar comidas pesadas 1 h antes',
                    numeroSesionesPlan: '4', duracionSesionPlan: '60 minutos',
                    objetivosEfectos: 'Reducir tensión muscular y mejorar movilidad cervical',
                    horaInicio: '10:00', horaTermino: '11:00',
                    telefonoMovilSeguimiento: '81 5555 0101', telefonoFijoSeguimiento: '81 8000 0303',
                    correoSeguimiento: 'carlos.ejemplo@correo.com', medioContacto: 'WhatsApp',
                    notaEvolucion: 'Buena tolerancia a la técnica; refiere alivio inmediato de tensión',
                    pronostico: 'Favorable con continuidad de sesiones semanales',
                    recomendaciones: 'Hidratación, estiramientos suaves 2 veces al día, pausas activas en el trabajo'
                },
                sesionesSeguimiento: [
                    { numero: '1', frecuencia: 'Semanal', duracion: '60 min' },
                    { numero: '2', frecuencia: 'Semanal', duracion: '60 min' },
                    { numero: '3', frecuencia: 'Semanal', duracion: '60 min' },
                    { numero: '4', frecuencia: 'Semanal', duracion: '60 min' }
                ],
                signatures: { usuarioFicha: firmaTyped(paciente), usuarioConsentimiento: firmaTyped(paciente), usuarioSeguimiento: firmaTyped(paciente) },
                documentosNextcloud: {}, documentosDescargados: { ficha: true, consentimiento: true, plan_sesion: true, plan_seguimiento: true }
            },
            encuestaSatisfaccionData: {
                _demo: true,
                respuestas: { 0: 'Muy de acuerdo', 1: 'Muy de acuerdo', 2: 'Muy de acuerdo', 3: 'Muy de acuerdo', 4: 'De acuerdo', 5: 'Muy de acuerdo', 6: 'Muy de acuerdo' },
                comentarios: 'Excelente acompañamiento durante todo el proceso.',
                signatureDataUrl: null, signatureTypedName: nombre, signatureMode: 'type',
                documentosNextcloud: {}, documentosDescargados: { encuesta: true }
            },
            evidenciasData: {
                _demo: true,
                planData: { evidenciasConfirmadas: true, notas: 'Video grabado en Zoom, 58 minutos, con el paciente de ejemplo.', videoLink: 'https://drive.google.com/file/d/DEMO-VIDEO-EC1375/view' },
                signatureDataUrl: null, signatureTypedName: nombre, signatureMode: 'type',
                documentosNextcloud: { zoom: ['demo/zoom-captura-1.png', 'demo/zoom-captura-2.png'], ine: 'demo/ine.pdf', curp: 'demo/curp.pdf', fotoDiploma: 'demo/foto-diploma.jpg' }
            },
            examenConocimientosData: {
                _demo: true,
                order: [], currentIndex: 0, answers: {}, firstAttemptCorrect: {},
                submitted: true, score: 100, correctas: 39, fecha: hoy
            }
        };
    },

    /* Columna de candidatos_ec1375 → llave de localStorage de todo lo que se
       siembra como demo (misma correspondencia que _BYPASS_ROW_KEYS en
       flow-status.js). tests/datos-demo.test.js exige que cubra exactamente
       lo sembrado y que cada página guarde con esa columna. */
    DEMO_COLUMNAS: {
        autodiagnostico_data: 'autodiagnosticoData',
        plan_evaluacion_data: 'planEvaluacionData',
        documentos_sesion_data: 'documentosSesionData',
        encuesta_data: 'encuestaSatisfaccionData',
        evidencias_data: 'evidenciasData',
        examen_conocimientos_data: 'examenConocimientosData'
    },

    /* Lo que guarda la cuenta demo también es demo (17 sep 2026). Cada página
       arma su objeto desde cero al guardar (saveProgress, savePlanProgress,
       saveExamState tras reiniciar) y no copia `_demo`, así que la siguiente
       ensureAdminPlaceholderData() tomaba la edición del admin por datos de
       otra persona y la reemplazaba con los ficticios. Se vuelve a poner la
       marca aquí, llamado desde syncToSupabase(): todo guardado de progreso
       pasa por ahí justo después de escribir localStorage, así que basta un
       solo lugar en vez de tocar cada página. `_demo` se queda como la señal
       (no una llave aparte) porque viaja con los datos: una llave aparte no
       distinguiría lo editado por el admin de lo que dejó después en el mismo
       navegador un candidato real. Solo corre con Auth._isBypassSession ===
       true (verificado server-side); una cuenta real nunca recibe la marca. */
    _conservarMarcaDemo(column) {
        const key = Auth.DEMO_COLUMNAS[column];
        if (!key) return;
        try {
            const actual = JSON.parse(localStorage.getItem(key) || 'null');
            if (actual && typeof actual === 'object' && !Array.isArray(actual) && actual._demo !== true) {
                actual._demo = true;
                localStorage.setItem(key, JSON.stringify(actual));
            }
        } catch (e) { /* ilegible: ensureAdminPlaceholderData() lo resiembra */ }
    },

    /* Una cuenta real nunca ve ni sube los datos demo (17 sep 2026).
       localStorage es del navegador, no de la cuenta, y cerrar sesión no
       borra el progreso: si después entraba una cuenta real en ese navegador,
       cada página cargaba los objetos demo como si fueran suyos y el
       siguiente guardado los subía a SU fila (con curp y nombre de "Ana Sofía
       Demo Ramírez"). Autodiagnóstico lo hacía solo con iniciar sesión.

       Mientras no se confirme que la sesión es la demo, los objetos con
       `_demo: true` se APARTAN a DEMO_APARTADO: las páginas ya no los
       encuentran en su llave y arrancan como si no existieran. Se apartan en
       vez de borrarse para que la cuenta demo recupere lo editado en un video
       si cierra sesión y vuelve a entrar. Quién decide:
       - Al cargar auth.js (antes que el script de cualquier página): se
         apartan salvo que la sesión guardada sea la de la cuenta demo. Es
         solo una pista leída del navegador y solo decide ESCONDER, nunca da
         acceso; hace falta porque varias páginas cargan su progreso en `load`
         antes de preguntarle nada al servidor.
       - isBypassSession() (RPC server-side): demo → se restauran; otra
         cuenta confirmada → se borran; sin sesión o sin respuesta del
         servidor → se quedan apartados.
       - _flushPendingSync(): respaldo final, nunca sube un guardado con el
         curp o el nombre demo desde una cuenta que no es la demo (la página
         arma su objeto sin `_demo`, así que ahí la marca ya no sirve). */
    _correoSesionGuardada() {
        try {
            const raw = authStorageAdapter.getItem(SUPABASE_STORAGE_KEY);
            if (!raw) return null;
            const s = JSON.parse(raw);
            const u = s && (s.user || (s.currentSession && s.currentSession.user));
            return u && u.email ? String(u.email).trim().toLowerCase() : '';
        } catch (e) { return ''; }
    },

    _leerJson(key) {
        try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; }
    },

    _apartarDatosDemo() {
        try {
            const apartado = Auth._leerJson(Auth.DEMO_APARTADO) || {};
            const llaves = Object.values(Auth.DEMO_COLUMNAS).filter((key) => {
                const v = Auth._leerJson(key);
                if (!v || v._demo !== true) return false;
                apartado[key] = v;
                return true;
            });
            if (!llaves.length) return 0;
            try { localStorage.setItem(Auth.DEMO_APARTADO, JSON.stringify(apartado)); } catch (e) { /* sin espacio: se pierden, pero no se quedan a la vista */ }
            llaves.forEach((key) => localStorage.removeItem(key));
            return llaves.length;
        } catch (e) { return 0; }
    },

    _restaurarDatosDemo() {
        try {
            const apartado = Auth._leerJson(Auth.DEMO_APARTADO);
            if (!apartado) return;
            localStorage.removeItem(Auth.DEMO_APARTADO);
            Object.values(Auth.DEMO_COLUMNAS).forEach((key) => {
                const guardado = apartado[key];
                const actual = Auth._leerJson(key);
                if (!guardado || guardado._demo !== true || (actual && actual._demo === true)) return;
                localStorage.setItem(key, JSON.stringify(guardado));
            });
        } catch (e) { /* ensureAdminPlaceholderData() resiembra lo que falte */ }
    },

    _descartarDatosDemo() {
        try {
            localStorage.removeItem(Auth.DEMO_APARTADO);
            Object.values(Auth.DEMO_COLUMNAS).forEach((key) => {
                const v = Auth._leerJson(key);
                if (v && v._demo === true) localStorage.removeItem(key);
            });
        } catch (e) { /* sin storage */ }
    },

    _pareceDatoDemo(pending) {
        const curp = String(pending.curp || '').trim().toUpperCase();
        const nombre = String(pending.nombre || '').trim();
        return curp === Auth.DEMO_CURP || nombre === Auth.DEMO_NOMBRE ||
            !!(pending.data && pending.data._demo === true);
    },

    /* Siembra cada llave (Autodiagnóstico y páginas posteriores) solo si no
       hay nada o si lo que hay NO es demo: localStorage es del navegador, no
       de la cuenta, y `_demo` ausente = datos de otra persona → se reemplazan.
       Lo demo se respeta, incluido lo que el admin edite durante el video
       (sus guardados conservan `_demo`, ver _conservarMarcaDemo). Solo se
       llama tras confirmar Auth._isBypassSession === true. Regresa true si
       sembró algo. */
    ensureAdminPlaceholderData() {
        let sembrado = false;
        try {
            const actual = JSON.parse(localStorage.getItem('autodiagnosticoData') || 'null');
            if (!actual || !actual._demo) {
                localStorage.setItem('autodiagnosticoData', JSON.stringify(Auth.ADMIN_PLACEHOLDER_AUTODIAGNOSTICO()));
                sembrado = true;
            }
        } catch (e) {
            localStorage.setItem('autodiagnosticoData', JSON.stringify(Auth.ADMIN_PLACEHOLDER_AUTODIAGNOSTICO()));
            sembrado = true;
        }
        const down = Auth.ADMIN_PLACEHOLDER_DOWNSTREAM();
        Object.keys(down).forEach((key) => {
            let actual = null;
            try { actual = JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { actual = null; }
            if (!actual || !actual._demo) {
                localStorage.setItem(key, JSON.stringify(down[key]));
                sembrado = true;
            }
        });
        return sembrado;
    },

    /* "🔄 Reiniciar demo" del sidebar (crm-shell.js): borra TODO el progreso
       local de la cuenta bypass (incluido el estado del motor de estudio) y
       vuelve a sembrar los datos ficticios desde cero. */
    resetAdminDownstreamProgress() {
        Auth.DEMO_LOCAL_KEYS.forEach((k) => localStorage.removeItem(k));
        Auth.ensureAdminPlaceholderData();
        location.reload();
    }
};

window.Auth = Auth;

/* Antes que el script de cualquier página: si la sesión guardada no es la de
   la cuenta demo, sus datos quedan apartados (ver _apartarDatosDemo). */
if (Auth._correoSesionGuardada() !== CANDIDATE_FLOW_BYPASS_EMAIL) Auth._apartarDatosDemo();
