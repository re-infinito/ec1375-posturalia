/* =========================================================
   formatos-consultorio.js — formatos en blanco para el consultorio del
   candidato (toolkit de recursos, 17 sep) y fuente única del Aviso de
   Privacidad (también lo usa documentos-sesion.html).

   Cada formato se describe como bloques de contenido y se pinta igual a PDF
   (jsPDF, ya cargado en la página) y a Word (.docx con la librería `docx`,
   que se carga solo al descargar). Sin logos de RED CONOCER ni ICE México:
   son del expediente oficial y en formatos del consultorio podrían leerse
   como aval institucional.

   Bloques: { t: 'titulo'|'sub'|'h'|'p'|'li'|'pie', x }
            { t: 'campos', filas: [etiqueta, …] }          etiqueta: ______
            { t: 'tabla', cols: [...], filas: [[...], …] }  celdas '' = en blanco
            { t: 'lineas', n }                              renglones para escribir
            { t: 'firmas', items: [etiqueta, …] }

   Helpers puros probados en tests/formatos-consultorio.test.js.
========================================================= */
(function (root) {
    'use strict';

    var FALTANTE = '__________';

    /* Aviso de privacidad simplificado. Texto modelo redactado por nosotros:
       conviene que lo valide el evaluador. opts.evaluacion (default true)
       agrega la finalidad de integrar la sesión grabada al portafolio EC1375
       (Documentos de Sesión); el toolkit del consultorio la omite. */
    function avisoPrivacidadBloques(d, opts) {
        d = d || {};
        var evaluacion = !(opts && opts.evaluacion === false);
        var b = [
            { t: 'titulo', x: 'AVISO DE PRIVACIDAD SIMPLIFICADO' },
            { t: 'p', x: (d.responsable || FALTANTE) + ', con domicilio en ' + (d.domicilio || FALTANTE) + ', es responsable del tratamiento de los datos personales que usted proporcione, conforme a la Ley Federal de Protección de Datos Personales en Posesión de Particulares.' },
            { t: 'h', x: '¿Qué datos recabamos?' },
            { t: 'p', x: 'Datos de identificación y contacto (nombre, edad, fecha de nacimiento, domicilio, teléfono, correo electrónico y familiar a quien avisar) y datos sobre su salud (antecedentes, signos vitales, observación postural y evolución), que la ley considera datos personales sensibles.' },
            { t: 'h', x: '¿Para qué los usamos?' },
            { t: 'li', x: 'Integrar su ficha de registro y su expediente de atención.' },
            { t: 'li', x: 'Verificar que no exista impedimento para recibir el servicio, brindarle la atención y darle seguimiento.' },
            { t: 'li', x: 'Contactarle para programar y dar seguimiento a sus sesiones.' }
        ];
        if (evaluacion) {
            b.push({ t: 'li', x: 'Integrar la grabación de esta sesión y los documentos de su atención al portafolio de evidencias con el que quien le atiende se evalúa en el Estándar de Competencia EC1375 ante el Centro Evaluador (SEP-CONOCER).' });
        }
        b.push(
            { t: 'h', x: '¿Con quién los compartimos?' },
            { t: 'p', x: evaluacion
                ? 'Solo con el Centro Evaluador, para la finalidad anterior, y con las autoridades que lo requieran conforme a la ley. No vendemos ni cedemos sus datos personales.'
                : 'No compartimos sus datos personales con terceros, salvo con las autoridades que lo requieran conforme a la ley. No vendemos ni cedemos sus datos personales.' },
            { t: 'h', x: 'Sus derechos' },
            { t: 'p', x: 'Usted puede acceder a sus datos, rectificarlos, cancelarlos u oponerse a su uso (derechos ARCO), así como revocar su consentimiento, solicitándolo a: ' + (d.contacto || FALTANTE) + '.' },
            { t: 'h', x: 'Consentimiento' },
            { t: 'p', x: 'Al firmar de enterado, usted manifiesta que se le informó este aviso y otorga su consentimiento expreso para el tratamiento de sus datos personales, incluidos los sensibles, para las finalidades descritas.' }
        );
        return b;
    }

    var TEXTO_CONSENTIMIENTO = 'Yo, ________________________________________, expreso mi libre voluntad para autorizar el procedimiento señalado en este documento después de haberme proporcionado la información completa sobre padecimiento o estado actual, la cual fue realizada en forma amplia, precisa y suficiente en un lenguaje claro y sencillo, informándome sobre posibles riesgos, complicaciones y secuelas de igual forma los beneficios. El especialista informó métodos alternativos, el derecho de cambiar mi decisión en cualquier momento y manifestarla antes de cualquier procedimiento. Con el propósito de que mi atención sea adecuada, me comprometo a proporcionar información completa y veraz, así como seguir las indicaciones del especialista. Otorgo mi autorización al personal asistente auxiliar, así como al profesional que brinda los servicios tradicionales y complementarios la atención de contingencias y urgencias derivadas del procedimiento señalado, atendiendo al principio de libertad prescriptiva.';

    var FORMATOS = [
        { id: 'aviso', titulo: 'Aviso de Privacidad', desc: 'Con tus datos como responsable, listo para que cada paciente firme de enterado.' },
        { id: 'consentimiento', titulo: 'Consentimiento Informado', desc: 'Carta de consentimiento con condiciones del servicio y aviso de privacidad incluido.' },
        { id: 'plan-sesion', titulo: 'Plan de Sesión', desc: 'Registro de cada sesión: signos vitales, técnica, evolución y tareas para casa.' },
        { id: 'plan-seguimiento', titulo: 'Plan de Seguimiento', desc: 'Contacto del paciente y calendario de sesiones programadas.' }
    ];

    function encabezado(titulo, r) {
        var partes = [r.responsable, r.domicilio, r.contacto].filter(Boolean);
        return [{ t: 'titulo', x: titulo }, { t: 'sub', x: partes.length ? partes.join(' · ') : 'Responsable: ' + FALTANTE }];
    }
    var PIE = { t: 'pie', x: 'Formato elaborado conforme al Estándar de Competencia EC1375.' };

    function bloques(id, r) {
        r = r || {};
        var prestador = 'Nombre y firma de quien brinda el servicio' + (r.responsable ? ' (' + r.responsable + ')' : '');
        if (id === 'aviso') {
            return encabezado('AVISO DE PRIVACIDAD', r)
                .concat(avisoPrivacidadBloques(r, { evaluacion: false }).slice(1))
                .concat([{ t: 'campos', filas: ['Nombre del usuario', 'Fecha'] }, { t: 'firmas', items: ['Firma de enterado del usuario', prestador] }, PIE]);
        }
        if (id === 'consentimiento') {
            return encabezado('CARTA DE CONSENTIMIENTO INFORMADO', r).concat([
                { t: 'campos', filas: ['Fecha', 'Nombre del usuario', 'Edad', 'Fecha de nacimiento', 'Domicilio', 'Familiar o responsable a avisar', 'Técnica a aplicar', 'Expediente No.'] },
                { t: 'tabla', cols: ['Condiciones del servicio', 'Detalle'], filas: [
                    ['Zonas del cuerpo que se abordarán', ''], ['Vestimenta recomendada', ''], ['Reacciones o sensaciones posibles', ''],
                    ['Limitantes de aplicación del servicio', ''], ['Condiciones de preparación', ''], ['Número de sesiones y duración', ''],
                    ['Objetivos y efectos generales', '']
                ] },
                { t: 'h', x: 'Aviso de Privacidad' }
            ]).concat(avisoPrivacidadBloques(r, { evaluacion: false }).slice(1)).concat([
                { t: 'h', x: 'Declaración de consentimiento' },
                { t: 'p', x: TEXTO_CONSENTIMIENTO },
                { t: 'firmas', items: ['Nombre completo y firma del usuario', prestador] },
                PIE
            ]);
        }
        if (id === 'plan-sesion') {
            return encabezado('PLAN DE SESIÓN', r).concat([
                { t: 'p', x: 'Este documento se integra con el Plan de Seguimiento para el control de las sesiones posteriores.' },
                { t: 'campos', filas: ['Usuario', 'Sesión No.', 'Fecha', 'Hora de inicio', 'Hora de término'] },
                { t: 'tabla', cols: ['Signos vitales', 'Valor'], filas: [['Presión arterial', ''], ['Pulso', ''], ['Temperatura', ''], ['Oxigenación (SpO2)', ''], ['Frecuencia respiratoria', '']] },
                { t: 'h', x: 'Descripción de actividades / técnica aplicada' }, { t: 'lineas', n: 4 },
                { t: 'h', x: 'Notas de evolución y pronóstico' }, { t: 'lineas', n: 4 },
                { t: 'h', x: 'Recomendaciones / tareas para casa' }, { t: 'lineas', n: 3 },
                { t: 'firmas', items: ['Nombre y firma del usuario', prestador] },
                PIE
            ]);
        }
        if (id === 'plan-seguimiento') {
            var filas = [];
            for (var i = 1; i <= 6; i++) filas.push([String(i), '', '', '', '']);
            return encabezado('PLAN DE SEGUIMIENTO', r).concat([
                { t: 'campos', filas: ['Nombre del usuario', 'Fecha', 'Teléfono móvil', 'Teléfono fijo', 'Correo electrónico', 'Medio de contacto para seguimiento'] },
                { t: 'tabla', cols: ['Sesión No.', 'Fecha', 'Hora', 'Frecuencia', 'Duración'], filas: filas },
                { t: 'h', x: 'Nota de evolución' }, { t: 'lineas', n: 3 },
                { t: 'h', x: 'Pronóstico' }, { t: 'lineas', n: 2 },
                { t: 'h', x: 'Recomendaciones / ejercicios para casa' }, { t: 'lineas', n: 3 },
                { t: 'firmas', items: ['Nombre completo y firma del usuario', prestador] },
                PIE
            ]);
        }
        throw new Error('Formato desconocido: ' + id);
    }

    function sinAcentos(s) {
        return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
    }
    function nombreArchivo(id, r, ext) {
        var f = FORMATOS.filter(function (x) { return x.id === id; })[0];
        var partes = [f ? f.titulo : id];
        if (r && r.responsable) partes.push(r.responsable);
        return sinAcentos(partes.join(' ')).replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '') + '.' + ext;
    }

    /* ── PDF (jsPDF) ── */
    function pdf(id, r) {
        var jsPDF = root.jspdf.jsPDF;
        var doc = new jsPDF();
        var y = 18, X = 16, W = 178, ALTO = 282;
        function espacio(h) { if (y + h > ALTO) { doc.addPage(); y = 18; } }
        function parrafo(txt, size, estilo, sangria) {
            doc.setFontSize(size); doc.setFont('helvetica', estilo || 'normal');
            var lineas = doc.splitTextToSize(txt, W - (sangria || 0));
            var h = lineas.length * size * 0.42 + 1.5;
            espacio(h);
            doc.text(lineas, X + (sangria || 0), y + size * 0.35);
            y += h;
        }
        bloques(id, r).forEach(function (b) {
            if (b.t === 'titulo') { parrafo(b.x, 14, 'bold'); y += 1; }
            else if (b.t === 'sub') { doc.setTextColor(90); parrafo(b.x, 9); doc.setTextColor(0); y += 3; }
            else if (b.t === 'h') { y += 2; espacio(22); parrafo(b.x, 10.5, 'bold'); } /* un título nunca queda solo al pie */
            else if (b.t === 'p') { parrafo(b.x, 9); y += 1; }
            else if (b.t === 'li') { parrafo('• ' + b.x, 9, 'normal', 4); }
            else if (b.t === 'pie') {
                /* Una línea chica: cabe en el margen inferior en vez de abrir una hoja sola. */
                if (y + 7 > 291) { doc.addPage(); y = 18; }
                doc.setTextColor(120); doc.setFontSize(7.5); doc.setFont('helvetica', 'italic');
                doc.text(b.x, X, y + 6); doc.setTextColor(0); y += 8;
            }
            else if (b.t === 'campos') {
                doc.setFontSize(9.5);
                b.filas.forEach(function (et) {
                    espacio(8);
                    doc.setFont('helvetica', 'bold'); doc.text(et + ':', X, y + 4);
                    doc.setDrawColor(150); doc.line(X + 62, y + 5, X + W, y + 5);
                    y += 8;
                });
                y += 2;
            } else if (b.t === 'tabla') {
                var cw = W / b.cols.length, fila = 8;
                if (b.cols.length === 2) cw = null;
                var anchos = cw ? b.cols.map(function () { return cw; }) : [70, W - 70];
                espacio(fila * 2);
                function pintaFila(celdas, cabeza) {
                    espacio(fila);
                    var x = X;
                    celdas.forEach(function (c, k) {
                        if (cabeza) { doc.setFillColor(235, 241, 250); doc.rect(x, y, anchos[k], fila, 'FD'); }
                        else { doc.rect(x, y, anchos[k], fila); }
                        doc.setFontSize(8.5); doc.setFont('helvetica', cabeza ? 'bold' : 'normal');
                        if (c) doc.text(String(c), x + 2, y + 5.3);
                        x += anchos[k];
                    });
                    y += fila;
                }
                doc.setDrawColor(150);
                pintaFila(b.cols, true);
                b.filas.forEach(function (f) { pintaFila(f, false); });
                y += 4;
            } else if (b.t === 'lineas') {
                doc.setDrawColor(170);
                for (var i = 0; i < b.n; i++) { espacio(8); doc.line(X, y + 6, X + W, y + 6); y += 8; }
                y += 2;
            } else if (b.t === 'firmas') {
                espacio(28); y += 16;
                var ancho = (W - 10) / b.items.length;
                doc.setDrawColor(60); doc.setFontSize(8.5); doc.setFont('helvetica', 'normal');
                b.items.forEach(function (et, k) {
                    var x = X + k * (ancho + 10);
                    doc.line(x, y, x + ancho, y);
                    doc.text(doc.splitTextToSize(et, ancho), x, y + 4.5);
                });
                y += 12;
            }
        });
        return doc.output('blob');
    }

    /* ── Word (.docx, librería `docx` global) ── */
    function docx(id, r) {
        var D = root.docx;
        var hijos = [];
        /* Anchos fijos en DXA (twips): sin ellos Word los calcula solo, pero
           Pages, Google Docs y Quick Look colapsan las columnas a una letra. */
        var ANCHO = 9026; /* A4 con márgenes de 1 in, los que docx pone por default */
        function texto(txt, o) { return new D.TextRun(Object.assign({ text: txt, font: 'Arial', size: 20 }, o || {})); }
        function borde() { return { style: D.BorderStyle.SINGLE, size: 4, color: '999999' }; }
        var bordes = { top: borde(), bottom: borde(), left: borde(), right: borde() };
        function celda(ancho, borders, runs, fondo) {
            var o = { width: { size: Math.round(ancho), type: D.WidthType.DXA }, borders: borders,
                margins: { top: 60, bottom: 60, left: 100, right: 100 }, children: [new D.Paragraph({ children: runs })] };
            if (fondo) o.shading = { fill: fondo, type: D.ShadingType.CLEAR, color: 'auto' };
            return new D.TableCell(o);
        }
        function tabla(rows, anchos, sinBordes) {
            return new D.Table({ rows: rows, layout: D.TableLayoutType.FIXED, borders: sinBordes ? D.TableBorders.NONE : undefined,
                width: { size: Math.round(anchos.reduce(function (a, x) { return a + x; }, 0)), type: D.WidthType.DXA },
                columnWidths: anchos.map(Math.round) });
        }
        bloques(id, r).forEach(function (b) {
            if (b.t === 'titulo') hijos.push(new D.Paragraph({ children: [texto(b.x, { bold: true, size: 28 })], spacing: { after: 80 } }));
            else if (b.t === 'sub') hijos.push(new D.Paragraph({ children: [texto(b.x, { size: 18, color: '555555' })], spacing: { after: 200 } }));
            else if (b.t === 'h') hijos.push(new D.Paragraph({ children: [texto(b.x, { bold: true, size: 22 })], spacing: { before: 160, after: 60 } }));
            else if (b.t === 'p') hijos.push(new D.Paragraph({ children: [texto(b.x)], spacing: { after: 100 } }));
            else if (b.t === 'li') hijos.push(new D.Paragraph({ children: [texto(b.x)], bullet: { level: 0 } }));
            else if (b.t === 'pie') hijos.push(new D.Paragraph({ children: [texto(b.x, { italics: true, size: 16, color: '777777' })], spacing: { before: 240 } }));
            else if (b.t === 'campos') {
                b.filas.forEach(function (et) {
                    hijos.push(new D.Paragraph({ children: [texto(et + ': ', { bold: true }), texto('_______________________________________________')], spacing: { after: 120 } }));
                });
            } else if (b.t === 'tabla') {
                var anchos = b.cols.length === 2 ? [ANCHO * 0.4, ANCHO * 0.6] : b.cols.map(function () { return ANCHO / b.cols.length; });
                hijos.push(tabla([b.cols].concat(b.filas).map(function (f, k) {
                    return new D.TableRow({ height: { value: 400, rule: D.HeightRule.ATLEAST }, children: f.map(function (c, j) {
                        return celda(anchos[j], bordes, [texto(String(c), { bold: k === 0, size: 18 })], k === 0 ? 'EBF1FA' : null);
                    }) });
                }), anchos));
                hijos.push(new D.Paragraph({ children: [] }));
            } else if (b.t === 'lineas') {
                for (var i = 0; i < b.n; i++) hijos.push(new D.Paragraph({ children: [texto('____________________________________________________________________________')], spacing: { after: 120 } }));
            } else if (b.t === 'firmas') {
                /* Una celda por firma con solo el borde superior (la línea), separadas por una celda vacía. */
                var sinBorde = { style: D.BorderStyle.NONE, size: 0, color: 'FFFFFF' };
                var hueco = ANCHO * 0.06, ancho = (ANCHO - hueco * (b.items.length - 1)) / b.items.length, celdas = [], anchosF = [];
                b.items.forEach(function (et, k) {
                    if (k) { celdas.push(celda(hueco, { top: sinBorde, bottom: sinBorde, left: sinBorde, right: sinBorde }, [])); anchosF.push(hueco); }
                    celdas.push(celda(ancho, { top: borde(), bottom: sinBorde, left: sinBorde, right: sinBorde }, [texto(et, { size: 18 })]));
                    anchosF.push(ancho);
                });
                hijos.push(new D.Paragraph({ children: [], spacing: { before: 720 } }));
                hijos.push(tabla([new D.TableRow({ children: celdas })], anchosF, true));
            }
        });
        var documento = new D.Document({ sections: [{ properties: {}, children: hijos }] });
        return D.Packer.toBlob(documento);
    }

    var api = {
        FALTANTE: FALTANTE, FORMATOS: FORMATOS, avisoPrivacidadBloques: avisoPrivacidadBloques,
        bloques: bloques, nombreArchivo: nombreArchivo, pdf: pdf, docx: docx
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.FormatosConsultorio = api;
})(typeof window !== 'undefined' ? window : this);
