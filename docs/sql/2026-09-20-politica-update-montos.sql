-- =====================================================================
-- Política de UPDATE para capturar el monto cobrado — 20 sep 2026
--
-- Lo pide el renglón 7 del diagnóstico ("⚠️ sin política de UPDATE").
-- Sin esto, el campo "cobrado" de admin-precios.html no guarda nada: el
-- UPDATE se va en silencio como "0 filas afectadas".
--
-- ⚠️ VA EN DOS PASOS, Y NINGUNO USA `$$`.
--    La primera versión de este archivo traía un bloque DO ... $$ y el
--    editor de Supabase lo cortó a media función ("unterminated
--    dollar-quoted string"): ese editor parte el texto por `;` y el
--    dollar-quoting lo confunde. Así que aquí no hay un solo `$$`: el
--    PASO 1 es un SELECT que IMPRIME el statement, y el PASO 2 es pegar
--    esa línea y correrla. A prueba de editor.
--
-- NO SE ADIVINA LA FIRMA DE is_admin(): el PASO 1 copia el predicado de la
-- política de INSERT que la tabla ya tiene (la del badge de liberar
-- fases), así que actualizar queda igual de restringido que insertar.
--
-- PROBADO CONTRA UN POSTGRES 16 REAL antes de mandarlo:
--   · sin la política, el UPDATE como 'authenticated' da "UPDATE 0";
--   · con ella, "UPDATE 1" y el monto queda guardado;
--   · una sesión que NO es admin sigue sin poder cambiarlo ("UPDATE 0").
-- =====================================================================


-- =====================================================================
-- PASO 1 — Córrelo tal cual. NO crea nada: solo imprime una línea.
--          Copia el contenido de la celda que devuelve.
-- =====================================================================

select format(
  'create policy "admins actualizan montos cobrados" on public.candidatos_fase_pagos for update to %s using (%s) with check (%s);',
  (select string_agg(quote_ident(r), ', ') from unnest(p.roles) as r),
  coalesce(p.with_check, p.qual),
  coalesce(p.with_check, p.qual)
) as copia_esta_linea_y_correla
from pg_policies p
where p.schemaname = 'public'
  and p.tablename  = 'candidatos_fase_pagos'
  and p.cmd        = 'INSERT'
limit 1;


-- =====================================================================
-- PASO 2 — Pega aquí la línea que te dio el PASO 1 y córrela.
--          Debe responder "CREATE POLICY". Se verá parecido a:
--
--   create policy "admins actualizan montos cobrados"
--     on public.candidatos_fase_pagos for update to authenticated
--     using (is_admin(...)) with check (is_admin(...));
--
--   (El predicado real sale de TU política de INSERT; no lo edites.)
-- =====================================================================


-- =====================================================================
-- PASO 3 — Comprobación. Deben salir cuatro: SELECT, INSERT, UPDATE, DELETE.
-- =====================================================================

select cmd, policyname, roles::text, coalesce(with_check, qual) as predicado
  from pg_policies
 where schemaname = 'public' and tablename = 'candidatos_fase_pagos'
 order by cmd;


-- =====================================================================
-- LAS 40 FASES SIN MONTO CAPTURADO (renglón 10 del diagnóstico)
--
-- Se están contando al PRECIO DE LISTA. Ojo: no son 40 errores, son 40
-- desconocidos. Donde la fase se pagó completa, el precio de lista es
-- correcto y no hay nada que hacer. El problema está donde se pagó a
-- medias, que por tu proceso es sobre todo 'registro' (dos abonos de 50%).
-- =====================================================================

select
  p.fase,
  count(*)                                            as fases_sin_capturar,
  sum(case p.fase
        when 'registro'   then coalesce(pr.monto_registro,   0)
        when 'alineacion' then coalesce(pr.monto_alineacion, 0)
        when 'evaluacion' then coalesce(pr.monto_evaluacion, 0)
        when 'entrega'    then coalesce(pr.monto_entrega,    0)
      end)                                            as se_esta_reportando,
  case when p.fase = 'registro'
       then 'Aquí está el riesgo: son dos abonos de 50%'
       else 'Normalmente se paga completa; revisa solo las dudosas' end as nota
from candidatos_fase_pagos p
left join candidatos_precio pr on lower(pr.email) = lower(p.email)
where p.monto is null
  and coalesce(p.origen, 'manual') <> 'registro-50'
group by p.fase
order by 3 desc nulls last;


-- El detalle, para ir capturando (empieza por las de 'registro'):

select p.email, p.fase, p.origen, p.autorizado_en,
       case p.fase
         when 'registro'   then pr.monto_registro
         when 'alineacion' then pr.monto_alineacion
         when 'evaluacion' then pr.monto_evaluacion
         when 'entrega'    then pr.monto_entrega
       end as precio_de_lista
from candidatos_fase_pagos p
left join candidatos_precio pr on lower(pr.email) = lower(p.email)
where p.monto is null and coalesce(p.origen, 'manual') <> 'registro-50'
order by (p.fase = 'registro') desc, p.autorizado_en desc;

-- Capturar el monto: en admin-precios.html, debajo del precio de esa fase.
-- A quien ya pagó completo, escríbele el precio de lista tal cual; a quien
-- va a medias, lo que de verdad entró.
-- =====================================================================
