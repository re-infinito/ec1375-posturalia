/* =========================================================
   contenido.js — carga del contenido protegido desde Supabase.

   Proyecto 4 (15 sep 2026): el contenido valioso ya no viaja en el HTML;
   vive en la tabla `contenido_ec1375` (RLS: fase pagada / admin / bypass) y
   sus imágenes en el bucket privado `contenido-imagenes` (URLs firmadas de
   1 hora). Lo publica publicar_contenido.py. Cargar después de auth.js.

   Contenido.cargar('ruta-estudio:data')  → Promise<objeto>  (lanza ContenidoError)
   Contenido.imagenes(['registro/a.jpg']) → Promise<{ruta: urlFirmada}>
   Contenido.reemplazarImagenes(html, mapa) → html con {{img:ruta}} sustituidos
   Contenido.errorHtml(err)               → bloque de error para pintar en la página

   Transición: mientras una página conserve su bloque inline (antes de
   correr el script), la página puede pasar `fallback` a cargar(); si la
   tabla aún no existe o falla la red, se usa el inline y se avisa en consola.
   Cargable en Node para probar los helpers puros (tests/contenido.test.js).
========================================================= */
(function () {
    'use strict';

    var BUCKET = 'contenido-imagenes';
    var cache = {};

    function ContenidoError(tipo, mensaje, causa) {
        this.name = 'ContenidoError'; this.tipo = tipo; this.message = mensaje; this.causa = causa || null;
    }
    ContenidoError.prototype = Object.create(Error.prototype);

    /* Clasifica un error de Supabase/red en algo que el candidato entienda. */
    function clasificarError(err, tieneSesion) {
        if (!tieneSesion) return 'sin_sesion';
        var msg = String((err && (err.message || err.error_description || err.code)) || err || '').toLowerCase();
        if (/failed to fetch|networkerror|load failed|network request failed|timeout/.test(msg)) return 'sin_conexion';
        if (/does not exist|could not find the table|pgrst205|relation .* does not exist/.test(msg)) return 'no_publicado';
        if (/permission|denied|row-level|rls|403|401|jwt/.test(msg)) return 'sin_acceso';
        return 'desconocido';
    }

    var MENSAJES = {
        sin_sesion: { titulo: 'Inicia sesión para ver este contenido', texto: 'Tu material de estudio se carga con tu cuenta.', href: 'panel.html', label: 'Ir a iniciar sesión' },
        sin_acceso: { titulo: 'Este contenido se habilita al pagar su fase', texto: 'Cuando tu pago quede registrado, aparecerá aquí automáticamente.', href: 'panel.html', label: 'Ver mis pagos' },
        sin_conexion: { titulo: 'Sin conexión', texto: 'Este material se carga en línea. Revisa tu internet e intenta de nuevo.', href: null, label: 'Reintentar' },
        no_publicado: { titulo: 'Contenido en preparación', texto: 'El equipo está publicando este material. Intenta más tarde.', href: 'panel.html', label: 'Volver al panel' },
        desconocido: { titulo: 'No pudimos cargar el contenido', texto: 'Intenta de nuevo. Si sigue igual, escríbenos por WhatsApp.', href: null, label: 'Reintentar' }
    };

    /* Sustituye {{img:ruta}} por la URL firmada; si falta, deja un pixel transparente. */
    function reemplazarImagenes(html, mapa) {
        mapa = mapa || {};
        return String(html || '').replace(/\{\{img:([^}]+)\}\}/g, function (_, ruta) {
            return mapa[ruta] || 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
        });
    }

    /* Rutas de imagen referenciadas en un HTML con placeholders. */
    function rutasEnHtml(html) {
        var out = [], seen = {};
        String(html || '').replace(/\{\{img:([^}]+)\}\}/g, function (_, r) { if (!seen[r]) { seen[r] = true; out.push(r); } return ''; });
        return out;
    }

    function errorHtml(err) {
        var tipo = (err && err.tipo) || 'desconocido';
        var m = MENSAJES[tipo] || MENSAJES.desconocido;
        var accion = m.href
            ? '<a class="btn btn-primary" href="' + m.href + '" style="display:inline-block;text-decoration:none;">' + m.label + '</a>'
            : '<button type="button" class="btn btn-primary" onclick="location.reload()">' + m.label + '</button>';
        return '<div class="card" style="text-align:center;max-width:560px;margin:40px auto;">' +
               '<h2 style="color:var(--text-bright,#fff);margin-bottom:8px;">' + m.titulo + '</h2>' +
               '<p style="color:var(--text,#ccc);margin-bottom:16px;">' + m.texto + '</p>' + accion + '</div>';
    }

    async function sesion() {
        try { return (typeof Auth !== 'undefined') ? await Auth.getSession() : null; } catch (e) { return null; }
    }

    async function cargar(clave, opts) {
        opts = opts || {};
        if (cache[clave]) return cache[clave];
        var s = await sesion();
        var sb = (typeof supabaseClient !== 'undefined') ? supabaseClient : null;
        var fallo = null;
        if (s && sb) {
            try {
                var r = await sb.from('contenido_ec1375').select('contenido,version').eq('clave', clave).maybeSingle();
                if (r.error) fallo = r.error;
                else if (r.data && r.data.contenido !== undefined) { cache[clave] = r.data.contenido; return r.data.contenido; }
                else fallo = { message: 'row-level: sin acceso o sin fila' };
            } catch (e) { fallo = e; }
        }
        if (opts.fallback !== undefined && opts.fallback !== null) {
            console.warn('Contenido "' + clave + '": usando bloque inline (' + (fallo && fallo.message ? fallo.message : 'sin sesión') + ')');
            return opts.fallback;
        }
        throw new ContenidoError(clasificarError(fallo, !!s), (fallo && fallo.message) || 'sin sesión', fallo);
    }

    async function imagenes(rutas) {
        var sb = (typeof supabaseClient !== 'undefined') ? supabaseClient : null;
        var mapa = {};
        if (!sb || !rutas || !rutas.length) return mapa;
        var faltan = rutas.filter(function (r) { return !cache['img:' + r]; });
        if (faltan.length) {
            var r = await sb.storage.from(BUCKET).createSignedUrls(faltan, 3600);
            if (r.error) throw new ContenidoError(clasificarError(r.error, true), r.error.message, r.error);
            (r.data || []).forEach(function (it) { if (it.signedUrl && !it.error) cache['img:' + (it.path || faltan[r.data.indexOf(it)])] = it.signedUrl; });
        }
        rutas.forEach(function (ruta) { if (cache['img:' + ruta]) mapa[ruta] = cache['img:' + ruta]; });
        return mapa;
    }

    var Contenido = {
        cargar: cargar, imagenes: imagenes, reemplazarImagenes: reemplazarImagenes, rutasEnHtml: rutasEnHtml,
        errorHtml: errorHtml, ContenidoError: ContenidoError,
        _helpers: { clasificarError: clasificarError, reemplazarImagenes: reemplazarImagenes, rutasEnHtml: rutasEnHtml, MENSAJES: MENSAJES }
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = Contenido;
    if (typeof window !== 'undefined') window.Contenido = Contenido;
})();
