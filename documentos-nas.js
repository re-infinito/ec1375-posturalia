/* =========================================================
   documentos-nas.js — subida de los PDF generados al portafolio del NAS
   (Nextcloud) CON CONTROL DE VERSIÓN (17 sep).

   Pedido de Diego: "si se hace algún ajuste a cualquier documento previo,
   debe de resubirse la versión actualizada". Antes cada página subía un
   documento una sola vez (`if (documentosNextcloud[key]) continue`), así que
   una corrección posterior nunca llegaba al NAS y el expediente se armaba
   con la versión vieja.

   Cómo funciona: cada página calcula una HUELLA de los datos con los que
   arma sus PDF (más una versión de plantilla). Junto a la ruta subida se
   guarda la huella (`documentosHuella[clave]`). Si la huella actual ya no
   coincide, el documento se regenera y se vuelve a subir con el MISMO
   nombre de archivo — WebDAV PUT lo sobrescribe en el NAS.

   Además: la subida ya no bloquea la pantalla (antes el resultado no se
   pintaba hasta terminar de subir 4 PDF, y con el NAS lento parecía que
   "Continuar donde me quedé" no hacía nada), una sola subida por página a
   la vez, y un guardado con cambios programa la resubida tras unos segundos
   sin escribir.

   Módulo compartido porque la regla de "cuándo un documento está al día" no
   debe copiarse en cada página. Helpers puros probados en
   tests/documentos-nas.test.js. Se carga después de auth.js.
========================================================= */
(function (root) {
    'use strict';

    /* Claves que no son datos del documento: el propio estado de subida y
       banderas volátiles. Se ignoran a cualquier profundidad. */
    var IGNORAR = {
        documentosNextcloud: 1, documentosDescargados: 1, documentosHuella: 1,
        uploading: 1, error: 1, _demo: 1
    };

    /* FNV-1a de 32 bits sobre el JSON (sin las claves de IGNORAR) + largo.
       No es criptográfica: solo detecta que los datos cambiaron. */
    function huella(valor) {
        var s = JSON.stringify(valor === undefined ? null : valor, function (k, v) {
            return Object.prototype.hasOwnProperty.call(IGNORAR, k) ? undefined : v;
        }) || '';
        var h = 0x811c9dc5;
        for (var i = 0; i < s.length; i++) {
            h ^= s.charCodeAt(i);
            h = Math.imul(h, 0x01000193);
        }
        return ('0000000' + (h >>> 0).toString(16)).slice(-8) + '-' + s.length;
    }

    /* Misma regla que documentosFaseCompletos(): una ruta o una lista con algo. */
    function subido(val) {
        return Array.isArray(val) ? val.length > 0 : !!val;
    }

    function asegurarEstado(estado) {
        estado.documentosNextcloud = estado.documentosNextcloud || {};
        estado.documentosHuella = estado.documentosHuella || {};
        estado.documentosDescargados = estado.documentosDescargados || {};
        return estado;
    }

    /* Claves que hay que (re)subir: nunca subidas, o subidas con otra huella
       (incluye las subidas antes de este cambio, que no tienen huella). */
    function pendientes(claves, estado, huellaActual) {
        asegurarEstado(estado);
        return claves.filter(function (k) {
            return !subido(estado.documentosNextcloud[k]) || estado.documentosHuella[k] !== huellaActual;
        });
    }

    /* ¿Ya se generó algo de esta página alguna vez? (subido o descargado) —
       las resubidas automáticas solo aplican a documentos que ya existían. */
    function yaGenerado(claves, estado) {
        asegurarEstado(estado);
        return claves.some(function (k) {
            return subido(estado.documentosNextcloud[k]) || !!estado.documentosDescargados[k];
        });
    }

    var subiendo = {};           /* clave → true mientras sube */
    function estaSubiendo(k) { return !!subiendo[k]; }

    /* 'subiendo' | 'subido' | 'desactualizado' | 'descargado' | 'pendiente' */
    function estadoDoc(clave, estado, huellaActual) {
        asegurarEstado(estado);
        if (subiendo[clave]) return 'subiendo';
        if (subido(estado.documentosNextcloud[clave])) {
            return estado.documentosHuella[clave] === huellaActual ? 'subido' : 'desactualizado';
        }
        if (estado.documentosDescargados[clave]) return 'descargado';
        return 'pendiente';
    }

    function leerBase64(blob) {
        return new Promise(function (resolve, reject) {
            var reader = new FileReader();
            reader.onloadend = function () { resolve(String(reader.result).split(',')[1]); };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    /* Igual que el subirDocumento() que ya tenía cada página. */
    function subir(fase, filename, blob, nombre, curp) {
        return Promise.resolve(root.Auth && root.Auth.getSession ? root.Auth.getSession() : null).then(function (session) {
            if (!session) return { success: false, error: 'Sin sesión activa' };
            return leerBase64(blob).then(function (fileBase64) {
                return fetch('/api/subir-portafolio', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session.access_token },
                    body: JSON.stringify({ email: session.user.email, fase: fase, nombre: nombre, curp: curp, filename: filename, fileBase64: fileBase64 })
                });
            }).then(function (resp) {
                return resp.json().then(function (data) {
                    if (!resp.ok || !data.success) return { success: false, error: data.error || 'Error desconocido' };
                    return { success: true, path: data.path };
                });
            });
        }).catch(function (e) {
            return { success: false, error: (e && e.message) || 'Error de red' };
        });
    }

    var colas = {};              /* grupo → { corriendo, repetir, opciones } */

    /* opciones: { grupo, fase, claves, huella, generar, estado, nombre, curp,
                   alCambiar, subirFn }
       generar() → { clave: { blob, filename } } — solo se llama si hay algo
       pendiente. Serial por grupo: si ya hay una subida corriendo, se anota
       que hay que repetir con las opciones más recientes. */
    function sincronizar(opciones) {
        var grupo = opciones.grupo || opciones.fase;
        var cola = colas[grupo] || (colas[grupo] = { corriendo: null, repetir: null });
        if (cola.corriendo) {
            cola.repetir = opciones;
            return cola.corriendo;
        }
        cola.corriendo = correr(opciones).then(function (r) {
            cola.corriendo = null;
            if (cola.repetir) {
                var sig = cola.repetir;
                cola.repetir = null;
                return sincronizar(sig);
            }
            return r;
        }, function (e) {
            cola.corriendo = null;
            cola.repetir = null;
            throw e;
        });
        return cola.corriendo;
    }

    function correr(o) {
        var estado = asegurarEstado(o.estado);
        var faltan = pendientes(o.claves, estado, o.huella);
        var resultado = { subidos: [], fallidos: [] };
        if (!faltan.length) return Promise.resolve(resultado);
        var docs;
        try { docs = o.generar(); }
        catch (e) { return Promise.reject(e); }
        var subirFn = o.subirFn || subir;
        var aviso = typeof o.alCambiar === 'function' ? o.alCambiar : function () {};

        faltan.forEach(function (k) { subiendo[k] = true; });
        aviso();

        return faltan.reduce(function (p, k) {
            return p.then(function () {
                var d = docs && docs[k];
                if (!d) { delete subiendo[k]; resultado.fallidos.push(k); return; }
                return subirFn(o.fase, d.filename, d.blob, o.nombre, o.curp).then(function (r) {
                    delete subiendo[k];
                    if (r && r.success) {
                        estado.documentosNextcloud[k] = r.path;
                        estado.documentosHuella[k] = o.huella;
                        resultado.subidos.push(k);
                    } else {
                        resultado.fallidos.push(k);
                    }
                    aviso();
                });
            });
        }, Promise.resolve()).then(function () { return resultado; }, function (e) {
            faltan.forEach(function (k) { delete subiendo[k]; });
            aviso();
            throw e;
        });
    }

    var timers = {};
    /* Espera `ms` sin nuevos cambios antes de correr fn (una por grupo). */
    function programar(grupo, fn, ms) {
        if (timers[grupo]) clearTimeout(timers[grupo]);
        timers[grupo] = setTimeout(function () {
            timers[grupo] = null;
            try {
                var r = fn();
                if (r && typeof r.catch === 'function') r.catch(function (e) { console.warn('Resubida al NAS:', e); });
            } catch (e) { console.warn('Resubida al NAS:', e); }
        }, typeof ms === 'number' ? ms : 8000);
    }

    var api = {
        huella: huella, subido: subido, pendientes: pendientes, yaGenerado: yaGenerado,
        estadoDoc: estadoDoc, estaSubiendo: estaSubiendo, subir: subir,
        sincronizar: sincronizar, programar: programar
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.DocumentosNas = api;
})(typeof window !== 'undefined' ? window : this);
