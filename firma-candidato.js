/* =========================================================
   firma-candidato.js — "Usar la misma firma de mi Autodiagnóstico".

   El candidato firma primero el Acuerdo de Confidencialidad y luego su
   Autodiagnóstico; este módulo le ofrece reutilizar esa firma en los demás
   documentos que firma ÉL: Plan de Evaluación, Encuesta de Satisfacción,
   Evidencias y el paso "Firma" del propio Autodiagnóstico.

   NUNCA se usa para firmas de otra persona: las de documentos-sesion.html
   son del usuario/paciente (la del candidato en esos PDFs ya se toma sola
   del Autodiagnóstico), y firmarlas con la del candidato sería falsificar
   un documento que va a la SEP.

   Es módulo compartido porque la regla de "qué firma cuenta y dónde vive"
   no debe copiarse en cada página. Helpers puros probados en
   tests/firma-candidato.test.js. Se carga después de auth.js y flow-status.js.
========================================================= */
(function (root) {
    'use strict';

    function esImagen(url) {
        return typeof url === 'string' && url.indexOf('data:image/') === 0;
    }

    function escaparHtml(s) {
        return String(s === null || s === undefined ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    /* Misma regla que ya usa cada página para marcar la firma "Completado". */
    function firmaValida(f) {
        if (!f) return false;
        if (f.mode === 'draw') return esImagen(f.dataUrl);
        if (f.mode === 'type') return !!(f.typedName && String(f.typedName).trim());
        return false;
    }

    /* De un objeto autodiagnosticoData: la firma principal o, si todavía no
       existe, la del Acuerdo de Confidencialidad, que se firma antes. */
    function firmaDeAutodiagnostico(auto) {
        if (!auto) return null;
        var principal = {
            mode: auto.signatureMode || 'draw', dataUrl: auto.signatureDataUrl || null,
            typedName: auto.signatureTypedName || '', origen: 'autodiagnostico'
        };
        if (firmaValida(principal)) return principal;
        var nda = {
            mode: auto.ndaSignatureMode || 'draw', dataUrl: auto.ndaSignatureDataUrl || null,
            typedName: auto.ndaSignatureTypedName || '', origen: 'confidencialidad'
        };
        return firmaValida(nda) ? nda : null;
    }

    function vistaPrevia(f) {
        if (!firmaValida(f)) return '';
        if (f.mode === 'draw') {
            return '<img src="' + f.dataUrl + '" alt="Tu firma" style="display:block;max-width:220px;max-height:64px;background:#fff;border-radius:6px;padding:2px;">';
        }
        return '<span style="font-family:Georgia,serif;font-style:italic;font-size:1.05rem;color:var(--text-bright);">' + escaparHtml(f.typedName) + '</span>';
    }

    /* La firma del candidato: primero lo guardado en este navegador; si este
       dispositivo nunca abrió el Autodiagnóstico, la fila en Supabase
       (FlowStatus.getRow también cubre la cuenta demo, que no sincroniza). */
    async function obtener() {
        try {
            var local = JSON.parse(localStorage.getItem('autodiagnosticoData') || 'null');
            var f = firmaDeAutodiagnostico(local);
            if (f) return f;
        } catch (e) { /* ignore */ }
        try {
            var row = (root.FlowStatus && root.FlowStatus.getRow) ? await root.FlowStatus.getRow()
                : (root.Auth && root.Auth.pullMyRow) ? await root.Auth.pullMyRow() : null;
            return firmaDeAutodiagnostico(row && row.autodiagnostico_data);
        } catch (e) { return null; }
    }

    /* Pinta la opción en `contenedor`, o nada si no hay firma que reutilizar.
       opts.fuente: firma a ofrecer (si no viene, se busca con obtener()).
       opts.onUsar(firma): la página copia la firma a su propio estado. */
    async function ofrecer(contenedor, opts) {
        if (!contenedor) return;
        opts = opts || {};
        var f = opts.fuente !== undefined ? opts.fuente : await obtener();
        if (!firmaValida(f) || !document.body.contains(contenedor)) { contenedor.innerHTML = ''; return; }
        var de = f.origen === 'confidencialidad' ? 'tu Acuerdo de Confidencialidad' : 'tu Autodiagnóstico';
        contenedor.innerHTML =
            '<div style="border:1px dashed var(--primary);border-radius:10px;padding:12px;margin-bottom:12px;">' +
                '<p style="font-size:0.85rem;color:var(--text-bright);font-weight:600;margin:0 0 8px;">¿Usar la misma firma de ' + de + '?</p>' +
                '<div style="display:flex;flex-wrap:wrap;align-items:center;gap:12px;">' +
                    vistaPrevia(f) +
                    '<button type="button" class="sig-tab-btn active" data-usar-firma style="flex:0 0 auto;">✍️ Usar esta firma</button>' +
                '</div>' +
                '<p style="font-size:0.75rem;color:var(--text);margin:8px 0 0;">Si prefieres firmar distinto, dibuja o escribe abajo.</p>' +
            '</div>';
        contenedor.querySelector('[data-usar-firma]').addEventListener('click', function () {
            if (typeof opts.onUsar === 'function') opts.onUsar({ mode: f.mode, dataUrl: f.dataUrl, typedName: f.typedName });
        });
    }

    var api = { firmaValida: firmaValida, firmaDeAutodiagnostico: firmaDeAutodiagnostico, vistaPrevia: vistaPrevia, obtener: obtener, ofrecer: ofrecer };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.FirmaCandidato = api;
})(typeof window !== 'undefined' ? window : this);
