-- =====================================================================
-- Política de UPDATE para capturar el monto cobrado — 20 sep 2026
--
-- Lo pide el renglón 7 del diagnóstico ("⚠️ sin política de UPDATE").
-- Sin esto, el campo "cobrado" de admin-precios.html no guarda nada: el
-- UPDATE se va en silencio como "0 filas afectadas".
--
-- ⚠️ AQUÍ NO HAY UN SOLO `$$`. Una versión anterior traía un bloque
--    DO ... $$ y el editor de Supabase lo cortaba a media función
--    ("unterminated dollar-quoted string"): ese editor parte el texto por
--    `;` y el dollar-quoting lo confunde. Esto es un solo CREATE POLICY.
--
-- ⚠️ ESTE ARCHIVO NO ES el de la función. autorizar_registro_inicial() ya
--    está instalada y funcionando; volver a correr ESE archivo es lo que
--    daba el error de `$$`. No hace falta.
--
-- is_admin(check_email text) es la firma que ya usa el sitio
-- (auth.js -> rpc('is_admin', { check_email })). Si aun así no existiera
-- con esa firma, abajo está el plan B.
--
-- PROBADO CONTRA UN POSTGRES 16 REAL antes de mandarlo:
--   · sin la política, el UPDATE como 'authenticated' da "UPDATE 0";
--   · con ella, "UPDATE 1" y el monto queda guardado;
--   · una sesión que NO es admin sigue sin poder cambiarlo ("UPDATE 0").
-- =====================================================================


-- =====================================================================
-- ESTO ES TODO. Una sola instrucción. Pégala en una pestaña VACÍA y Run.
-- Debe responder: CREATE POLICY
-- =====================================================================

create policy "admins actualizan montos cobrados"
  on public.candidatos_fase_pagos for update to authenticated
  using (public.is_admin(auth.jwt() ->> 'email'))
  with check (public.is_admin(auth.jwt() ->> 'email'));


-- Comprobación: deben salir cuatro (SELECT, INSERT, UPDATE, DELETE).
select cmd, policyname from pg_policies
 where schemaname = 'public' and tablename = 'candidatos_fase_pagos'
 order by cmd;


-- =====================================================================
-- SI LO DE ARRIBA FALLA con "function is_admin(text) does not exist",
-- es que el proyecto usa otra firma. Entonces corre ESTO, que imprime la
-- instrucción ya armada copiando el permiso de la política de INSERT que
-- la tabla ya tiene, y pega el resultado:
-- =====================================================================
--
-- select format(
--   'create policy "admins actualizan montos cobrados" on public.candidatos_fase_pagos for update to %s using (%s) with check (%s);',
--   (select string_agg(quote_ident(r), ', ') from unnest(p.roles) as r),
--   coalesce(p.with_check, p.qual), coalesce(p.with_check, p.qual))
-- from pg_policies p
-- where p.schemaname='public' and p.tablename='candidatos_fase_pagos' and p.cmd='INSERT'
-- limit 1;


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


-- QUIÉNES SON, con nombre (probado contra un Postgres 16 real).
-- Empieza por las de 'registro': son las de dos abonos.

select
  coalesce(c.nombre, pr.nombre, '(sin nombre)') as candidato,
  p.email,
  p.fase,
  p.origen,
  p.autorizado_en::date                         as liberada_el,
  case p.fase
    when 'registro'   then pr.monto_registro
    when 'alineacion' then pr.monto_alineacion
    when 'evaluacion' then pr.monto_evaluacion
    when 'entrega'    then pr.monto_entrega
  end                                           as se_esta_contando
from candidatos_fase_pagos p
left join candidatos_precio pr on lower(pr.email) = lower(p.email)
left join auth.users u        on lower(u.email)  = lower(p.email)
left join candidatos_ec1375 c on c.user_id = u.id
where p.monto is null
  and coalesce(p.origen, 'manual') <> 'registro-50'
order by (p.fase = 'registro') desc, p.autorizado_en desc;

-- Capturar el monto: en admin-precios.html, debajo del precio de esa fase.
-- A quien ya pagó completo, escríbele el precio de lista tal cual; a quien
-- va a medias, lo que de verdad entró.
-- =====================================================================
