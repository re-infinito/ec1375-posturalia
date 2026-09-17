/* visor-diapositivas.js — piezas compartidas de los visores de diapositivas
   (biblioteca.html y ruta-alineacion.html) + el mapa tema→criterio que usa
   examen-conocimientos.html. 16 sep 2026.

   Dos mitades:
   - Lógica pura (sin DOM, probada en Node: tests/visor-diapositivas.test.js):
     catálogo combinado de la Biblioteca, recomendados, filtros, cortes del HTML.
   - Utilidades de DOM: videos, quizzes, presentación y botón de tema — antes
     vivían copiadas dentro de ruta-alineacion.html.

   No tiene efectos al cargarse: nada corre hasta que una página lo llama.
   ruta-estudio.html (motor completo generado por el pipeline) NO lo usa. */
(function (root) {
    'use strict';

    /* Nombres de los módulos (los mismos números en ruta-estudio y
       ruta-alineacion). Solo se usan si los datos no traen el nombre. */
    var MODULOS = ['Introducción', 'Preparar el espacio', 'Preparar al usuario', 'Introducir al usuario',
        'Dar seguimiento', 'Conoce tus equipos', 'Listo para evaluarte', 'Tu video práctico'];

    /* tema del Examen de Conocimientos (examen:reactivos[].tema) → criterio del
       motor (ruta-estudio:data.criterios). Verificado contra los 34 criterios
       reales: cada uno devuelve pantallas en la Biblioteca. Biomecánica,
       Movimientos y Cuadrantes caen en E2·C3 porque ahí vive ese contenido. */
    var TEMA_A_CRITERIO = {
        'Técnicas de Atención Tradicional y Complementaria': 'E1·C1',
        'Desinfección y Sanitización': 'E1·C2',
        'Manejo de Residuos Peligrosos (NOM-087-ECOL-SSA1-2002)': 'E1·C3',
        'Signos Vitales': 'E2·C1',
        'Goniometría': 'E2·C2',
        'Biomecánica': 'E2·C3',
        'Movimientos del Cuerpo': 'E2·C3',
        'Cuadrantes Abdominales': 'E2·C3',
        'Higiene de Columna': 'E2·C4',
        'Pruebas Funcionales de Daniels': 'E2·C5'
    };

    function urlBiblioteca(tema) {
        var crit = TEMA_A_CRITERIO[tema];
        return crit ? 'biblioteca.html?crit=' + encodeURIComponent(crit) : 'biblioteca.html';
    }

    function esc(s) {
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    /* Minúsculas y sin acentos, para buscar "higiene" y encontrar "Higiene". */
    function normaliza(s) {
        return String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
    }

    /* Corta el HTML publicado (<section class="slide" data-sid="…">…</section>
       seguidas) en {sid: htmlDeLaSección}. Las secciones no se anidan. */
    function seccionesPorSid(html) {
        var out = {};
        var re = /<section\b[^>]*\bdata-sid="([^"]+)"[^>]*>[\s\S]*?<\/section>/g, m;
        while ((m = re.exec(String(html || '')))) out[m[1]] = m[0];
        return out;
    }

    function entrada(s, fuente, nombres) {
        return {
            sid: s.sid, mod: +s.mod || 0,
            modulo: s.modulo || nombres[+s.mod || 0] || MODULOS[+s.mod || 0] || ('Módulo ' + s.mod),
            titulo: s.titulo || '', crit: (s.crit || []).slice(), rx: (s.rx || []).slice(),
            route: s.route || '', risk: s.risk || '', fuente: fuente
        };
    }

    /* Catálogo de la Biblioteca: las pantallas de ruta-estudio (en su orden)
       más las que SOLO existen en ruta-alineacion (introducción SEP/CONOCER y
       Módulo 7). Cada pantalla exclusiva se inserta después de la pantalla que
       la precede en Alineación si es del mismo módulo; si no, al final de su
       módulo (el Módulo 7 no existe en ruta-estudio: queda al final). */
    function catalogo(estudio, alineacion) {
        var nombres = {};
        ((alineacion && alineacion.slides) || []).forEach(function (s) { if (s.modulo) nombres[+s.mod] = s.modulo; });
        var lista = ((estudio && estudio.slides) || []).map(function (s) { return entrada(s, 'estudio', nombres); });
        var hay = {};
        lista.forEach(function (e) { hay[e.sid] = true; });
        var previo = null;
        ((alineacion && alineacion.slides) || []).forEach(function (s) {
            if (hay[s.sid]) { previo = s.sid; return; }
            var e = entrada(s, 'alineacion', nombres), at = -1, i;
            if (previo) {
                for (i = 0; i < lista.length; i++) if (lista[i].sid === previo) break;
                if (i < lista.length && lista[i].mod === e.mod) at = i + 1;
            }
            if (at < 0) {
                at = lista.length;
                for (i = lista.length - 1; i >= 0; i--) { if (lista[i].mod <= e.mod) { at = i + 1; break; } if (i === 0) at = 0; }
            }
            lista.splice(at, 0, e);
            hay[e.sid] = true; previo = e.sid;
        });
        lista.forEach(function (e, k) { e.pos = k; });
        return lista;
    }

    /* Números de reactivo (1..142, el mismo n de ruta-estudio:data.rx) que el
       candidato marcó NO. keys = Auth.REACTIVO_KEYS (orden oficial). */
    function reactivosNo(answers, keys) {
        var out = [];
        (keys || []).forEach(function (k, idx) { if (answers && answers[k] === 'NO') out.push(idx + 1); });
        return out;
    }

    /* Criterios de los temas que el candidato falló al primer intento en el
       Examen de Conocimientos (estado de examen-conocimientos.html). */
    function criteriosFallados(examen, reactivos) {
        var vistos = {}, out = [];
        var fac = (examen && examen.firstAttemptCorrect) || {};
        Object.keys(fac).forEach(function (q) {
            if (fac[q] !== false) return;
            var r = reactivos && reactivos[+q], c = r && TEMA_A_CRITERIO[r.tema];
            if (c && !vistos[c]) { vistos[c] = true; out.push(c); }
        });
        return out;
    }

    /* {sid: [motivos]} de las pantallas recomendadas: tocan un reactivo en NO
       del Autodiagnóstico o un criterio fallado en el examen. */
    function recomendados(cat, no, crits) {
        var setNo = {}, setC = {}, out = {};
        (no || []).forEach(function (n) { setNo[+n] = true; });
        (crits || []).forEach(function (c) { setC[c] = true; });
        (cat || []).forEach(function (e) {
            var mot = [];
            if (e.rx.some(function (n) { return setNo[+n]; })) mot.push('autodiagnostico');
            if (e.crit.some(function (c) { return setC[c]; })) mot.push('examen');
            if (mot.length) out[e.sid] = mot;
        });
        return out;
    }

    /* Pantallas de un criterio: primero las de repaso (route remedial/both,
       la misma regla que EC1375.routes.criterion); si no hay, cualquiera que
       lo toque. */
    function porCriterio(cat, cid) {
        var toca = (cat || []).filter(function (e) { return e.crit.indexOf(cid) >= 0; });
        var repaso = toca.filter(function (e) { return e.route === 'remedial' || e.route === 'both'; });
        return repaso.length ? repaso : toca;
    }

    /* f = {q, mod, soloRecomendados, recomendados, crit}; criterios = mapa de
       títulos (ruta-estudio:data.criterios) para buscar por nombre de tema. */
    function filtrar(cat, f, criterios) {
        f = f || {};
        var lista = f.crit ? porCriterio(cat, f.crit) : (cat || []).slice();
        if (f.mod !== undefined && f.mod !== null && f.mod !== '') lista = lista.filter(function (e) { return e.mod === +f.mod; });
        if (f.soloRecomendados) lista = lista.filter(function (e) { return f.recomendados && f.recomendados[e.sid]; });
        var q = normaliza(f.q);
        if (q) {
            lista = lista.filter(function (e) {
                var txt = [e.titulo, e.modulo, e.sid].concat(e.crit).concat(e.crit.map(function (c) {
                    return criterios && criterios[c] ? criterios[c].titulo : '';
                })).concat(e.rx.map(function (n) { return '#' + n; })).join(' ');
                return q.split(/\s+/).every(function (w) { return normaliza(txt).indexOf(w) >= 0; });
            });
        }
        return lista;
    }

    /* ───────────── DOM ───────────── */

    /* Videos: tarjeta "toca para reproducir" → iframe youtube-nocookie. Varios
       ids en un mismo .mediawrap muestran selector. media = {id: {title,
       youtubeId, type, url, role, optional}}. */
    function montarMedios(sec, media, onPlay) {
        if (!sec) return;
        [].forEach.call(sec.querySelectorAll('.mediawrap'), function (wrap) {
            if (wrap.getAttribute('data-listo')) return;
            var ids = (wrap.getAttribute('data-media-id') || '').split(',').filter(function (i) { return media && media[i]; });
            if (!ids.length) return;
            wrap.setAttribute('data-listo', '1');
            pintaMedio(wrap, ids, 0, media, onPlay);
        });
    }
    function pintaMedio(wrap, ids, k, media, onPlay) {
        var v = media[ids[k]];
        var sel = ids.length > 1 ? '<div class="mediasel">' + ids.map(function (id, j) {
            return '<button data-k="' + j + '" aria-current="' + (j === k) + '">' + esc(media[id].title) +
                (media[id].optional ? ' <span class="opt-tag">· complementario</span>' : '') + '</button>';
        }).join('') + '</div>' : '';
        wrap.innerHTML = '<div class="media" data-slot="1"><div class="ph"><div class="ic">▶</div><div class="nm">' +
            esc(v.title) + '</div><div class="ins">' + (v.role === 'instructional'
                ? 'Procedimiento que el evaluador observará' : 'Toca para reproducir') + '</div></div></div>' + sel;
        var slot = wrap.querySelector('[data-slot]');
        slot.onclick = function () {
            if (v.type === 'mp4' && v.url) {
                slot.innerHTML = '<video controls autoplay playsinline src="' + esc(v.url) + '"></video>';
            } else if (v.youtubeId) {
                slot.innerHTML = '<iframe src="https://www.youtube-nocookie.com/embed/' + esc(v.youtubeId) +
                    '?rel=0&modestbranding=1&playsinline=1&autoplay=1" title="' + esc(v.title) + '" ' +
                    'allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; ' +
                    'picture-in-picture; web-share" allowfullscreen loading="lazy"></iframe>';
            } else if (v.url) {
                window.open(v.url, '_blank', 'noopener');
            }
            if (onPlay) onPlay(v);
        };
        [].forEach.call(wrap.querySelectorAll('.mediasel button'), function (b) {
            b.onclick = function () { pintaMedio(wrap, ids, +b.getAttribute('data-k'), media, onPlay); };
        });
    }
    /* Al cambiar de pantalla: detiene cualquier video regresando su tarjeta. */
    function pausarMedios(rootEl, media, onPlay) {
        [].forEach.call((rootEl || document).querySelectorAll('.mediawrap[data-listo]'), function (wrap) {
            if (!wrap.querySelector('iframe, video')) return;
            wrap.removeAttribute('data-listo');
            montarMedios(wrap.parentNode, media, onPlay);
        });
    }

    /* Quizzes de las diapositivas (.quiz > .qopt[data-ok="1"] + .qwhy). */
    function activarQuizzes(rootEl) {
        (rootEl || document).addEventListener('click', function (e) {
            var op = e.target.closest && e.target.closest('.qopt');
            if (!op) return;
            var bx = op.closest('.quiz'); if (!bx) return;
            [].forEach.call(bx.querySelectorAll('.qopt'), function (x) {
                x.classList.add('done');
                if (x.getAttribute('data-ok') === '1') x.classList.add('right');
            });
            if (op.getAttribute('data-ok') !== '1') op.classList.add('wrong');
            var why = bx.parentNode && bx.parentNode.querySelector('.qwhy');
            if (why) why.classList.add('show');
        });
    }

    function presentacion(on) {
        document.body.classList.toggle('pres', on);
        if (on && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(function () {});
        else if (!on && document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(function () {});
    }

    /* Tema: misma llave 'paideia-theme' que crm-shell.js. Sin data-theme la
       página sigue al sistema operativo; localStorage solo se escribe cuando
       el candidato elige de verdad. */
    function temaClaroActual() {
        var t = document.documentElement.getAttribute('data-theme');
        if (t === 'light') return true;
        if (t === 'dark') return false;
        return !(window.matchMedia && window.matchMedia('(prefers-color-scheme:dark)').matches);
    }
    function enlazarBotonTema(btn, lbl) {
        function sync() {
            var claro = temaClaroActual();
            if (lbl) lbl.textContent = claro ? 'Modo oscuro' : 'Modo claro';
            if (btn) btn.title = claro ? 'Cambiar a modo oscuro' : 'Cambiar a modo claro';
        }
        if (btn) btn.onclick = function () {
            var claro = !temaClaroActual();
            document.documentElement.setAttribute('data-theme', claro ? 'light' : 'dark');
            try { localStorage.setItem('paideia-theme', claro ? 'light' : 'dark'); } catch (e) { /* sin storage */ }
            sync();
        };
        sync();
    }

    var api = {
        MODULOS: MODULOS, TEMA_A_CRITERIO: TEMA_A_CRITERIO, urlBiblioteca: urlBiblioteca,
        esc: esc, normaliza: normaliza, seccionesPorSid: seccionesPorSid, catalogo: catalogo,
        reactivosNo: reactivosNo, criteriosFallados: criteriosFallados, recomendados: recomendados,
        porCriterio: porCriterio, filtrar: filtrar,
        montarMedios: montarMedios, pausarMedios: pausarMedios, activarQuizzes: activarQuizzes,
        presentacion: presentacion, temaClaroActual: temaClaroActual, enlazarBotonTema: enlazarBotonTema
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.VisorDiap = api;
})(typeof window !== 'undefined' ? window : this);
