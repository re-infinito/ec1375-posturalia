/* estudio-logica.js — lógica pura del visor de estudio unificado (estudio.html).
   17 sep 2026. Sin DOM; probada en Node (tests/estudio-logica.test.js).

   Porta 1:1 del motor V4.4 de ruta-estudio.html (vacio/normaliza/recalcula,
   brechas, compuertas, rutas, práctica) para que el objeto que se guarda en
   candidatos_ec1375.ruta_estudio_data siga siendo EXACTAMENTE el mismo: flow-status.js
   lee diagnostic.approved (Reforzamiento) y practice.completed (Práctica).
   También trae la lógica del Examen de Conocimientos (antes dentro de
   examen-conocimientos.html) con su mismo estado examenConocimientosData.

   Uso: var L = EstudioLogica.crear(D, MEDIA)  — D = ruta-estudio:data,
   MEDIA = ruta-estudio:media. Las funciones que cambian estado mutan `s` y lo
   devuelven recalculado; quien llama se encarga de guardarlo. */
(function (root) {
    'use strict';

    var UMBRAL_DIAGNOSTICO = 97.64;
    var AVANCE = { remediation: .25, alignment: .35, practice: .25, final: .15 };

    function r2(x) { return Math.round(x * 100) / 100; }
    function uniq(v, i, a) { return a.indexOf(v) === i; }
    function copia(x) { return JSON.parse(JSON.stringify(x)); }
    function barajar(a, rng) {
        var r = a.slice(), i, j, t; rng = rng || Math.random;
        for (i = r.length - 1; i > 0; i--) { j = Math.floor(rng() * (i + 1)); t = r[i]; r[i] = r[j]; r[j] = t; }
        return r;
    }

    var MOTIVO = {
        diagnostic_incomplete: 'Faltan reactivos por contestar en tu autodiagnóstico.',
        remediation_required: 'Todavía tienes temas obligatorios por reforzar.',
        vobo_required: 'Primero da el visto bueno a tu autodiagnóstico en Reforzamiento.'
    };

    function crear(D, MEDIA) {
        D = D || {}; MEDIA = MEDIA || {};
        var META = D.slides || [], IDX = {};
        META.forEach(function (m, i) { IDX[m.sid] = i; });
        var OBJS = Object.keys(D.objetivos || {});

        function vacio() {
            return {
                diagnosticOriginal: { answers: {}, score: 0, si: 0, no: 0, completed: false, completedAt: null, locked: false },
                diagnostic: { answers: {}, completed: false, thresholdMet: false, approved: false, score: 0, approvedAt: null, source: 'original' },
                remediation: { requiredCriteria: [], completedCriteria: [], objectives: {} },
                alignment: { started: false, completedSlides: [], requiredSlides: [], completed: false },
                media: { completed: [], progress: {} },
                practice: { objectives: {}, requiredObjectives: 0, completedObjectives: 0, completed: false },
                finalEvaluation: { unlocked: false, attempts: [], passed: false, bestScore: null, current: null,
                    assisted: { attempts: [], passed: false, bestScore: null, current: null } },
                preparationProgress: 0
            };
        }

        function normaliza(raw) {
            var s = vacio(); if (!raw || typeof raw !== 'object') return recalcula(s);
            var k;
            (raw.answeredYes || []).forEach(function (n) { s.diagnosticOriginal.answers[n] = 'si'; });
            (raw.answeredNo || []).forEach(function (n) { s.diagnosticOriginal.answers[n] = 'no'; });
            if (raw.diagnostic && raw.diagnostic.answers) for (k in raw.diagnostic.answers) s.diagnosticOriginal.answers[k] = raw.diagnostic.answers[k];
            if (raw.diagnostic && raw.diagnostic.originalAnswers) for (k in raw.diagnostic.originalAnswers) s.diagnosticOriginal.answers[k] = raw.diagnostic.originalAnswers[k];
            if (raw.diagnostic) { s.diagnostic.approved = !!raw.diagnostic.approved; s.diagnostic.approvedAt = raw.diagnostic.approvedAt || null; }
            if (raw.diagnosticOriginal) {
                var o = raw.diagnosticOriginal;
                if (o.answers) s.diagnosticOriginal.answers = copia(o.answers);
                s.diagnosticOriginal.completedAt = o.completedAt || null;
                s.diagnosticOriginal.locked = !!o.locked;
            }
            ['remediation', 'alignment', 'media', 'practice'].forEach(function (b) {
                if (raw[b]) for (var kk in s[b]) if (raw[b][kk] !== undefined) s[b][kk] = copia(raw[b][kk]);
            });
            if (raw.finalEvaluation) {
                var fe = raw.finalEvaluation;
                ['attempts', 'passed', 'bestScore', 'current'].forEach(function (kk) { if (fe[kk] !== undefined) s.finalEvaluation[kk] = copia(fe[kk]); });
                if (fe.assisted) ['attempts', 'passed', 'bestScore', 'current'].forEach(function (kk) {
                    if (fe.assisted[kk] !== undefined) s.finalEvaluation.assisted[kk] = copia(fe.assisted[kk]);
                });
            }
            if (raw.knowledgePractice) raw.knowledgePractice.forEach(function (x) { if (x.objectiveId) s.practice.objectives[x.objectiveId] = x; });
            return recalcula(s);
        }

        function cuenta(reg, v) { var o = []; for (var k in reg.answers) if (reg.answers[k] === v) o.push(+k); return o; }
        function puntaje(si, no) {
            var p = 0;
            si.forEach(function (n) { var w = ((D.rx || {})[n] || {}).peso || 0; if (w > 0) p += w; });
            no.forEach(function (n) { var w = ((D.rx || {})[n] || {}).peso || 0; if (w < 0) p += w; });
            return r2(p);
        }
        function respuestas(s, v) { var o = []; for (var k in s.diagnostic.answers) if (s.diagnostic.answers[k] === v) o.push(+k); return o; }

        function criteriosObligatorios(no) {
            var c = {};
            no.forEach(function (n) { var r = (D.rx || {})[n]; if (r && r.critico) c[r.criterio] = 1; });
            return Object.keys(c);
        }
        function mediosDe(sid) { return (D.mediaBySid || {})[sid] || []; }
        function mediosObligatorios() {
            var out = [];
            META.forEach(function (m) {
                if (!m.core) return;
                mediosDe(m.sid).forEach(function (id) { var v = MEDIA[id]; if (v && v.required) out.push(id); });
            });
            return out.filter(uniq);
        }
        function alineacionCompleta(s) {
            var req = META.filter(function (m) { return m.core; }).map(function (m) { return m.sid; });
            var hechas = req.filter(function (sid) { return s.alignment.completedSlides.indexOf(sid) >= 0; });
            if (hechas.length < req.length) return false;
            return mediosObligatorios().every(function (id) { return s.media.completed.indexOf(id) >= 0; });
        }

        function recalcula(s) {
            var reg = s.diagnosticOriginal;
            var siO = cuenta(reg, 'si'), noO = cuenta(reg, 'no');
            reg.si = siO.length; reg.no = noO.length; reg.score = puntaje(siO, noO);
            var completoO = (siO.length + noO.length) === 142;
            if (completoO && !reg.locked) {
                reg.completed = true; reg.locked = true;
                reg.completedAt = reg.completedAt || new Date().toISOString();
            } else if (completoO) { reg.completed = true; }
            s.diagnostic.answers = reg.answers;
            s.diagnostic.source = 'original';
            var si = respuestas(s, 'si'), no = respuestas(s, 'no');
            s.diagnostic.completed = (si.length + no.length) === 142;
            s.diagnostic.score = reg.score;
            s.diagnostic.thresholdMet = reg.score >= UMBRAL_DIAGNOSTICO;
            s.remediation.requiredCriteria = criteriosObligatorios(no);
            s.alignment.requiredSlides = META.filter(function (m) { return m.core; }).map(function (m) { return m.sid; });
            s.alignment.completed = alineacionCompleta(s);
            s.practice.requiredObjectives = OBJS.length;
            s.practice.completedObjectives = OBJS.filter(function (o) {
                var st = s.practice.objectives[o]; return st && st.masteryState === 'mastered_in_practice';
            }).length;
            s.practice.completed = OBJS.length > 0 && s.practice.completedObjectives === OBJS.length;
            s.finalEvaluation.unlocked = s.diagnostic.approved && s.alignment.completed && s.practice.completed;
            s.finalEvaluation.passed = s.finalEvaluation.attempts.some(function (a) { return a.passed; });
            s.finalEvaluation.bestScore = s.finalEvaluation.attempts.reduce(function (m, a) { return (m === null || a.score > m) ? a.score : m; }, null);
            s.finalEvaluation.assisted.passed = s.finalEvaluation.assisted.attempts.some(function (a) { return a.passed; });
            s.finalEvaluation.assisted.bestScore = s.finalEvaluation.assisted.attempts.reduce(function (m, a) { return (m === null || a.score > m) ? a.score : m; }, null);
            s.preparationProgress = avance(s).total;
            return s;
        }

        function avance(s) {
            var no = respuestas(s, 'no'), crit = {};
            no.forEach(function (n) { var r = (D.rx || {})[n]; if (r) crit[r.criterio] = 1; });
            var g = Object.keys(crit);
            var comp = g.filter(function (c) { return s.remediation.completedCriteria.indexOf(c) >= 0; });
            var rem = g.length ? comp.length / g.length : (no.length ? 0 : 1);
            var req = META.filter(function (m) { return m.core; }).length;
            var hechas = s.alignment.completedSlides.filter(function (sid) { var i = IDX.hasOwnProperty(sid) ? IDX[sid] : -1; return i >= 0 && META[i].core; }).length;
            var vids = mediosObligatorios(), vh = vids.filter(function (id) { return s.media.completed.indexOf(id) >= 0; }).length;
            var ali = (req + vids.length) ? (hechas + vh) / (req + vids.length) : 0;
            var dom = OBJS.filter(function (o) { var st = s.practice.objectives[o]; return st && st.masteryState === 'mastered_in_practice'; }).length;
            var pra = OBJS.length ? dom / OBJS.length : 0;
            var fin = s.finalEvaluation.passed ? 1 : (s.finalEvaluation.attempts.length ? (s.finalEvaluation.bestScore || 0) : 0);
            return { remediation: rem, alignment: ali, practice: pra, final: fin, gaps: g.length, gapsDone: comp.length,
                total: rem * AVANCE.remediation + ali * AVANCE.alignment + pra * AVANCE.practice + fin * AVANCE.final };
        }

        /* ── Reforzamiento ── */
        var ORDEN = { critico: 0, medio: 1, menor: 2, actitud: 3, 'n/a': 4 };
        function brechas(s) {
            var g = {};
            respuestas(s, 'no').forEach(function (n) {
                var r = (D.rx || {})[n]; if (!r) return;
                g[r.criterio] = g[r.criterio] || { criterio: r.criterio, rx: [], origen: 'declared_gap' };
                g[r.criterio].rx.push(n);
            });
            Object.keys(s.practice.objectives).forEach(function (oid) {
                var st = s.practice.objectives[oid];
                if (st.masteryState === 'needs_support') {
                    var o = (D.objetivos || {})[oid]; if (!o) return;
                    var c = g[o.criterionId];
                    if (!c) g[o.criterionId] = { criterio: o.criterionId, rx: [o.rxAutodiagnostico], origen: 'demonstrated_gap', objetivos: [oid] };
                    else { if (c.origen === 'declared_gap') c.origen = 'both_gaps'; c.objetivos = (c.objetivos || []).concat([oid]); }
                }
            });
            return Object.keys(g).map(function (k) {
                var c = g[k], info = (D.criterios || {})[k] || {};
                var pesos = c.rx.map(function (n) { return ((D.rx || {})[n] || {}).peso || 0; });
                c.peso = Math.max.apply(null, pesos.concat([0]));
                c.critico = c.rx.some(function (n) { return ((D.rx || {})[n] || {}).critico; });
                c.riesgo = c.critico ? 'critico' : (c.peso >= .5 ? 'medio' : (c.peso > 0 ? 'menor' : 'n/a'));
                c.titulo = info.titulo || k; c.elem = info.elem || 0;
                c.obligatorio = s.remediation.requiredCriteria.indexOf(k) >= 0;
                c.hecho = s.remediation.completedCriteria.indexOf(k) >= 0;
                c.pantallas = rutaCriterio(k);
                return c;
            }).sort(function (a, b) {
                var d = ORDEN[a.riesgo] - ORDEN[b.riesgo]; if (d) return d;
                d = b.peso - a.peso; if (d) return d;
                return a.elem - b.elem;
            });
        }
        function pendientesObligatorios(s) {
            return s.remediation.requiredCriteria.filter(function (c) { return s.remediation.completedCriteria.indexOf(c) < 0; });
        }
        function gateVobo(s) {
            if (!s.diagnostic.completed) return { ok: false, reason: 'diagnostic_incomplete' };
            if (pendientesObligatorios(s).length) return { ok: false, reason: 'remediation_required' };
            return { ok: true };
        }
        function darVoBo(s, fecha) {
            if (!gateVobo(s).ok) return false;
            s.diagnostic.approved = true;
            s.diagnostic.approvedAt = fecha || new Date().toISOString();
            recalcula(s); return true;
        }
        /* Igual que rutaCriterio() del motor: pantallas del criterio con
           route remedial/both, en el orden de ruta-estudio. */
        function rutaCriterio(cid) {
            return META.filter(function (m) { return m.crit.indexOf(cid) >= 0 && (m.route === 'remedial' || m.route === 'both'); })
                .map(function (m) { return m.sid; });
        }
        /* termina() del motor: solo al TERMINAR las pantallas se marca. */
        function marcarReforzado(s, cids) {
            (cids || []).forEach(function (c) { if (s.remediation.completedCriteria.indexOf(c) < 0) s.remediation.completedCriteria.push(c); });
            return recalcula(s);
        }

        /* ── Práctica ── */
        function gatePractica(s) { return s.diagnostic.approved ? { ok: true } : { ok: false, reason: 'vobo_required' }; }
        /* La Alineación real ya se hizo en su propio recorrido: se dan por
           vistas las diapositivas core y sus videos obligatorios, que es lo
           que alignment.completed exige (misma precarga que hacía la envoltura). */
        function precargarAlineacion(s) {
            var core = META.filter(function (m) { return m.core; }).map(function (m) { return m.sid; });
            s.alignment.started = true;
            s.alignment.completedSlides = core.slice();
            s.alignment.requiredSlides = core.slice();
            mediosObligatorios().forEach(function (id) { if (s.media.completed.indexOf(id) < 0) s.media.completed.push(id); });
            return recalcula(s);
        }
        function estadoObj(s, oid) {
            var st = s.practice.objectives[oid];
            if (!st) {
                st = { objectiveId: oid, criterionId: D.objetivos[oid].criterionId, attempts: 0, correct: 0, incorrect: 0, seenVariantIds: [],
                    masteryState: 'not_started', remediationTriggered: false, remediationCompleted: false, remediationCycles: 0, selfReportConflict: false };
                s.practice.objectives[oid] = st;
            }
            if (!st.seenVariantIds) st.seenVariantIds = [];
            return st;
        }
        function objetivosPendientes(s) {
            return OBJS.filter(function (o) { var st = s.practice.objectives[o]; return !st || st.masteryState !== 'mastered_in_practice'; })
                .sort(function (a, b) {
                    var A = D.objetivos[a], B = D.objetivos[b];
                    var ga = s.diagnostic.answers[A.rxAutodiagnostico] === 'no' ? 0 : 1;
                    var gb = s.diagnostic.answers[B.rxAutodiagnostico] === 'no' ? 0 : 1;
                    if (ga !== gb) return ga - gb;
                    return B.weight - A.weight;
                });
        }
        function variante(s, oid, excluir, rng) {
            var st = estadoObj(s, oid);
            var qs = (D.banco || []).filter(function (q) { return q.objectiveId === oid; });
            var frescas = qs.filter(function (q) { return st.seenVariantIds.indexOf(q.questionId) < 0 && q.questionId !== excluir; });
            if (!frescas.length) frescas = qs.filter(function (q) { return q.questionId !== excluir; });
            if (!frescas.length) frescas = qs;
            return frescas[Math.floor((rng || Math.random)() * frescas.length)];
        }
        function fasePara(s, oid) { return estadoObj(s, oid).masteryState === 'awaiting_verification' ? 'verificacion' : 'inicial'; }
        /* responde() del motor. fase: 'inicial' | 'verificacion' | 'voluntaria'. */
        function responderPractica(s, q, ok, fase, fecha) {
            if (fase === 'voluntaria') return { cambio: null, masteryState: null };
            var o = D.objetivos[q.objectiveId], st = estadoObj(s, q.objectiveId), cambio = null;
            st.attempts++; st.seenVariantIds.push(q.questionId);
            st.lastActivityAt = fecha || new Date().toISOString();
            if (ok) {
                st.correct++;
                if (st.masteryState !== 'mastered_in_practice') { st.masteryState = 'mastered_in_practice'; cambio = 'mastered_in_practice'; }
            } else {
                st.incorrect++;
                if (fase === 'verificacion') {
                    if (st.masteryState !== 'needs_support') { st.masteryState = 'needs_support'; cambio = 'needs_support'; }
                } else if (st.masteryState !== 'awaiting_verification') { st.masteryState = 'awaiting_verification'; cambio = 'awaiting_verification'; }
                if (s.diagnostic.answers[o.rxAutodiagnostico] === 'si') st.selfReportConflict = true;
            }
            recalcula(s);
            return { cambio: cambio, masteryState: st.masteryState };
        }
        function rutaObjetivo(oid) {
            var o = (D.objetivos || {})[oid]; if (!o) return [];
            return o.relatedSlides.filter(function (sid) { return IDX.hasOwnProperty(sid); });
        }
        function iniciarRefuerzo(s, oid) { var st = estadoObj(s, oid); st.remediationTriggered = true; st.remediationCycles = (st.remediationCycles || 0) + 1; return s; }
        function terminarRefuerzo(s, oid) { estadoObj(s, oid).remediationCompleted = true; return s; }
        /* Verificación después de un repaso: siempre fase 'verificacion' con
           una variante distinta de la fallada (refuerzo() del motor). */
        function preguntaVerificacion(s, oid, falladaId, rng) { return variante(s, oid, falladaId, rng); }

        return {
            D: D, META: META, vacio: vacio, normaliza: normaliza, recalcula: recalcula, avance: avance, respuestas: respuestas,
            brechas: brechas, pendientesObligatorios: pendientesObligatorios, gateVobo: gateVobo, darVoBo: darVoBo,
            rutaCriterio: rutaCriterio, marcarReforzado: marcarReforzado,
            gatePractica: gatePractica, precargarAlineacion: precargarAlineacion, estadoObj: estadoObj,
            objetivosPendientes: objetivosPendientes, variante: variante, fasePara: fasePara, responderPractica: responderPractica,
            rutaObjetivo: rutaObjetivo, iniciarRefuerzo: iniciarRefuerzo, terminarRefuerzo: terminarRefuerzo,
            preguntaVerificacion: preguntaVerificacion, mediosObligatorios: mediosObligatorios
        };
    }

    /* Traduce autodiagnosticoData.answers ({clave: 'SI'|'NO'}) al contrato
       answeredYes/answeredNo que normaliza() entiende (n = índice + 1). */
    function semillaDesdeAutodiagnostico(answers, keys) {
        var si = [], no = [];
        (keys || []).forEach(function (k, i) { if (answers && answers[k] === 'SI') si.push(i + 1); else if (answers && answers[k] === 'NO') no.push(i + 1); });
        return { answeredYes: si, answeredNo: no };
    }

    /* Una pregunta de práctica lista para pintar: opciones barajadas con la
       posición de la correcta, o pares barajados para formato 'col'. */
    function prepararPregunta(q, rng) {
        if (q.format === 'col') {
            return { tipo: 'col', pares: barajar(q.pairs, rng), derecha: barajar(q.pairs.map(function (p) { return p[1]; }), rng) };
        }
        var orden = barajar(q.options.map(function (t, i) { return { t: t, ok: i === q.answer }; }), rng);
        return { tipo: 'mc', orden: orden, correcta: orden.map(function (x) { return x.ok; }).indexOf(true) };
    }
    function revisarPares(pares, elegidas) {
        return pares.every(function (p, j) { return elegidas[j] === p[1]; });
    }

    /* ── Examen de Conocimientos (antes examen-conocimientos.html) ── */
    /* 17 sep: además de opción múltiple (`correcta`: índice), el banco admite
       preguntas de relacionar tal cual vienen en el documento de reactivos
       (`tipo: 'relacionar'`, `items`, `opciones`, `correctas`: índice de la
       opción que va en cada item; `imagen` opcional). Su respuesta se guarda
       como arreglo (uno por item).
       BANCO_EXAMEN sube cuando cambia el orden del banco. Cada reactivo del
       banco nuevo trae `v1`: los índices que ocupaba en el banco anterior de
       39 (vacío si es nuevo; varios si se juntaron), y migrar() traduce con eso
       los exámenes guardados, sin índices fijos en el código. */
    var BANCO_EXAMEN = 2;
    function esCorrecta(r, resp) {
        if (!r) return false;
        if (r.tipo === 'relacionar') {
            return Array.isArray(resp) && resp.length === r.correctas.length &&
                r.correctas.every(function (c, i) { return resp[i] === c; });
        }
        return resp === r.correcta;
    }
    var examen = {
        BANCO: BANCO_EXAMEN,
        esCorrecta: esCorrecta,
        nuevo: function (reactivos, rng) {
            return { order: reactivos.map(function (r, qIndex) {
                    var ids = r.opciones.map(function (_, i) { return i; });
                    /* relacionar: las opciones van en el orden del documento (a, b, c…) */
                    return { qIndex: qIndex, optionOrder: r.tipo === 'relacionar' ? ids : barajar(ids, rng) };
                }),
                currentIndex: 0, answers: {}, firstAttemptCorrect: {}, submitted: false, score: null, correctas: null, fecha: null, banco: BANCO_EXAMEN };
        },
        /* Un examen ya presentado se respeta aunque su `order` venga vacío (así
           lo siembra la cuenta demo); uno en curso necesita un orden completo. */
        valido: function (st, reactivos) {
            return !!(st && Array.isArray(st.order) && (st.submitted || st.order.length === reactivos.length));
        },
        /* Traduce un examen guardado con el banco anterior. Regresa un objeto
           nuevo (no toca el original). Sin `v1` en el banco, o ya traducido,
           regresa el mismo estado. */
        migrar: function (st, reactivos) {
            if (!st || !Array.isArray(reactivos) || st.banco === BANCO_EXAMEN) return st;
            if (!reactivos.some(function (r) { return Array.isArray(r.v1); })) return st;
            var respPrev = st.answers || {}, facPrev = st.firstAttemptCorrect || {}, ordenPrev = {};
            (st.order || []).forEach(function (o) { if (o) ordenPrev[o.qIndex] = o.optionOrder; });
            var out = {};
            Object.keys(st).forEach(function (k) { out[k] = st[k]; });
            out.order = []; out.answers = {}; out.firstAttemptCorrect = {}; out.banco = BANCO_EXAMEN;
            reactivos.forEach(function (r, n) {
                var previos = Array.isArray(r.v1) ? r.v1 : [];
                var mismo = r.tipo !== 'relacionar' && previos.length === 1;
                if (mismo && respPrev[previos[0]] !== undefined) out.answers[n] = respPrev[previos[0]];
                var fac = previos.map(function (o) { return facPrev[o]; }).filter(function (v) { return v !== undefined; });
                if (mismo && fac.length) out.firstAttemptCorrect[n] = fac[0];
                /* Pregunta que cambió de forma: solo se conserva que ese tema se falló
                   (para "Temas que repasaste" y "Para ti"); su primer intento nuevo cuenta. */
                else if (!mismo && fac.indexOf(false) >= 0) out.firstAttemptCorrect[n] = false;
                var ids = r.opciones.map(function (_, i) { return i; });
                var prev = mismo ? ordenPrev[previos[0]] : null;
                out.order.push({ qIndex: n, optionOrder: Array.isArray(prev) && prev.length === ids.length ? prev : ids });
            });
            if (st.submitted) {
                out.correctas = reactivos.length;
            } else {
                var i = 0;
                while (i < reactivos.length - 1 && esCorrecta(reactivos[i], out.answers[i])) i++;
                out.currentIndex = i;
            }
            return out;
        },
        actual: function (st) { return st.order[st.currentIndex]; },
        responder: function (st, qIndex, resp, reactivos) {
            var ok = esCorrecta(reactivos[qIndex], resp);
            if (st.firstAttemptCorrect[qIndex] === undefined) st.firstAttemptCorrect[qIndex] = ok;
            st.answers[qIndex] = resp;
            return ok;
        },
        reintentar: function (st, qIndex) { delete st.answers[qIndex]; return st; },
        /* La pregunta actual quedó mal contestada: se limpia para intentarla
           otra vez (regreso de un repaso). */
        limpiarIncorrecta: function (st, reactivos) {
            var a = st.order[st.currentIndex];
            if (!st.submitted && a && st.answers[a.qIndex] !== undefined && reactivos[a.qIndex] && !esCorrecta(reactivos[a.qIndex], st.answers[a.qIndex])) {
                delete st.answers[a.qIndex]; return true;
            }
            return false;
        },
        siguiente: function (st, reactivos) {
            if (st.currentIndex + 1 < reactivos.length) { st.currentIndex++; return 'siguiente'; }
            return 'fin';
        },
        finalizar: function (st, reactivos, fecha) {
            st.submitted = true; st.correctas = reactivos.length; st.score = 100;
            st.fecha = fecha || new Date().toISOString().split('T')[0];
            return st;
        },
        temasRepasados: function (st, reactivos) {
            var vistos = {}, out = [];
            reactivos.forEach(function (r, i) { if (st.firstAttemptCorrect[i] === false && !vistos[r.tema]) { vistos[r.tema] = true; out.push(r.tema); } });
            return out;
        }
    };

    var api = { crear: crear, MOTIVO: MOTIVO, UMBRAL_DIAGNOSTICO: UMBRAL_DIAGNOSTICO, semillaDesdeAutodiagnostico: semillaDesdeAutodiagnostico,
        prepararPregunta: prepararPregunta, revisarPares: revisarPares, barajar: barajar, examen: examen };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.EstudioLogica = api;
})(typeof window !== 'undefined' ? window : this);
