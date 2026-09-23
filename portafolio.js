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
    /* ── Lectura de texto con pdf.js (19 sep): para ubicar en el Plan y los
       acuses las etiquetas "Evaluadora:", "Centro de Evaluación:" y "Nombre y
       firma de la Evaluadora:" sin depender de coordenadas fijas (sirve con
       documentos de cualquier versión). Las funciones puras se prueban en
       tests/portafolio.test.js. items: { str, x, y (línea base), w, h }. */
    var URL_PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    var URL_PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

    function agruparLineas(items) {
        var lineas = [];
        items.filter(function (it) { return it && String(it.str || '').trim(); }).forEach(function (it) {
            var l = lineas.filter(function (x) { return Math.abs(x.y - it.y) <= 2; })[0];
            if (!l) { l = { y: it.y, items: [] }; lineas.push(l); }
            l.items.push(it);
        });
        lineas.forEach(function (l) {
            l.items.sort(function (a, b) { return a.x - b.x; });
            l.texto = l.items.map(function (it) { return String(it.str).trim(); }).join(' ');
        });
        return lineas.sort(function (a, b) { return b.y - a.y; });
    }
    /* Renglón de una tabla "Etiqueta: | valor": el valor va en la misma
       columna que el nombre del candidato (renglón "Candidato/a:"). */
    function ubicarCampo(lineas, etiqueta) {
        var linea = lineas.filter(function (l) { return etiqueta.test(String(l.items[0].str).trim()); })[0];
        var ref = lineas.filter(function (l) { return /^Candidat[oa]/.test(String(l.items[0].str).trim()) && l.items.length > 1; })[0];
        if (!linea || !ref) return null;
        var lab = linea.items[0], val = ref.items[1];
        return { x: val.x, y: lab.y, size: val.h || 8, lleno: linea.items.length > 1 };
    }
    async function lineasPdf(bytes) {
        if (!root.pdfjsLib) await cargarScript(URL_PDFJS);
        root.pdfjsLib.GlobalWorkerOptions.workerSrc = URL_PDFJS_WORKER;
        var pdf = await root.pdfjsLib.getDocument({ data: bytes.slice() }).promise;
        var paginas = [];
        for (var i = 1; i <= pdf.numPages; i++) {
            var tc = await (await pdf.getPage(i)).getTextContent();
            paginas.push(agruparLineas(tc.items.map(function (t) {
                return { str: t.str, x: t.transform[4], y: t.transform[5], w: t.width, h: t.height || Math.abs(t.transform[3]) };
            })));
        }
        pdf.destroy();
        return paginas;
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
        /* Los tres logos salen de formato-oficial.js, que es la misma fuente
           que usan los PDF del candidato (jsPDF). Si el módulo no está
           cargado se cae a los dos JPEG de siempre. */
        var FO = root.FormatoOficial;
        if (FO) {
            rec.fo = [];
            for (var k = 0; k < 3; k++) {
                var l = FO.LOGOS[['conocer', 'cicfm', 'ice'][k]];
                try { rec.fo.push({ img: await doc.embedPng(base64ABytes(l.img)), l: l }); } catch (e) { /* sin ese logo */ }
            }
            if (rec.fo.length !== 3) rec.fo = null;
        }
        if (!rec.fo) {
            try { rec.logoConocer = await doc.embedJpg(await bytesDeUrl(LOGO_CONOCER)); } catch (e) { rec.logoConocer = null; }
            try { rec.logoIce = await doc.embedJpg(await bytesDeUrl(LOGO_ICE)); } catch (e) { rec.logoIce = null; }
        }
        return rec;
    }
    var MM = 72 / 25.4;
    function base64ABytes(dataUrl) {
        var b = atob(String(dataUrl).split(',')[1]), a = new Uint8Array(b.length);
        for (var i = 0; i < b.length; i++) a[i] = b.charCodeAt(i);
        return a;
    }
    /* Página nueva con el encabezado del Centro: los tres logos en las
       posiciones medidas sobre el expediente aprobado (formato-oficial.js). */
    function pagina(rec) {
        var p = rec.doc.addPage([W, H]);
        if (rec.fo) {
            rec.fo.forEach(function (o) {
                p.drawImage(o.img, { x: o.l.x * MM, y: H - (o.l.y + o.l.h) * MM, width: o.l.w * MM, height: o.l.h * MM });
            });
        } else {
            if (rec.logoConocer) p.drawImage(rec.logoConocer, { x: 40, y: H - 75, width: 42, height: 42 / 1.69 });
            if (rec.logoIce) p.drawImage(rec.logoIce, { x: W - 40 - 78, y: H - 72, width: 78, height: 78 / 2.92 });
        }
        return p;
    }
    /* La paloma del índice. Helvetica no trae ✓ (WinAnsi no lo cubre), así
       que se dibuja con dos trazos en vez de caer en una "v". */
    function paloma(p, rec, x, y) {
        var c = rec.negro;
        p.drawLine({ start: { x: x, y: y + 3 }, end: { x: x + 3, y: y }, thickness: 1.1, color: c });
        p.drawLine({ start: { x: x + 3, y: y }, end: { x: x + 8, y: y + 7 }, thickness: 1.1, color: c });
    }

    /* El bloque gris del formato: las hojas de índice y de separador llevan
       su contenido dentro de un recuadro gris a casi todo lo ancho. */
    function bloqueGris(p, rec, y0, y1) {
        p.drawRectangle({ x: 55, y: y0, width: W - 110, height: y1 - y0, color: root.PDFLib.rgb(0.663, 0.663, 0.663) });
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

    function dibujarPortada(rec, d) {
        var L = root.PDFLib, p = pagina(rec);
        p.drawRectangle({ x: 60, y: H - 320, width: W - 120, height: 240, color: L.rgb(0.9, 0.9, 0.9) });
        texto(p, rec, 'Portafolio de Evidencias', 70, H - 100, 20, rec.negrita);
        /* El nombre del estándar se envuelve dentro del recuadro gris (antes
           el segundo renglón se salía por la derecha). */
        var est = envolver(ESTANDAR.join(' '), rec.normal, 10, W - 60 - 280 - 12);
        var filas = [['Candidato/a:', d.nombre || '']].concat(est.map(function (l, i) { return [i ? '' : 'Clave y nombre del estándar:', l]; }),
            [['Clave del CE:', '1399-OC063-18'], ['Evaluador:', d.evaluador || ''],
             ['Fecha:', fechaDMY(d.fecha)], ['Lote:', d.lote || '']]);
        var y = H - 130;
        filas.forEach(function (f) {
            if (f[0]) texto(p, rec, f[0], 80, y, 10, rec.negrita);
            texto(p, rec, f[1], 280, y, 10);
            y -= 16;
        });
    }

    function dibujarIndice(rec, avisos) {
        var L = root.PDFLib, p = pagina(rec);
        bloqueGris(p, rec, H - 560, H - 120);
        texto(p, rec, 'Índice', 75, H - 155, 18, rec.negrita);
        var items = ['1. Datos del candidato', '   Ficha de registro del candidato', '   Diagnóstico del candidato',
            '   Tríptico de Derechos y Obligaciones', '2. Recopilación de Evidencias',
            '   Plan de Evaluación Acordado con el Candidato', '   Instrumento de Evaluación Aplicado al Candidato',
            '   Evidencias complementarias (Las que solicite el IEC)', '3. Cierre de la Evaluación',
            '   Cédula de Evaluación del Candidato', '   Encuesta de satisfacción del candidato'];
        var y = H - 195;
        items.forEach(function (t) {
            var sub = t.indexOf('   ') === 0;
            if (sub) paloma(p, rec, 104, y + 1);
            texto(p, rec, sub ? t.trim() : t, sub ? 120 : 90, y, 11, sub ? rec.normal : rec.negrita);
            y -= 22;
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

    function dibujarSeparador(rec, titulo, nombre) {
        var p = pagina(rec);
        bloqueGris(p, rec, 60, H - 120);
        centrado(p, rec, titulo, H / 2 + 10, 20, rec.negrita);
        if (nombre) centrado(p, rec, nombre.toUpperCase(), H / 2 - 20, 12, rec.negrita);
    }

    function dibujarVideo(rec, link) {
        var p = pagina(rec);
        centrado(p, rec, 'Referencia al Video de la Sesión', H - 100, 14, rec.negrita);
        var lineas = envolver(link || 'NO PROPORCIONADA — solicitar al candidato', rec.normal, 10, W - 120);
        lineas.forEach(function (l, i) { centrado(p, rec, l, H - 140 - i * 14, 10); });
    }

    /* ── Páginas del formato 2026 ──────────────────────────────────────
       Las marcadoras, el tríptico, los tres formatos de cierre, la
       autorización de firma y la contraportada: todas vienen del machote
       `FORMATO PORTAFOLIO-1375-2026 copia.pdf` del Centro Evaluador. */
    var PIE_CE = 'CENTRO EVALUADOR CE1399-OC063-18 - COLEGIO ILUSTRE DE CIENCIAS FORENSES DE MÉXICO A.C. - BRASIL 306-2 COL. 27 DE SEPTIEMBRE, POZA RICA, VER. - 7821138710 - cicfm.ce@gmail.com';
    function pie(p, rec, t) { centrado(p, rec, t || PIE_CE, 32, 6.2); }

    /* Página marcadora en hoja aparte, como el machote. Solo la usa el IEC:
       sus 83 páginas se estampan en coordenadas fijas, así que esa plantilla
       no se puede recorrer ni escalar. */
    function dibujarMarca(rec, titulo) {
        var p = pagina(rec);
        texto(p, rec, titulo, 60, H - 150, 20, rec.negrita);
    }

    /* El rótulo como banda arriba del propio documento, para no gastar una
       hoja casi vacía (decisión de Diego, 23 sep). Devuelve la y del tope
       que queda libre para el documento. */
    function bandaMarca(p, rec, titulo) {
        texto(p, rec, titulo, 60, H - 56, 16, rec.negrita);
        p.drawLine({ start: { x: 60, y: H - 66 }, end: { x: W - 60, y: H - 66 }, thickness: 0.8, color: rec.negro });
        return H - 78;
    }

    /* Rejilla de etiqueta/valor con recuadro. Devuelve la y de abajo. */
    function rejilla(p, rec, x, y, anchoEtq, anchoVal, filas, size) {
        size = size || 8;
        filas.forEach(function (f) {
            /* La etiqueta también se envuelve: varias de este formato son
               largas ("Nombre completo del lugar o persona que realizó su
               evaluación") y en una sola línea se montaban sobre el valor. */
            var etq = envolver(f[0] || '', rec.negrita, size, anchoEtq - 8);
            var valor = envolver(f[1] || '', rec.normal, size, anchoVal - 8);
            var alto = Math.max(f[2] || 16, etq.length * (size + 2.5) + 6, valor.length * (size + 2.5) + 6);
            p.drawRectangle({ x: x, y: y - alto, width: anchoEtq, height: alto, borderColor: rec.negro, borderWidth: 0.7 });
            p.drawRectangle({ x: x + anchoEtq, y: y - alto, width: anchoVal, height: alto, borderColor: rec.negro, borderWidth: 0.7 });
            etq.forEach(function (l, i) { texto(p, rec, l, x + 4, y - 12 - i * (size + 2.5), size, rec.negrita); });
            valor.forEach(function (l, i) { texto(p, rec, l, x + anchoEtq + 4, y - 12 - i * (size + 2.5), size); });
            y -= alto;
        });
        return y;
    }
    /* Tabla de opciones (Bueno/Regular/Malo, SÍ/NO): una fila por concepto. */
    function tablaOpciones(p, rec, x, y, ancho, encabezados, filas, anchoOpc, marcas) {
        anchoOpc = anchoOpc || 52; marcas = marcas || [];
        var anchoTxt = ancho - anchoOpc * encabezados.length, alto = 15;
        p.drawRectangle({ x: x, y: y - alto, width: anchoTxt, height: alto, borderColor: rec.negro, borderWidth: 0.7 });
        texto(p, rec, 'Aspecto a calificar', x + 4, y - 11, 7.5, rec.negrita);
        encabezados.forEach(function (h, i) {
            p.drawRectangle({ x: x + anchoTxt + i * anchoOpc, y: y - alto, width: anchoOpc, height: alto, borderColor: rec.negro, borderWidth: 0.7 });
            centrado2(p, rec, h, x + anchoTxt + i * anchoOpc, anchoOpc, y - 11, 7.5, rec.negrita);
        });
        y -= alto;
        filas.forEach(function (f, fi) {
            var lineas = envolver(f, rec.normal, 7, anchoTxt - 8), h = Math.max(15, lineas.length * 9 + 6);
            p.drawRectangle({ x: x, y: y - h, width: anchoTxt, height: h, borderColor: rec.negro, borderWidth: 0.7 });
            lineas.forEach(function (l, i) { texto(p, rec, l, x + 4, y - 11 - i * 9, 7); });
            encabezados.forEach(function (_, i) {
                var cx = x + anchoTxt + i * anchoOpc;
                p.drawRectangle({ x: cx, y: y - h, width: anchoOpc, height: h, borderColor: rec.negro, borderWidth: 0.7 });
                if (marcas[fi] === i) centrado2(p, rec, 'X', cx, anchoOpc, y - h / 2 - 3.5, 10, rec.negrita);
            });
            y -= h;
        });
        return y;
    }
    function centrado2(p, rec, t, x, ancho, y, size, font) {
        t = limpiar(t); font = font || rec.normal;
        texto(p, rec, t, x + (ancho - font.widthOfTextAtSize(t, size)) / 2, y, size, font);
    }

    var TRIPTICO = {
        intro: 'Este tríptico tiene la finalidad de asegurar a los usuarios del Sistema Nacional de Competencias la transparencia en la información y el libre acceso en los procesos de evaluación - certificación, así como brindar certeza de que la operación de la Red CONOCER de Prestadores de Servicios se rige bajo estándares de calidad y excelencia, sea como empleadores, trabajadores y personas en general de los sectores social, productivo, educativo y de gobierno de nuestro país.',
        principios: 'Libre Acceso · Excelencia · Transparencia · Imparcialidad · Objetividad',
        derechos: [
            'Consultar en línea de manera gratuita los Estándares de Competencia inscritos en el Registro Nacional de Estándares de Competencia (RENEC), en www.conocer.gob.mx',
            'Disponer del Estándar de Competencia con base en el cual pretendan evaluarse con fines de certificación.',
            'Realizar su autodiagnóstico libre de costo con base al Estándar de Competencia de su interés.',
            'Contratar servicios de evaluación con la Entidad de Certificación y Evaluación, Organismo de Certificación, Centro de Evaluación que seleccione y acordar planes de evaluación.',
            'Realizar el proceso de evaluación de competencia sin obligación o condición de recibir un curso previo.',
            'Recibir retroalimentación verbal y documental de Entidad de Certificación y Evaluación de Competencias, Centro de Evaluación o Evaluador Independiente respecto al resultado de su evaluación de competencia.',
            'Contratar servicios de certificación con la Entidad de Certificación y Evaluación de Competencias u Organismo Certificador que seleccione.'
        ],
        obligaciones: [
            'Tratar con respeto al personal de CONOCER, de la Red de Prestadores de Servicios y a otros Usuarios.',
            'Respetar las fechas y horarios acordados para las diferentes etapas de atención a usuarios, proceso de evaluación y emisión de certificado, debiendo avisar con antelación si existe la imposibilidad de mantener la fecha y horario previstos.',
            'Entregar, bajo protesta de decir verdad, la información necesaria y veraz para proceder a la evaluación de sus competencias.',
            'Entregar oportunamente la documentación solicitada por el Prestador de Servicios.',
            'Colaborar y ser asertivo durante el acuerdo del plan de evaluación.',
            'Cumplir con las actividades y entrega de productos acordados en el plan de evaluación.',
            'Atender los lineamientos de seguridad, manejo de maquinaria, equipo y suministros establecido dentro de las instalaciones del Prestador de Servicios.',
            'Ejercer sus derechos libremente comunicando por medios formales las quejas y sugerencias, en caso de que sea necesario.'
        ]
    };
    function dibujarTriptico(rec) {
        var p = pagina(rec), y = H - 95;
        texto(p, rec, 'DERECHOS Y OBLIGACIONES', 50, y, 14, rec.negrita);
        y -= 18;
        envolver(TRIPTICO.intro, rec.normal, 8, W - 100).forEach(function (l) { texto(p, rec, l, 50, y, 8); y -= 10; });
        y -= 10;
        texto(p, rec, 'Principios de la Certificación:', 50, y, 9, rec.negrita); y -= 12;
        texto(p, rec, TRIPTICO.principios, 50, y, 8); y -= 18;
        [['Derechos de los usuarios:', TRIPTICO.derechos], ['Obligaciones:', TRIPTICO.obligaciones]].forEach(function (bloque) {
            if (y < 90) { p = pagina(rec); y = H - 95; }
            texto(p, rec, bloque[0], 50, y, 9, rec.negrita); y -= 13;
            bloque[1].forEach(function (t) {
                envolver(t, rec.normal, 7.5, W - 116).forEach(function (l, i) {
                    if (y < 60) { p = pagina(rec); y = H - 95; }
                    texto(p, rec, (i === 0 ? '• ' : '   ') + l, 56, y, 7.5); y -= 9.5;
                });
                y -= 2;
            });
            y -= 8;
        });
    }

    /* Qué pregunta cada formato vive en cierre.js, que es también lo que
       llena el evaluador en admin-cierre.html: una sola fuente. */
    function C() { return root.Cierre || {}; }
    function marcaDe(valor, opciones) { var i = opciones.indexOf(valor); return i < 0 ? -1 : i; }
    async function dibujarCedulaServicio(rec, d) {
        var c = C(), datos = (d.cierreCandidato && d.cierreCandidato.servicio) || {}, asp = datos.aspectos || {};
        var aspectos = c.ASPECTOS_SERVICIO || [], escala = c.ESCALA_SERVICIO || ['Bueno', 'Regular', 'Malo'];
        var p = pagina(rec), y = H - 88;
        centrado(p, rec, 'Sistema Nacional de Competencia en la operación de la Evaluación y Certificación', y, 8, rec.negrita); y -= 13;
        centrado(p, rec, 'Cédula de Evaluación del Servicio a usuarios en el Proceso de Evaluación - Certificación', y, 8.5, rec.negrita); y -= 20;
        texto(p, rec, 'DATOS GENERALES DEL USUARIO', 50, y, 8, rec.negrita); y -= 8;
        var medios = (c.MEDIOS_EVALUACION || []).map(function (m) {
            return m + ' (' + (datos.medio === m ? 'X' : ' ') + ')' + (datos.medio === m && m === 'Otro' && datos.otroMedio ? ' ' + datos.otroMedio : '');
        }).join(' · ');
        var yFirma = y - 12;
        y = rejilla(p, rec, 50, y, 175, W - 225, [
            ['Nombre y firma del usuario', d.nombre || '', 30],
            ['Nombre completo del lugar o persona que realizó su evaluación', d.evaluador || '', 26],
            ['Medio por el cual contactó a la organización o persona que le realizó la evaluación', medios, 26]
        ]);
        if (d.firmaCandidato) await firmaEnCaja(p, rec, d.firmaCandidato, W - 170, yFirma - 20, 110, 26);
        y -= 14;
        envolver('Marque con una X la opción que usted considere adecuada de acuerdo a su opinión. Si alguno de los aspectos a evaluar no aplica escriba NA en la columna "Bueno".', rec.normal, 7.5, W - 100)
            .forEach(function (l) { texto(p, rec, l, 50, y, 7.5); y -= 10; });
        y -= 4;
        y = tablaOpciones(p, rec, 50, y, W - 100, escala, aspectos, null,
            aspectos.map(function (_, i) { return marcaDe(asp[i], escala); }));
        y -= 14;
        texto(p, rec, 'Comentarios y/o sugerencias:', 50, y, 8, rec.negrita);
        p.drawRectangle({ x: 50, y: y - 46, width: W - 100, height: 40, borderColor: rec.negro, borderWidth: 0.7 });
        envolver(datos.comentarios || '', rec.normal, 7.5, W - 112).slice(0, 4)
            .forEach(function (l, i) { texto(p, rec, l, 56, y - 18 - i * 9.5, 7.5); });
        y -= 60;
        envolver('Gracias por su tiempo de llenado de este formato, su opinión es valiosa para mejorar nuestro servicio. Si requiere ampliar la información escriba a contacto@conocer.gob.mx, con gusto le atenderemos.', rec.normal, 6.5, W - 100)
            .forEach(function (l) { centrado(p, rec, l, y, 6.5); y -= 8; });
        pie(p, rec);
    }

    async function dibujarVerificacion(rec, d) {
        var c = C(), datos = (d.cierre && d.cierre.verificacion) || {}, items = datos.items || {};
        var lista = c.VERIFICACION || [];
        var p = pagina(rec), y = H - 92;
        centrado(p, rec, 'Verificación Interna del Proceso de Evaluación', y, 12, rec.negrita); y -= 20;
        y = rejilla(p, rec, 50, y, 110, 220, [['Candidato/a:', d.nombre || ''], ['Centro Evaluador:', 'CE1399-OC063-18'], ['Fecha:', fechaDMY(d.fecha)]]);
        y -= 16;
        texto(p, rec, 'Verifique el proceso de evaluación marcando los criterios descritos:', 50, y, 8); y -= 14;
        var grupos = [];
        lista.forEach(function (v) { if (grupos.indexOf(v.grupo) < 0) grupos.push(v.grupo); });
        grupos.forEach(function (g) {
            texto(p, rec, g, 50, y, 7.5, rec.negrita); y -= 12;
            lista.filter(function (v) { return v.grupo === g; }).forEach(function (v) {
                var anchoTxt = W - 100 - 24 - 60;
                var lineas = envolver(v.texto, rec.normal, 7, anchoTxt - 10), alto = Math.max(15, lineas.length * 9 + 6);
                p.drawRectangle({ x: 50, y: y - alto, width: 24, height: alto, borderColor: rec.negro, borderWidth: 0.7 });
                p.drawRectangle({ x: 74, y: y - alto, width: anchoTxt, height: alto, borderColor: rec.negro, borderWidth: 0.7 });
                p.drawRectangle({ x: W - 110, y: y - alto, width: 60, height: alto, borderColor: rec.negro, borderWidth: 0.7 });
                texto(p, rec, String(v.n), 58, y - 11, 7.5);
                lineas.forEach(function (l, j) { texto(p, rec, l, 78, y - 11 - j * 9, 7); });
                var marca = items[v.n] === 'si' ? 'SÍ  (X)    NO (  )' : items[v.n] === 'no' ? 'SÍ  (  )    NO (X)' : 'SÍ  (  )    NO (  )';
                texto(p, rec, marca, W - 106, y - 11, 7);
                y -= alto;
            });
            y -= 8;
        });
        texto(p, rec, 'Observaciones:', 50, y, 8, rec.negrita);
        p.drawRectangle({ x: 50, y: y - 40, width: W - 100, height: 34, borderColor: rec.negro, borderWidth: 0.7 });
        envolver(datos.observaciones || '', rec.normal, 7.5, W - 112).slice(0, 3)
            .forEach(function (l, i) { texto(p, rec, l, 56, y - 18 - i * 9.5, 7.5); });
        y -= 66;
        if (d.firmaCierre) await firmaEnCaja(p, rec, d.firmaCierre, (W - 150) / 2, y + 4, 150, 40);
        p.drawLine({ start: { x: 190, y: y }, end: { x: W - 190, y: y }, thickness: 0.8, color: rec.negro });
        centrado(p, rec, datos.verificador || '', y - 10, 8, rec.negrita);
        centrado(p, rec, 'Nombre y firma Verificador/a del proceso', y - 21, 7.5);
        pie(p, rec);
    }

    async function dibujarAtencion(rec, d) {
        var c = C(), datos = (d.cierreCandidato && d.cierreCandidato.atencion) || {}, resp = datos.respuestas || {};
        var preguntas = c.ATENCION_PREGUNTAS || [], escala = c.ESCALA_SERVICIO || ['Bueno', 'Regular', 'Malo'];
        var p = pagina(rec), y = H - 88;
        centrado(p, rec, 'Sistema Nacional de Competencia en la operación de la Evaluación y Certificación', y, 8, rec.negrita); y -= 13;
        centrado(p, rec, 'Formato de Atención a Usuarios', y, 9.5, rec.negrita); y -= 20;
        var medios = (c.MEDIOS_ATENCION || []).map(function (m) {
            return m + ' (' + (datos.medio === m ? 'X' : ' ') + ')' + (datos.medio === m && m === 'Otro' && datos.otroMedio ? ' ' + datos.otroMedio : '');
        }).join('   ');
        y = rejilla(p, rec, 50, y, 110, 180, [['Folio:', datos.folio || ''], ['Fecha:', fechaDMY(d.fecha)],
            ['Medio de Contacto:', medios], ['Lugar:', datos.lugar || '']]);
        y -= 14;
        envolver('Estimado usuario, le agradeceremos que conteste el siguiente cuestionario para mejorar nuestro servicio.', rec.normal, 7.5, W - 100)
            .forEach(function (l) { texto(p, rec, l, 50, y, 7.5); y -= 10; });
        y -= 6;
        texto(p, rec, 'DATOS GENERALES DEL USUARIO', 50, y, 8, rec.negrita); y -= 8;
        y = rejilla(p, rec, 50, y, 110, W - 210, [['Nombre:', d.nombre || ''], ['Domicilio:', datos.domicilio || ''],
            ['Colonia / Código Postal:', [datos.colonia, datos.cp].filter(Boolean).join(' · ')],
            ['Delegación o Municipio / Estado:', [datos.municipio, datos.estado].filter(Boolean).join(' · ')],
            ['Ciudad:', datos.ciudad || ''], ['Teléfono(s):', datos.telefono || ''], ['E-Mail:', datos.email || ''],
            ['EC o área de interés:', 'EC1375']]);
        y -= 30;
        if (d.firmaCandidato) await firmaEnCaja(p, rec, d.firmaCandidato, 80, y + 4, 140, 34);
        if (d.firmaCierre) await firmaEnCaja(p, rec, d.firmaCierre, W - 240, y + 4, 140, 34);
        p.drawLine({ start: { x: 55, y: y }, end: { x: 265, y: y }, thickness: 0.8, color: rec.negro });
        p.drawLine({ start: { x: W - 265, y: y }, end: { x: W - 55, y: y }, thickness: 0.8, color: rec.negro });
        texto(p, rec, 'Nombre y firma del usuario', 55, y - 10, 7);
        texto(p, rec, 'Nombre y firma de quien atendió al usuario', W - 265, y - 10, 7);
        textoAjustado(p, rec, d.nombre || '', 55, y - 19, 7, 205, rec.negrita);
        textoAjustado(p, rec, d.evaluador || '', W - 265, y - 19, 7, 205, rec.negrita);
        y -= 34;
        y = tablaOpciones(p, rec, 50, y, W - 100, escala, preguntas, null,
            preguntas.map(function (_, i) { return marcaDe(resp[i], escala); }));
        pie(p, rec, 'BRASIL 306-2 COL. 27 DE SEPTIEMBRE, POZA RICA, VER. - 7821138710 - centrodeinclusioncicata@gmail.com');
    }

    async function dibujarAutorizacionFirma(rec, d) {
        var p = pagina(rec), y = H - 100;
        centrado(p, rec, 'AUTORIZACIÓN FIRMA ELECTRÓNICA', y, 14, rec.negrita); y -= 28;
        y = rejilla(p, rec, 70, y, 130, W - 270, [['Centro de Evaluación:', d.ceNombre || ''], ['Evaluador/a:', d.evaluador || ''],
            ['Estándar de Competencia:', ESTANDAR.join(' ')], ['Candidato/a:', d.nombre || ''], ['Fecha:', fechaDMY(d.fecha)]]);
        y -= 34;
        envolver('CONFIRMO QUE HE LEÍDO EL AVISO DE PRIVACIDAD DE COLEGIO ILUSTRE DE CIENCIAS FORENSES Y ESTOY DE ACUERDO EN TODO LO ESTIPULADO EN EL DOCUMENTO. ASÍ MISMO AUTORIZO Y PRESTO MI FIRMA DIGITAL PARA SER PLASMADA EXCLUSIVAMENTE EN TODAS LAS FOJAS DEL INSTRUMENTO DE EVALUACIÓN DE COMPETENCIAS DEL EC1375.', rec.normal, 9, W - 160)
            .forEach(function (l) { texto(p, rec, l, 80, y, 9); y -= 13; });
        y -= 60;
        if (d.firmaCandidato) await firmaEnCaja(p, rec, d.firmaCandidato, (W - 160) / 2, y + 4, 160, 56);
        p.drawLine({ start: { x: 170, y: y }, end: { x: W - 170, y: y }, thickness: 0.9, color: rec.negro });
        centrado(p, rec, d.nombre || '', y - 12, 9, rec.negrita);
        centrado(p, rec, 'Firma de la o el candidato/a', y - 24, 8);
        pie(p, rec);
    }

    function dibujarContraportada(rec) {
        var p = pagina(rec);
        centrado(p, rec, 'www.conocer.gob.mx', H / 2, 16, rec.negrita);
        centrado(p, rec, '01 800 288 26 66', H / 2 - 24, 13);
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
        var campos = (root.Evaluacion ? root.Evaluacion.CAMPOS_CEDULA : []).map(function (k) { return [k.id, k.label + ':']; });
        if (!campos.length) campos = [['mejoresPracticas', 'Mejores prácticas:'], ['areasOportunidad', 'Áreas de oportunidad:'],
            ['criteriosNoCubiertos', 'Criterios de Evaluación que no se cubrieron:'], ['incidencias', 'Incidencias:'], ['recomendaciones', 'Recomendaciones:']];
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
        y -= altoObs + 26;
        /* Acuse de la Cédula, dentro de la propia Cédula (formato 2026). */
        if (y < 90) { p = pagina(rec); y = H - 110; }
        p.drawRectangle({ x: 50, y: y - 46, width: W - 100, height: 46, borderColor: rec.negro, borderWidth: 0.7 });
        texto(p, rec, 'RECIBÍ COPIA DE LA CÉDULA DE EVALUACIÓN (ACUSE)', 56, y - 14, 8, rec.negrita);
        texto(p, rec, 'Sí ____   No ____', 56, y - 32, 8);
        p.drawLine({ start: { x: 300, y: y - 26 }, end: { x: W - 60, y: y - 26 }, thickness: 0.8, color: rec.negro });
        texto(p, rec, 'NOMBRE Y FIRMA DEL USUARIO', 300, y - 38, 7.5);
        pie(p, rec, 'Brasil # 306-2 Col. 27 de septiembre, Poza Rica, Ver. - 7821138710 - cicfm.ce@gmail.com');
        return L;
    }

    /* ── Estampado sobre documentos del candidato (19 sep) ── */
    function textoAjustado(p, rec, t, x, y, size, ancho, font) {
        t = limpiar(t); font = font || rec.normal;
        while (size > 5.5 && font.widthOfTextAtSize(t, size) > ancho) size -= 0.5;
        texto(p, rec, t, x, y, size, font);
    }
    /* Firma dentro de una caja (x, y abajo, ancho, alto): imagen ajustada o
       nombre escrito en itálica. */
    async function firmaEnCaja(p, rec, firma, x, y, ancho, alto) {
        var img = await imagenFirma(rec, firma);
        if (img) {
            var esc = Math.min(ancho / img.width, alto / img.height);
            p.drawImage(img, { x: x + (ancho - img.width * esc) / 2, y: y + (alto - img.height * esc) / 2, width: img.width * esc, height: img.height * esc });
            return true;
        }
        if (firma && firma.mode === 'type' && firma.typedName) {
            textoAjustado(p, rec, firma.typedName, x + 4, y + alto / 2 - 4, 13, ancho - 8, rec.italica);
            return true;
        }
        return false;
    }
    /* Plan y acuses: nombre del evaluador y del Centro en su renglón. */
    function sellarCampos(p, rec, lineas, campos, etiquetaDoc, avisos) {
        campos.forEach(function (c) {
            var u = ubicarCampo(lineas, c.re);
            if (!u) { avisos.push("No se encontró '" + c.nombre + "' en " + etiquetaDoc + ': revisar a mano'); return; }
            if (!u.lleno) textoAjustado(p, rec, c.valor, u.x, u.y, u.size, p.getWidth() - u.x - 30);
        });
    }
    /* Firma del evaluador en el Plan: misma caja que la del candidato en
       plan-evaluacion.html (55 × 20 mm, 3 mm bajo su etiqueta) y su nombre
       donde el candidato tiene "Estoy de acuerdo" (26 mm abajo). */
    async function sellarFirmaPlan(paginas, lineasPorPag, rec, firma, nombre, avisos) {
        var MM = 72 / 25.4;
        for (var i = lineasPorPag.length - 1; i >= 0; i--) {
            var l = lineasPorPag[i].filter(function (x) { return /^Nombre y firma de la Evaluadora/.test(x.texto); })[0];
            if (!l) continue;
            var lab = l.items[0], p = paginas[i];
            if (firma) await firmaEnCaja(p, rec, firma, lab.x, lab.y - 23 * MM, 55 * MM, 20 * MM);
            textoAjustado(p, rec, nombre, lab.x, lab.y - 26 * MM, 8, 70 * MM, rec.negrita);
            return;
        }
        avisos.push("No se encontró el espacio de firma del evaluador en el Plan de Evaluación: revisar a mano");
    }
    /* IEC: posiciones de la plantilla (las mismas del expediente de Humberto,
       medidas con pdftotext -bbox): nombres y fecha en la página 1 y rúbricas
       con nombre en las 83 páginas. */
    async function sellarIec(paginas, rec, s, avisos) {
        var p1 = paginas[0];
        if (p1) {
            textoAjustado(p1, rec, s.evaluadorMayus, 208, 619.3, 10, 230);
            textoAjustado(p1, rec, s.candidatoMayus, 205.4, 589.3, 10, 215);
            if (s.fechaAplicacion) textoAjustado(p1, rec, s.fechaAplicacion, 426, 589.3, 10, 150);
        }
        for (var i = 0; i < paginas.length; i++) {
            var p = paginas[i];
            textoAjustado(p, rec, s.evaluadorMayus, 68, 48.3, 10, 280);
            textoAjustado(p, rec, s.candidatoMayus, 355, 49.3, 10, 230);
            if (s.firmaIec) await firmaEnCaja(p, rec, s.firmaIec, 106, 56, 120, 38);
            if (s.firmaCandidato) await firmaEnCaja(p, rec, s.firmaCandidato, 392, 56, 120, 38);
        }
        marcarReactivos(paginas, rec, s, avisos || []);
    }

    /* Las 142 marcas del IEC que capturó el evaluador en admin-iec.html, las
       37 respuestas del cuestionario, y la hoja de cuantificación con el
       juicio (página 74).

       La plantilla se reconstruyó el 22 sep desde el expediente de Humberto
       (`_internal_no_publicar/01-scripts/construir_plantilla_iec.py`) y ahora
       sí está en blanco: antes traía sus palomas, sus respuestas y su juicio,
       y además venía dañada — las tablas salían con el texto cortado. */
    /* Coordenadas medidas en la plantilla: los tres renglones de la
       cuantificación y el centro de cada casilla del juicio. */
    var IEC_P74 = {
        puntos: { x: 507, y: 649.72 }, penalizacion: { x: 507, y: 612.72 }, total: { x: 507, y: 572.72 },
        competente: { x: 132.5, y: 187.72 }, noCompetente: { x: 340.5, y: 187.72 }
    };
    function marcarReactivos(paginas, rec, s, avisos) {
        var R = root.IecReactivos, I = root.Iec;
        if (!s.iec || !s.iec.respuestas) return;
        if (!R || !I) { avisos.push('El IEC quedó sin marcar: la página no cargó iec-reactivos.js / iec.js'); return; }
        var resp = s.iec.respuestas, obs = s.iec.observaciones || {}, marcados = 0;
        /* Una observación junto a un Sí se imprime contradiciéndose (en el
           instrumento la observación es la razón de un No). No se borra el
           texto del evaluador ni se le cambia la marca: se avisa en el Índice
           para que lo resuelva antes de entregar. */
        var choca = I.contradicciones ? I.contradicciones(s.iec) : [];
        if (choca.length) avisos.push('El IEC trae ' + choca.length + ' reactivo' + (choca.length > 1 ? 's' : '') + ' marcado' + (choca.length > 1 ? 's' : '') + ' Sí con observación (' + choca.join(', ') + '): revisar en "Calificar el IEC" antes de entregar.');
        R.REACTIVOS.forEach(function (r) {
            var v = resp[r.n];
            if (v !== 'si' && v !== 'no') return;
            var p = paginas[r.pag - 1];
            if (!p) { avisos.push('El IEC no trae la página ' + r.pag + ': el reactivo ' + r.cod + ' quedó sin marcar'); return; }
            var col = R.columnas(r.pag), x = v === 'si' ? col.si : col.no;
            texto(p, rec, 'X', x - rec.negrita.widthOfTextAtSize('X', 11) / 2, r.y, 11, rec.negrita);
            marcados++;
            var t = obs[r.n];
            if (t) envolver(t, rec.normal, 6, col.obsAncho).slice(0, 5)
                .forEach(function (l, i) { texto(p, rec, l, col.obs, r.y + 4 - i * 7, 6); });
        });
        /* "Respuesta Elejida": la opción que eligió el candidato en cada una
           de las 37 preguntas del cuestionario del instrumento. */
        var cuest = s.iec.cuestionario || {};
        (R.CUESTIONARIO || []).forEach(function (q) {
            var v = String(cuest[q.n] === undefined || cuest[q.n] === null ? '' : cuest[q.n]).trim();
            if (!v) return;
            var p = paginas[q.pag - 1];
            if (!p) { avisos.push('El IEC no trae la página ' + q.pag + ': la respuesta de la pregunta ' + q.n + ' quedó sin escribir'); return; }
            textoAjustado(p, rec, v, q.x, q.y, 10, 190);
        });
        if (!marcados) return;
        var c = I.calificar(resp), p74 = paginas[R.PAGINA_JUICIO - 1];
        if (!p74) { avisos.push('El IEC no trae la página ' + R.PAGINA_JUICIO + ': el juicio quedó sin escribir'); return; }
        [['puntos', c.puntos], ['penalizacion', c.penalizacion], ['total', c.total]].forEach(function (f) {
            var pos = IEC_P74[f[0]];
            texto(p74, rec, f[1].toFixed(2), pos.x, pos.y, 10);
        });
        var m = c.juicio === 'COMPETENTE' ? IEC_P74.competente : IEC_P74.noCompetente;
        texto(p74, rec, 'X', m.x - rec.negrita.widthOfTextAtSize('X', 11) / 2, m.y, 11, rec.negrita);
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
        else if (!ev.firma_candidato) avisos.push('La Cédula de Evaluación todavía no tiene la firma del candidato (también es su rúbrica en el IEC)');
        var sellos = E.sellosPortafolio(ctx.row, ev, { lote: ctx.lote });
        avisos = avisos.concat(sellos.avisos);
        var SELLAR = { pdf_plan_evaluacion: 'el Plan de Evaluación', acuse_triptico: 'el Acuse del Tríptico', acuse_plan_evaluacion: 'el Acuse del Plan de Evaluación' };

        /* 1. Descargar del NAS (en orden, para reportar avance). */
        var cargados = {}, porDescargar = plan.items.filter(function (i) { return i.tipo !== 'generado'; });
        for (var k = 0; k < porDescargar.length; k++) {
            var it = porDescargar[k];
            progreso('Descargando ' + (k + 1) + ' de ' + porDescargar.length + ': ' + it.etiqueta);
            try {
                var bytes = await descargarNas(it.ruta, ctx.token), ext = extension(it.ruta);
                if (ext === 'pdf') {
                    cargados[it.ruta] = { pdf: await L.PDFDocument.load(bytes, { ignoreEncryption: true }) };
                    if (SELLAR[it.slot]) {
                        try { cargados[it.ruta].lineas = await lineasPdf(bytes); }
                        catch (e) { avisos.push('No se pudo leer ' + SELLAR[it.slot] + ' para poner los datos del evaluador: revisar a mano (' + (e.message || e) + ')'); }
                    }
                }
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
        var datosPag = { nombre: plan.nombre, evaluador: sellos.evaluador, fecha: sellos.fechaPortada, lote: sellos.lote,
            ceNombre: sellos.ceNombre, email: ctx.email || '', firmaCandidato: sellos.firmaCandidato,
            cierre: sellos.cierre, cierreCandidato: sellos.cierreCandidato, firmaCierre: sellos.firmaCierre };
        var marcaPendiente = null;
        for (var n = 0; n < plan.items.length; n++) {
            var item = plan.items[n];
            if (item.tipo === 'generado') {
                if (item.pagina === 'portada') dibujarPortada(rec, datosPag);
                else if (item.pagina === 'indice') dibujarIndice(rec, avisos);
                else if (item.pagina === 'marca') {
                    var sig = plan.items[n + 1];
                    if (sig && sig.slot === 'iec') dibujarMarca(rec, item.texto);   /* ver bandaMarca */
                    else marcaPendiente = item.texto;
                }
                else if (SEP[item.pagina]) dibujarSeparador(rec, SEP[item.pagina], plan.nombre);
                else if (item.pagina === 'triptico') dibujarTriptico(rec);
                else if (item.pagina === 'video') dibujarVideo(rec, plan.videoLink);
                else if (item.pagina === 'cedula') await dibujarCedula(rec, { cedula: ced || {}, firmaCandidato: ced ? ev.firma_candidato : null, nombre: plan.nombre });
                else if (item.pagina === 'cedula_servicio') await dibujarCedulaServicio(rec, datosPag);
                else if (item.pagina === 'verificacion') await dibujarVerificacion(rec, datosPag);
                else if (item.pagina === 'atencion_usuarios') await dibujarAtencion(rec, datosPag);
                else if (item.pagina === 'autorizacion_firma') await dibujarAutorizacionFirma(rec, datosPag);
                else if (item.pagina === 'contraportada') dibujarContraportada(rec);
                continue;
            }
            var c = cargados[item.ruta];
            if (!c) continue;
            if (c.pdf) {
                var indices = c.pdf.getPageIndices();
                if (marcaPendiente) {
                    var emb = (await doc.embedPdf(c.pdf, [0]))[0];
                    var pg0 = doc.addPage([W, H]), tope = bandaMarca(pg0, rec, marcaPendiente), alto = tope - 30;
                    var e0 = Math.min((W - 24) / emb.width, alto / emb.height, 1);
                    pg0.drawPage(emb, { x: (W - emb.width * e0) / 2, y: 30 + (alto - emb.height * e0) / 2, xScale: e0, yScale: e0 });
                    marcaPendiente = null;
                    indices = indices.slice(1);
                }
                var paginas = await doc.copyPages(c.pdf, indices);
                paginas.forEach(function (pg) { doc.addPage(pg); });
                /* Datos del evaluador que el candidato no podía conocer al generar. */
                if (item.slot === 'iec') await sellarIec(paginas, rec, sellos, avisos);
                else if (SELLAR[item.slot] && c.lineas) {
                    var esPlan = item.slot === 'pdf_plan_evaluacion';
                    sellarCampos(paginas[0], rec, c.lineas[0], [
                        { re: /^Evaluador[a]?:/, nombre: 'Evaluadora:', valor: sellos.evaluador },
                        { re: /^Centro de Evaluaci[oó]n:/, nombre: 'Centro de Evaluación:', valor: esPlan ? sellos.ceClave : sellos.ceNombre }
                    ], SELLAR[item.slot], avisos);
                    if (esPlan) await sellarFirmaPlan(paginas, c.lineas, rec, sellos.firmaPlan, sellos.evaluador, avisos);
                }
            } else {
                try {
                    var img = c.png ? await doc.embedPng(c.img) : await doc.embedJpg(c.img);
                    var pg = doc.addPage([W, H]), tope = H - 36;
                    if (marcaPendiente) { tope = bandaMarca(pg, rec, marcaPendiente); marcaPendiente = null; }
                    var alto = tope - 36, esc = Math.min((W - 72) / img.width, alto / img.height, 1.5);
                    pg.drawImage(img, { x: (W - img.width * esc) / 2, y: 36 + (alto - img.height * esc) / 2, width: img.width * esc, height: img.height * esc });
                } catch (e) { avisos.push("'" + item.etiqueta + "': la imagen no se pudo insertar (" + (e.message || e) + ')'); }
            }
        }
        progreso('Guardando…');
        var out = await doc.save();
        return { bytes: out, paginas: doc.getPageCount(), avisos: avisos, nombreArchivo: nombreArchivo(plan.nombre) };
    }

    var api = { generar: generar, cedulaPdf: cedulaPdf, descargarNas: descargarNas, nombreArchivo: nombreArchivo, _limpiar: limpiar, _fechaDMY: fechaDMY,
        _agruparLineas: agruparLineas, _ubicarCampo: ubicarCampo };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.Portafolio = api;
})(typeof window !== 'undefined' ? window : this);
