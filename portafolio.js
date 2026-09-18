/* =========================================================
   portafolio.js — arma el Portafolio de Evidencias EC1375 en el navegador
   del equipo (18 sep, enfoque A del circuito del Centro Evaluador). Puerto
   de _internal_no_publicar/01-scripts/assemble_expediente.py: mismo orden
   (Evaluacion.planPortafolio), mismas páginas generadas y coordenadas
   (carta, 612×792 pt, origen abajo a la izquierda, igual que reportlab), y
   la Cédula ahora llena y con las dos firmas.

   Solo lo cargan páginas del equipo (admin-evaluacion.html). Usa pdf-lib
   (se carga al generar) y descarga del NAS por trozos con
   GET /api/subir-portafolio (solo admins/evaluadores).
========================================================= */
(function (root) {
    'use strict';

    var URL_PDF_LIB = 'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js';
    var TROZO = 3.5 * 1024 * 1024;
    var W = 612, H = 792;
    var LOGO_CONOCER = 'Logos/RED%20CONOCER%20LOGO%20OFICIAL.jpeg';
    var LOGO_ICE = 'Logos/ICE%20MEXICO%20LOGO%20OFICIAL.jpeg';

    var _scripts = {};
    function cargarScript(src) {
        if (!_scripts[src]) {
            _scripts[src] = new Promise(function (ok, falla) {
                var s = document.createElement('script');
                s.src = src; s.onload = ok;
                s.onerror = function () { delete _scripts[src]; falla(new Error('No se pudo cargar ' + src)); };
                document.head.appendChild(s);
            });
        }
        return _scripts[src];
    }

    /* Descarga un archivo del NAS en trozos (cada respuesta ≤ 3.5 MB). */
    async function descargarNas(ruta, token) {
        var partes = [], desde = 0, total = null;
        do {
            var r = await fetch('/api/subir-portafolio?ruta=' + encodeURIComponent(ruta) + '&desde=' + desde + '&hasta=' + (desde + TROZO - 1),
                { headers: { Authorization: 'Bearer ' + token }, cache: 'no-store' });
            if (!r.ok) {
                var msg = null;
                try { msg = (await r.json()).error; } catch (e) { /* sin cuerpo JSON */ }
                throw new Error(msg || ('status ' + r.status));
            }
            total = Number(r.headers.get('X-Total-Size')) || 0;
            var buf = new Uint8Array(await r.arrayBuffer());
            if (!buf.length) break;
            partes.push(buf);
            desde += buf.length;
        } while (total && desde < total);
        var out = new Uint8Array(desde), pos = 0;
        partes.forEach(function (p) { out.set(p, pos); pos += p.length; });
        return out;
    }

    /* Las fuentes estándar de PDF solo codifican WinAnsi: lo demás se quita
       (emojis, flechas…) para que un comentario no rompa el portafolio. */
    var WINANSI_EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
    function limpiar(t) {
        return String(t === null || t === undefined ? '' : t).replace(/\t/g, ' ').split('').filter(function (ch) {
            var c = ch.charCodeAt(0);
            return ch === '\n' || (c >= 32 && c <= 126) || (c >= 160 && c <= 255) || WINANSI_EXTRA.indexOf(ch) >= 0;
        }).join('');
    }
    function envolver(texto, font, size, ancho) {
        var lineas = [];
        limpiar(texto).split('\n').forEach(function (parrafo) {
            var actual = '';
            parrafo.split(/\s+/).filter(Boolean).forEach(function (pal) {
                var prueba = actual ? actual + ' ' + pal : pal;
                if (font.widthOfTextAtSize(prueba, size) > ancho && actual) { lineas.push(actual); actual = pal; }
                else actual = prueba;
            });
            lineas.push(actual);
        });
        return lineas;
    }
    function fechaDMY(iso) {
        var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
        return m ? m[3] + '-' + m[2] + '-' + m[1] : '';
    }
    function sinAcentos(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, ''); }
    function nombreArchivo(nombre) {
        return 'Portafolio_EC1375_' + (sinAcentos(nombre).replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'candidato') + '.pdf';
    }
    async function bytesDeUrl(url) {
        var r = await fetch(url);
        if (!r.ok) throw new Error('No se pudo leer ' + url);
        return new Uint8Array(await r.arrayBuffer());
    }

    /* Recursos compartidos de un documento: fuentes y logos (una vez). */
    async function preparar(doc) {
        var L = root.PDFLib;
        var rec = {
            doc: doc,
            normal: await doc.embedFont(L.StandardFonts.Helvetica),
            negrita: await doc.embedFont(L.StandardFonts.HelveticaBold),
            italica: await doc.embedFont(L.StandardFonts.HelveticaOblique),
            negro: L.rgb(0, 0, 0)
        };
        try { rec.logoConocer = await doc.embedJpg(await bytesDeUrl(LOGO_CONOCER)); } catch (e) { rec.logoConocer = null; }
        try { rec.logoIce = await doc.embedJpg(await bytesDeUrl(LOGO_ICE)); } catch (e) { rec.logoIce = null; }
        return rec;
    }
    /* Página nueva con los logos oficiales (draw_header_logos del script). */
    function pagina(rec) {
        var p = rec.doc.addPage([W, H]);
        if (rec.logoConocer) p.drawImage(rec.logoConocer, { x: 40, y: H - 75, width: 42, height: 42 / 1.69 });
        if (rec.logoIce) p.drawImage(rec.logoIce, { x: W - 40 - 78, y: H - 72, width: 78, height: 78 / 2.92 });
        return p;
    }
    function texto(p, rec, t, x, y, size, font, extra) {
        t = limpiar(t);
        if (!t) return;
        p.drawText(t, Object.assign({ x: x, y: y, size: size, font: font || rec.normal, color: rec.negro }, extra || {}));
    }
    function centrado(p, rec, t, y, size, font) {
        t = limpiar(t);
        texto(p, rec, t, (W - (font || rec.normal).widthOfTextAtSize(t, size)) / 2, y, size, font);
    }

    var ESTANDAR = [
        'EC1375 - Prestación de servicios auxiliares en la',
        'contribución tradicional y complementaria de la recuperación de las',
        'condiciones físicas y socioemocionales de las personas.'
    ];

    function dibujarPortada(rec, nombre, evaluadora) {
        var L = root.PDFLib, p = pagina(rec);
        p.drawRectangle({ x: 60, y: H - 280, width: W - 120, height: 200, color: L.rgb(0.9, 0.9, 0.9) });
        texto(p, rec, 'Portafolio de Evidencias', 70, H - 100, 20, rec.negrita);
        var filas = [['Candidata/o:', nombre], ['Clave y nombre del estándar:', ESTANDAR[0]], ['', ESTANDAR[1]], ['', ESTANDAR[2]],
            ['Clave del CE:', '1399-OC063-18'], ['Evaluadora:', evaluadora || '']];
        var y = H - 130;
        filas.forEach(function (f) {
            if (f[0]) texto(p, rec, f[0], 80, y, 10, rec.negrita);
            texto(p, rec, f[1], 280, y, 10);
            y -= 16;
        });
    }

    function dibujarIndice(rec, avisos) {
        var L = root.PDFLib, p = pagina(rec);
        texto(p, rec, 'Índice', 70, H - 90, 16, rec.negrita);
        var items = ['1. Datos del candidato', '   Ficha de registro del candidato', '   Documentos personales (CURP, INE)',
            '   Diagnóstico del candidato (Autodiagnóstico, 142 reactivos)', '2. Recopilación de Evidencias',
            '   Plan de Evaluación Acordado con el Candidato', '   Instrumento de Evaluación Aplicado al Candidato (IEC)',
            '   Evidencias complementarias (sesión práctica)', '3. Cierre de la Evaluación', '   Cédula de Evaluación del Candidato',
            '   Encuesta de satisfacción del candidato', '4. Anexos', '   Acuse de recibido de cédula de competencia, del plan de', '   evaluación y tríptico'];
        var y = H - 130;
        items.forEach(function (t) {
            var sub = t.indexOf('   ') === 0;
            texto(p, rec, sub ? t.trim() : t, sub ? 80 + rec.normal.widthOfTextAtSize('   ', 11) : 80, y, 11, sub ? rec.normal : rec.negrita);
            y -= 20;
        });
        if (avisos.length) {
            y -= 20;
            var rojo = L.rgb(0.7, 0, 0);
            texto(p, rec, 'Avisos de este expediente:', 80, y, 10, rec.negrita, { color: rojo });
            y -= 16;
            avisos.forEach(function (a) {
                envolver(a, rec.normal, 9, W - 180).forEach(function (l) {
                    if (y < 50) { p = pagina(rec); y = H - 110; }
                    texto(p, rec, l, 90, y, 9, rec.normal, { color: rojo });
                    y -= 12;
                });
            });
        }
    }

    function dibujarSeparador(rec, titulo) {
        centrado(pagina(rec), rec, titulo, H / 2, 22, rec.negrita);
    }

    function dibujarVideo(rec, link) {
        var p = pagina(rec);
        centrado(p, rec, 'Referencia al Video de la Sesión', H - 100, 14, rec.negrita);
        var lineas = envolver(link || 'NO PROPORCIONADA — solicitar al candidato', rec.normal, 10, W - 120);
        lineas.forEach(function (l, i) { centrado(p, rec, l, H - 140 - i * 14, 10); });
    }

    async function imagenFirma(rec, firma) {
        if (!firma || firma.mode !== 'draw' || !/^data:image\/(png|jpe?g);base64,/.test(firma.dataUrl || '')) return null;
        var b64 = firma.dataUrl.split(',')[1], bin = atob(b64), bytes = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        try { return /^data:image\/png/.test(firma.dataUrl) ? await rec.doc.embedPng(bytes) : await rec.doc.embedJpg(bytes); }
        catch (e) { return null; }
    }
    /* Firma sobre la línea (x..x+200, y): imagen ajustada a 200×42 o el
       nombre escrito en itálica. */
    async function dibujarFirma(p, rec, firma, x, y) {
        var img = await imagenFirma(rec, firma);
        if (img) {
            var esc = Math.min(200 / img.width, 42 / img.height);
            p.drawImage(img, { x: x + (200 - img.width * esc) / 2, y: y + 2, width: img.width * esc, height: img.height * esc });
        } else if (firma && firma.mode === 'type' && firma.typedName) {
            var t = limpiar(firma.typedName), size = 14;
            while (size > 8 && rec.italica.widthOfTextAtSize(t, size) > 196) size--;
            texto(p, rec, t, x + (200 - rec.italica.widthOfTextAtSize(t, size)) / 2, y + 6, size, rec.italica);
        }
    }

    /* Cédula de Evaluación llena: layout de draw_cedula_evaluacion_blanco()
       (validado contra el expediente real) con los textos y las firmas. */
    async function dibujarCedula(rec, d) {
        d = d || {};
        var ced = d.cedula || {}, L = root.PDFLib;
        var p = pagina(rec);
        centrado(p, rec, 'CÉDULA DE EVALUACIÓN', H - 90, 14, rec.negrita);
        var y = H - 120;
        [['Evaluadora:', ced.evaluadora || ''], ['Centro de Evaluación:', 'CE1399-OC063-18'], ['Candidato/a:', d.nombre || ''],
            ['Estándar de Competencia:', 'EC1375 - Prestación de servicios auxiliares en la contribución'],
            ['', 'tradicional y complementaria de la recuperación de las condiciones'], ['', 'físicas y socioemocionales de las personas.'],
            ['Fecha:', fechaDMY(ced.fecha)]].forEach(function (f) {
            if (f[0]) texto(p, rec, f[0], 50, y, 9, rec.negrita);
            texto(p, rec, f[1], 200, y, 9);
            y -= 16;
        });
        y -= 20;
        texto(p, rec, 'RESULTADO DE LA EVALUACIÓN', 50, y, 11, rec.negrita);
        y -= 20;
        var campos = [['mejoresPracticas', 'Mejores prácticas:'], ['areasOportunidad', 'Áreas de oportunidad:'],
            ['criteriosNoCubiertos', 'Criterios de Evaluación que no se cubrieron:'], ['recomendaciones', 'Recomendaciones:']];
        campos.forEach(function (c) {
            var lineas = envolver(ced[c[0]] || '', rec.normal, 8.5, W - 112);
            var alto = Math.max(30, lineas.length * 10.5 + 8);
            if (y - alto - 30 < 60) { p = pagina(rec); y = H - 110; }
            texto(p, rec, c[1], 50, y, 9, rec.negrita);
            p.drawRectangle({ x: 50, y: y - 15 - alto, width: W - 100, height: alto, borderColor: rec.negro, borderWidth: 1 });
            lineas.forEach(function (l, i) { texto(p, rec, l, 56, y - 26 - i * 10.5, 8.5); });
            y -= alto + 35;
        });
        if (y < 260) { p = pagina(rec); y = H - 110; }
        y -= 20;
        texto(p, rec, 'JUICIO DE EVALUACIÓN', 50, y, 11, rec.negrita);
        y -= 16;
        var juicio = limpiar(ced.juicio || '');
        if (juicio) {
            var jw = rec.negrita.widthOfTextAtSize(juicio, 12), sufijo = '  ( COMPETENTE / NO COMPETENTE )';
            var tot = jw + rec.normal.widthOfTextAtSize(sufijo, 12), x0 = (W - tot) / 2;
            texto(p, rec, juicio, x0, y, 12, rec.negrita);
            p.drawLine({ start: { x: x0, y: y - 2 }, end: { x: x0 + jw, y: y - 2 }, thickness: 0.8, color: rec.negro });
            texto(p, rec, sufijo, x0 + jw, y, 12);
        } else centrado(p, rec, '_______________________  ( COMPETENTE / NO COMPETENTE )', y, 12, rec.negrita);
        y -= 22;
        envolver('Estoy de acuerdo con el juicio de evaluación y satisfecho con los comentarios emitidos.', rec.normal, 9, W - 100)
            .forEach(function (l) { texto(p, rec, l, 50, y, 9); y -= 12; });
        y -= 48;
        await dibujarFirma(p, rec, ced.firmaEvaluador, 50, y);
        await dibujarFirma(p, rec, d.firmaCandidato, 320, y);
        p.drawLine({ start: { x: 50, y: y }, end: { x: 250, y: y }, thickness: 1, color: rec.negro });
        p.drawLine({ start: { x: 320, y: y }, end: { x: 520, y: y }, thickness: 1, color: rec.negro });
        var nombreEval = (ced.firmaEvaluador && ced.firmaEvaluador.nombre) || ced.evaluadora || '';
        texto(p, rec, nombreEval, 50, y - 11, 8, rec.negrita);
        texto(p, rec, d.nombre || '', 320, y - 11, 8, rec.negrita);
        texto(p, rec, 'Nombre y Firma Evaluadora', 50, y - 21, 8);
        texto(p, rec, 'Nombre y Firma Candidata/o' + (d.firmaCandidato && d.firmaCandidato.fecha ? ' · ' + fechaDMY(d.firmaCandidato.fecha) : ''), 320, y - 21, 8);
        y -= 45;
        ['El Juicio de Competencia emitido, está sujeto a la ratificación o rectificación del dictamen emitido por (Razón social o denominación de la ECE u OC).',
            'El Candidato pagará el importe establecido para el certificado, sí y solo si su Juicio de Competencia resultara ser competente.']
            .forEach(function (nota) {
                envolver(nota, rec.normal, 7, W - 110).forEach(function (l, j) { texto(p, rec, (j === 0 ? '• ' : '   ') + l, 50, y, 7); y -= 9; });
            });
        y -= 8;
        texto(p, rec, 'Observaciones:', 50, y, 9, rec.negrita);
        texto(p, rec, '(uso exclusivo para el Candidato)', 130, y, 8, rec.italica);
        var obs = envolver(ced.observaciones || '', rec.normal, 8, W - 112);
        var altoObs = Math.max(22, obs.length * 10 + 6);
        p.drawRectangle({ x: 50, y: y - 8 - altoObs, width: W - 100, height: altoObs, borderColor: rec.negro, borderWidth: 1 });
        obs.forEach(function (l, i) { texto(p, rec, l, 56, y - 18 - i * 10, 8); });
        y -= altoObs + 23;
        texto(p, rec, 'Al pie de página: Datos del CE o EI (Dirección, Teléfono, Página de Internet y Correo Electrónico, etc.)', 50, Math.max(y, 30), 6);
        return L;
    }

    async function asegurarLib() { if (!root.PDFLib) await cargarScript(URL_PDF_LIB); }

    /* Solo la Cédula (botón "Descargar Cédula"). d = { cedula, firmaCandidato, nombre } */
    async function cedulaPdf(d) {
        await asegurarLib();
        var doc = await root.PDFLib.PDFDocument.create();
        await dibujarCedula(await preparar(doc), d);
        return doc.save();
    }

    function extension(ruta) { var m = /\.([a-z0-9]+)$/i.exec(ruta || ''); return m ? m[1].toLowerCase() : ''; }

    /* Arma el portafolio. ctx = { row, evaluacion, token, onProgreso(texto) }.
       Devuelve { bytes, paginas, avisos, nombreArchivo }. */
    async function generar(ctx) {
        await asegurarLib();
        var L = root.PDFLib, E = root.Evaluacion;
        var progreso = ctx.onProgreso || function () {};
        var plan = E.planPortafolio(ctx.row, ctx.evaluacion);
        var avisos = plan.avisos.slice();
        var ev = ctx.evaluacion || {};
        var ced = E.cedulaPublicada(ev);
        if (!ced) avisos.push('La Cédula de Evaluación no está publicada: se incluye en blanco');
        else if (!ev.firma_candidato) avisos.push('La Cédula de Evaluación todavía no tiene la firma del candidato');

        /* 1. Descargar del NAS (en orden, para reportar avance). */
        var cargados = {}, porDescargar = plan.items.filter(function (i) { return i.tipo !== 'generado'; });
        for (var k = 0; k < porDescargar.length; k++) {
            var it = porDescargar[k];
            progreso('Descargando ' + (k + 1) + ' de ' + porDescargar.length + ': ' + it.etiqueta);
            try {
                var bytes = await descargarNas(it.ruta, ctx.token), ext = extension(it.ruta);
                if (ext === 'pdf') cargados[it.ruta] = { pdf: await L.PDFDocument.load(bytes, { ignoreEncryption: true }) };
                else if (ext === 'jpg' || ext === 'jpeg' || ext === 'png') cargados[it.ruta] = { img: bytes, png: ext === 'png' };
                else avisos.push("'" + it.etiqueta + "': formato ." + ext + ' no se puede insertar, revisar a mano (' + it.ruta + ')');
            } catch (e) {
                avisos.push("No se pudo descargar '" + it.etiqueta + "' del NAS: " + (e.message || e));
            }
        }

        /* 2. Unir en el orden del plan. */
        progreso('Uniendo el portafolio…');
        var doc = await L.PDFDocument.create();
        doc.setTitle(limpiar('Portafolio de Evidencias EC1375 - ' + plan.nombre));
        var rec = await preparar(doc);
        var SEP = { sep1: '1. Datos del Candidato/a', sep2: '2. Recopilación de Evidencias', sep3: '3. Cierre de Evaluación', sep4: '4. ANEXOS' };
        for (var n = 0; n < plan.items.length; n++) {
            var item = plan.items[n];
            if (item.tipo === 'generado') {
                if (item.pagina === 'portada') dibujarPortada(rec, plan.nombre, ced ? ced.evaluadora : '');
                else if (item.pagina === 'indice') dibujarIndice(rec, avisos);
                else if (SEP[item.pagina]) dibujarSeparador(rec, SEP[item.pagina]);
                else if (item.pagina === 'video') dibujarVideo(rec, plan.videoLink);
                else if (item.pagina === 'cedula') await dibujarCedula(rec, { cedula: ced || {}, firmaCandidato: ced ? ev.firma_candidato : null, nombre: plan.nombre });
                continue;
            }
            var c = cargados[item.ruta];
            if (!c) continue;
            if (c.pdf) {
                var paginas = await doc.copyPages(c.pdf, c.pdf.getPageIndices());
                paginas.forEach(function (pg) { doc.addPage(pg); });
            } else {
                try {
                    var img = c.png ? await doc.embedPng(c.img) : await doc.embedJpg(c.img);
                    var pg = doc.addPage([W, H]), esc = Math.min((W - 72) / img.width, (H - 72) / img.height, 1.5);
                    pg.drawImage(img, { x: (W - img.width * esc) / 2, y: (H - img.height * esc) / 2, width: img.width * esc, height: img.height * esc });
                } catch (e) { avisos.push("'" + item.etiqueta + "': la imagen no se pudo insertar (" + (e.message || e) + ')'); }
            }
        }
        progreso('Guardando…');
        var out = await doc.save();
        return { bytes: out, paginas: doc.getPageCount(), avisos: avisos, nombreArchivo: nombreArchivo(plan.nombre) };
    }

    var api = { generar: generar, cedulaPdf: cedulaPdf, descargarNas: descargarNas, nombreArchivo: nombreArchivo, _limpiar: limpiar, _fechaDMY: fechaDMY };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.Portafolio = api;
})(typeof window !== 'undefined' ? window : this);
